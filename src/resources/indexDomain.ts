/**
 * 指数数据资源域（a-share-index）：
 * 同花顺指数列表、成分股、指数行情快照与历史 K 线。
 *
 * 通用约定：thscode 入参由服务端 trim().toUpperCase() 标准化；
 * 除快照外均不接受逗号、单次仅支持一个指数。
 *
 * 端点清单：
 * - GET /api/a-share-index/catalog/ths-index-list
 * - GET /api/a-share-index/constituents/ths-stock-list
 * - GET /api/a-share-index/prices/snapshot
 * - GET /api/a-share-index/prices/historical
 */
import type { FuyaoHttpClient } from '../http';
import {
  assertNoComma,
  validateRequired,
} from './aShare';
import type {
  ApiResponse,
  IndexConstituentItem,
  IndexListData,
  PriceHistoricalData,
  PriceSnapshotData,
  ThsIndexListItem,
  ThsIndexTag,
} from '../types';

/**
 * 指数数据资源。
 *
 * 由 FuyaoClient 以 `client.index` 暴露。
 * 覆盖上证指数（000001.SH）、深证指数（399001.SZ）、同花顺板块（886042.TI）
 * 与同花顺行业指数（881101.TI）等标的宇宙。
 */
export class IndexResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 同花顺指数列表：按 tag 全量返回，无分页参数。
   *
   * `GET /api/a-share-index/catalog/ths-index-list`
   *
   * @param params.tag 标签：cn_concept(概念，默认)/region/tszs/industry；大小写不敏感。
   * @returns 信封，data.item 为 `{ thscode, name }[]`（指数维度不暴露 ticker）。
   */
  catalogThsIndexList(
    params: { tag?: ThsIndexTag } = {},
  ): Promise<ApiResponse<IndexListData<ThsIndexListItem>>> {
    return this.http.get<IndexListData<ThsIndexListItem>>(
      '/api/a-share-index/catalog/ths-index-list',
      { tag: params.tag },
    );
  }

  /**
   * 指数成分股清单（支持同花顺指数与沪深 300 等标准指数）。
   *
   * `GET /api/a-share-index/constituents/ths-stock-list`
   *
   * @param params.thscode 必填单只指数 thscode，如 `886042.TI` 或 `000300.SH`。
   * @returns 信封，data.item 为 `{ thscode, ticker, name }[]`。
   */
  constituentsThsStockList(params: {
    thscode: string;
  }): Promise<ApiResponse<IndexListData<IndexConstituentItem>>> {
    validateRequired(params, ['thscode'], 'index.constituentsThsStockList');
    assertNoComma(params.thscode, 'thscode');
    return this.http.get<IndexListData<IndexConstituentItem>>(
      '/api/a-share-index/constituents/ths-stock-list',
      { thscode: params.thscode },
    );
  }

  /**
   * 指数行情快照：必须传 thscodes，不支持空入参枚举全指数；
   * limit/offset 对本接口无效（仅签名对齐保留），SDK 不透传。
   *
   * `GET /api/a-share-index/prices/snapshot`
   *
   * @param params.thscodes 必填逗号分隔指数代码或多元素数组。
   */
  pricesSnapshot(params: {
    thscodes: string | string[];
  }): Promise<ApiResponse<PriceSnapshotData>> {
    validateRequired(params, ['thscodes'], 'index.pricesSnapshot');
    return this.http.get<PriceSnapshotData>(
      '/api/a-share-index/prices/snapshot',
      { thscodes: params.thscodes },
    );
  }

  /**
   * 单只指数历史 K 线。仅支持 start/end 区间模式，窗口 ≤10 年；
   * 指数无复权语义（无 adjust 参数），亦无 offset 分页参数。
   *
   * `GET /api/a-share-index/prices/historical`
   *
   * @returns 信封，data 为 `{ timestamp, adjust: null, item: PriceBarItem[] }`。
   */
  pricesHistorical(params: {
    thscode: string;
    interval?: '1d';
    start: number;
    end: number;
  }): Promise<ApiResponse<PriceHistoricalData>> {
    validateRequired(params, ['thscode', 'start', 'end'], 'index.pricesHistorical');
    assertNoComma(params.thscode, 'thscode');
    if (
      typeof params.start === 'number' &&
      typeof params.end === 'number' &&
      params.end < params.start
    ) {
      throw new TypeError('index.pricesHistorical: end must be >= start');
    }
    return this.http.get<PriceHistoricalData>(
      '/api/a-share-index/prices/historical',
      {
        thscode: params.thscode,
        interval: params.interval ?? '1d',
        start: params.start,
        end: params.end,
      },
    );
  }
}
