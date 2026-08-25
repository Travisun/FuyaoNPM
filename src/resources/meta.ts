/**
 * 基础数据资源域（Meta）：标的检索与标的列表获取。
 *
 * 端点：
 * - GET /api/meta/tickers/search
 * - GET /api/meta/tickers/list
 */
import type { FuyaoHttpClient } from '../http';
import type {
  AssetType,
  ApiResponse,
  ExchangeFilter,
  TickerListData,
} from '../types';

/** {@link MetaResource.search} 的入参。 */
export interface TickerSearchParams {
  /** 搜索关键词：完整 thscode、ticker 代码或中英文名称（支持子串匹配）。必填。 */
  q: string;
  /** 交易所过滤：SH / SZ / BJ；场外基金不参与该过滤。 */
  exchange?: ExchangeFilter;
  /**
   * 规范化资产类型，支持单值或逗号分隔多值。
   * 非法值服务端返回 code=1003。
   */
  assetType?: AssetType | AssetType[];
  /** 返回上限，最大 50；默认 10。 */
  limit?: number;
}

/** {@link MetaResource.listTickers} 的入参。 */
export interface TickerListParams {
  /** 规范化资产类型，支持单值或逗号分隔多值；省略时返回全部类型。 */
  assetType?: AssetType | AssetType[];
  /** 单页条数，最大 10000；默认 1000。 */
  limit?: number;
  /** 分页偏移；默认 0。循环递增直至 item.length < limit 取尽。 */
  offset?: number;
}

/**
 * 元信息域资源：标的检索与代码表批量获取。
 *
 * 由 {@link import('../client').FuyaoClient} 以 `client.meta` 暴露。
 */
export class MetaResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 标的检索：按关键词（thscode / ticker / 中英文名称）跨市场消歧。
   *
   * `GET /api/meta/tickers/search`
   *
   * @param params.q 必填关键词。
   * @param params.exchange 可选交易所过滤。
   * @param params.assetType 可选资产类型（单值或数组）。
   * @param params.limit 可选上限（默认 10，最大 50）。
   * @returns 信封，data 为 `{ timestamp, item: TickerItem[] }`。
   * @example
   * ```ts
   * const res = await client.meta.search({ q: '贵州茅台' });
   * console.log(res.data?.item[0]?.thscode); // '600519.SH'
   * ```
   */
  search(params: TickerSearchParams): Promise<ApiResponse<TickerListData>> {
    if (typeof params?.q !== 'string' || params.q.length === 0) {
      throw new TypeError('params.q is required');
    }
    return this.http.get<TickerListData>('/api/meta/tickers/search', {
      q: params.q,
      exchange: params.exchange,
      asset_type: params.assetType,
      limit: params.limit,
    });
  }

  /**
   * 标的列表获取：按资产类型分页批量拉取代码表。
   *
   * `GET /api/meta/tickers/list`
   *
   * 分页约定：offset/limit 分页，`item.length < limit` 即已取尽；
   * 可配合 {@link MetaResource.iterateAllTickers} 自动翻页。
   *
   * @returns 信封，data 为 `{ timestamp, item: TickerItem[] }`。
   */
  listTickers(params: TickerListParams = {}): Promise<ApiResponse<TickerListData>> {
    return this.http.get<TickerListData>('/api/meta/tickers/list', {
      asset_type: params.assetType,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * 自动翻页迭代器：逐条产出标的，直到取尽全部代码表。
   *
   * @param params.assetType 资产类型过滤。
   * @param params.pageSize 每页条数，默认 1000（上限 10000）。
   * @yields {TickerItem} 单个标的信息。
   * @throws {FuyaoApiError} 任一页业务失败时抛出。
   * @example
   * ```ts
   * for await (const t of client.meta.iterateAllTickers({ assetType: 'a-share' })) {
   *   // 处理每个标的
   * }
   * ```
   */
  async *iterateAllTickers(
    params: { assetType?: AssetType | AssetType[]; pageSize?: number } = {},
  ): AsyncGenerator<Awaited<TickerListData['item'][number]>> {
    const pageSize = Math.min(Math.max(params.pageSize ?? 1000, 1), 10_000);
    let offset = 0;
    // 循环递增 offset 直到返回数量小于单页上限，即认为取尽。
    for (;;) {
      const res = await this.listTickers({
        assetType: params.assetType,
        limit: pageSize,
        offset,
      });
      const items = res.data?.item ?? [];
      yield* items;
      if (items.length < pageSize) return;
      offset += items.length;
    }
  }
}
