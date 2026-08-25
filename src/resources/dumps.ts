/**
 * 全市场数据导出资源域（market-dumps）。
 *
 * 提供三种 Parquet 全库导出的短时 S3 预签名下载链接：
 * - 10 年全量日 K（dump_id: a_share_daily_k_1d_none_10y）
 * - 最近 10 交易日日 K（dump_id: a_share_daily_k_1d_none_10d）
 * - 复权因子全量事件（dump_id: a_share_adjustment_factors_event_none_all）
 *
 * 注意：预签名链接有效期非常短（通常约 5 分钟），不可持久化或缓存，
 * 每次下载前应重新获取。
 */
import type { FuyaoHttpClient } from '../http';
import type { ApiResponse } from '../types';

/** dump 种类。 */
export type DumpKind = 'daily-k' | 'daily-k-10d' | 'adjustment-factors';

/**
 * dump 种类到 API Key 下载端点的映射。
 * 浏览器入口为 /dump/market-dumps/<kind>/download-url（Cookie 认证），
 * API 客户端统一使用 /api/dump/... 前缀。
 */
const DUMP_ENDPOINTS: Record<DumpKind, string> = {
  'daily-k': '/api/dump/market-dumps/daily-k/download-url',
  'daily-k-10d': '/api/dump/market-dumps/daily-k-10d/download-url',
  'adjustment-factors': '/api/dump/market-dumps/adjustment-factors/download-url',
};

/**
 * 全市场数据导出资源。
 *
 * 由 FuyaoClient 以 `client.dumps` 暴露。
 */
export class DumpsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 按 dump 种类获取预签名下载链接信封。
   *
   * `GET /api/dump/market-dumps/<kind>/download-url`
   *
   * @typeParam T - 服务端 data 容器类型（含预签名链接字段），由调用方指定或使用便捷方法。
   * @param kind - dump 种类。
   * @returns 完整响应信封；链接位于 data 内且短时有效。
   */
  downloadUrl<T = unknown>(kind: DumpKind): Promise<ApiResponse<T>> {
    const endpoint = DUMP_ENDPOINTS[kind];
    if (!endpoint) throw new TypeError(`Unknown dump kind: ${String(kind)}`);
    return this.http.get<T>(endpoint);
  }

  /**
   * 获取「A 股全市场约 10 年日 K」Parquet 下载链接。
   * dump_id：`a_share_daily_k_1d_none_10y`。
   */
  dailyKDownloadUrl<T = unknown>(): Promise<ApiResponse<T>> {
    return this.downloadUrl<T>('daily-k');
  }

  /**
   * 获取「最近 10 个交易日日 K」Parquet 下载链接。
   * dump_id：`a_share_daily_k_1d_none_10d`。
   */
  dailyK10dDownloadUrl<T = unknown>(): Promise<ApiResponse<T>> {
    return this.downloadUrl<T>('daily-k-10d');
  }

  /**
   * 获取「复权因子全量事件」Parquet 下载链接。
   * dump_id：`a_share_adjustment_factors_event_none_all`。
   */
  adjustmentFactorsDownloadUrl<T = unknown>(): Promise<ApiResponse<T>> {
    return this.downloadUrl<T>('adjustment-factors');
  }
}
