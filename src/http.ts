import {
  assertEnvelopeOk,
  FuyaoHttpError,
  FuyaoTimeoutError,
} from './errors';
import type { ApiResponse } from './types';

/** 可注入的 fetch 兼容函数签名（便于测试与自定义 HTTP 栈）。 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** FuyaoClient 构造选项。 */
export interface FuyaoClientOptions {
  /**
   * API Key（必填）。在 https://fuyao.aicubes.cn/admin 签发。
   * 将以请求头 `X-api-key` 携带。
   */
  apiKey: string;
  /** 服务基地址，默认官方地址。可指向代理或私有部署。 */
  baseUrl?: string;
  /** 单次请求超时毫秒数；超时抛出 {@link FuyaoTimeoutError}。默认 30000。 */
  timeoutMs?: number;
  /**
   * 全局限速：两次请求发起之间的最小间隔毫秒数（跨所有资源域共享一个队列）。
   *
   * 上游对 QPS 敏感：过快请求可能触发 `code=4001` 限频，甚至间歇性返回空数据或
   * `5003`。批量调用场景建议设置 200–500（即约 2–5 QPS）。默认 0（不限速）。
   */
  intervalMs?: number;
  /**
   * 自定义 fetch 实现（Node 18+ 自带全局 fetch）。
   * 用于测试注入或对接 axios/undici 等自定义传输层。
   */
  fetch?: FetchLike;
}

/**
 * 校验并规范化 baseUrl：去除尾部斜杠。
 *
 * @internal
 */
function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) throw new TypeError('baseUrl must be a non-empty string');
  return baseUrl.replace(/\/+$/, '');
}

/**
 * fuyao 同花顺金融数据 API 客户端核心。
 *
 * 负责：
 * - 拼接 URL 与 query 序列化（自动跳过 undefined/null 值）
 * - 注入 `X-api-key` 认证头
 * - 超时控制
 * - 统一信封解析与业务错误抛出（code !== 0 → {@link FuyaoApiError}）
 *
 * 业务能力按资源域组织在子资源对象上：
 * `client.meta` / `client.dumps` / `client.aShare` / `client.index` /
 * `client.specialData` / `client.funds`。
 */
export class FuyaoHttpClient {
  /** 规范化后的基地址。 */
  readonly baseUrl: string;
  /** API Key。 */
  private readonly apiKey: string;
  /** 请求超时毫秒数。 */
  private readonly timeoutMs: number;
  /** 全局最小请求间隔毫秒数；0 表示不限速。 */
  private readonly minIntervalMs: number;
  /** 上一次请求的发起时刻（限速基准）。 */
  private lastRequestAt = 0;
  /** 限速串行队列：保证并发调用按序排队计算等待时间。 */
  private rateChain: Promise<void> = Promise.resolve();
  /** 实际使用的 fetch 实现。 */
  private readonly fetchImpl: FetchLike;

  constructor(options: FuyaoClientOptions) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('FuyaoHttpClient requires an options object');
    }
    if (typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
      throw new TypeError('options.apiKey is required and must be a non-empty string');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'https://fuyao.aicubes.cn');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.minIntervalMs = Math.max(options.intervalMs ?? 0, 0);
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * 序列化 query 对象：跳过 undefined/null；数组以英文逗号连接。
   *
   * @internal
   */
  static buildQuery(params: Record<string, unknown>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      search.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    return search.toString();
  }

  /**
   * 发起 GET 请求并解析统一响应信封。
   *
   * @typeParam T - data 容器的期望类型。
   * @param path - 以 `/` 开头的接口路径。
   * @param params - query 参数（undefined/null 会被忽略）。
   * @returns 成功时返回完整信封（含 request_id）。
   * @throws {TypeError} path 非法。
   * @throws {FuyaoApiError} 业务 code 非 0。
   * @throws {FuyaoTimeoutError} 请求超时。
   * @throws {FuyaoHttpError} 网络/HTTP 层失败或信封格式非法。
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    if (!path.startsWith('/')) {
      throw new TypeError(`path must start with "/": got "${path}"`);
    }
    const query = FuyaoHttpClient.buildQuery(params ?? {});
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ''}`;

    // 全局限速：按队列顺序等待至距上次请求发起至少 minIntervalMs。
    await this.acquireRateSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { 'X-api-key': this.apiKey },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      // AbortController 触发的 abort 统一转为超时错误。
      if (err instanceof Error && err.name === 'AbortError') {
        throw new FuyaoTimeoutError(path, this.timeoutMs);
      }
      throw new FuyaoHttpError(
        `Network error requesting ${path}: ${err instanceof Error ? err.message : String(err)}`,
        path,
      );
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw new FuyaoHttpError(
        `Unexpected HTTP status ${response.status} for ${path}`,
        path,
        response.status,
      );
    }

    let envelope: ApiResponse<T>;
    try {
      envelope = (await response.json()) as ApiResponse<T>;
    } catch (err) {
      throw new FuyaoHttpError(
        `Failed to parse JSON response from ${path}: ${err instanceof Error ? err.message : String(err)}`,
        path,
        response.status,
      );
    }
    return assertEnvelopeOk(envelope, path);
  }

  /**
   * 限速槽位获取：串行排队，保证两次请求的「发起时刻」间隔不小于 minIntervalMs。
   *
   * 实现说明：通过 promise 链保证并发调用按到达顺序依次执行；每个调用方
   * 等待到 `lastRequestAt + minIntervalMs` 后更新时间戳并放行下一个排队者，
   * 因此请求发起间隔严格 ≥ intervalMs（超时计时在获得槽位后才开始，不受排队影响）。
   *
   * @internal
   */
  private async acquireRateSlot(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const prev = this.rateChain;
    let release!: () => void;
    this.rateChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestAt = Date.now();
    // 发起时刻已确定，放行下一个排队者（它同样会以最新 lastRequestAt 计算等待）。
    release();
  }
}
