/**
 * 特色数据资源域（special-data）：
 * 涨跌停与炸板数据、同花顺热榜、个股异动原因与龙虎榜。
 *
 * 统一前缀：GET /api/a-share/special-data/*
 */
import type { FuyaoHttpClient } from '../http';
import { assertNoComma, validateRequired } from './aShare';
import type {
  AnomalyAnalysisData,
  AnomalyTag,
  ApiResponse,
  DragonTigerListData,
  HotStockHistoryData,
  HotStockListData,
  LimitBreakPoolData,
  LimitDownPoolData,
  LimitUpLadderData,
  LimitUpPoolData,
  RankTrendData,
} from '../types';

/** 池类接口（涨/跌停、炸板）共用分页与排序入参。 */
export interface PoolQueryParams {
  /** 查询交易日毫秒戳（Asia/Shanghai 零点）；省略时取服务端当前自然日。 */
  dateMs?: number;
  /** 页码，必须 >=1，默认 1。 */
  page?: number;
  /** 分页大小，范围 1..200，默认 50。 */
  size?: number;
  /** 排序字段（各接口白名单不同）。 */
  sortField?: string;
  /** 排序方向 asc/desc，默认 desc。 */
  sortDir?: 'asc' | 'desc';
}

/** 涨停池排序字段白名单。 */
export type LimitUpSortField =
  | 'last_price'
  | 'continue_day_cnt'
  | 'seal_money'
  | 'limit_up_time';

/** 跌停池排序字段白名单。 */
export type LimitDownSortField =
  | 'last_limit_time'
  | 'first_limit_time'
  | 'last_price'
  | 'price_change_ratio_pct'
  | 'turnover_ratio_pct';

/** 炸板池排序字段白名单。 */
export type LimitBreakSortField =
  | 'price_change_ratio_pct'
  | 'open_times'
  | 'last_price'
  | 'turnover_ratio_pct'
  | 'turnover';

/**
 * 客户端侧校验池类接口的分页约束（page>=1、size∈[1,200]）。
 *
 * @throws {TypeError} 越界时抛出。
 * @internal
 */
function validatePoolPaging(params: PoolQueryParams, method: string): void {
  if (params.page !== undefined && params.page < 1) {
    throw new TypeError(`${method}: page must be >= 1`);
  }
  if (params.size !== undefined && (params.size < 1 || params.size > 200)) {
    throw new TypeError(`${method}: size must be within [1, 200]`);
  }
}

/** 组装池类接口 query。@internal */
function poolQuery(params: PoolQueryParams): Record<string, unknown> {
  return {
    date_ms: params.dateMs,
    page: params.page,
    size: params.size,
    sort_field: params.sortField,
    sort_dir: params.sortDir,
  };
}

/**
 * 特色数据资源。
 *
 * 由 FuyaoClient 以 `client.specialData` 暴露。
 */
export class SpecialDataResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /* ---------------- 涨跌停与炸板 ---------------- */

  /**
   * 涨停股票池：按交易日返回涨停/连板股票池，支持分页与排序。
   *
   * `GET /api/a-share/special-data/limit-up-pool`
   *
   * @param params.sortField 白名单 last_price|continue_day_cnt|seal_money|limit_up_time，
   *        默认 last_price；非法值服务端返回 code=1002。
   */
  limitUpPool(params: PoolQueryParams & { sortField?: LimitUpSortField } = {}): Promise<ApiResponse<LimitUpPoolData>> {
    validatePoolPaging(params, 'specialData.limitUpPool');
    return this.http.get<LimitUpPoolData>('/api/a-share/special-data/limit-up-pool', poolQuery(params));
  }

  /**
   * 跌停股票池。
   *
   * `GET /api/a-share/special-data/limit-down-pool`
   *
   * @param params.sortField 默认 last_limit_time。
   */
  limitDownPool(params: PoolQueryParams & { sortField?: LimitDownSortField } = {}): Promise<ApiResponse<LimitDownPoolData>> {
    validatePoolPaging(params, 'specialData.limitDownPool');
    return this.http.get<LimitDownPoolData>('/api/a-share/special-data/limit-down-pool', poolQuery(params));
  }

  /**
   * 炸板股票池。
   *
   * `GET /api/a-share/special-data/limit-break-pool`
   *
   * @param params.sortField 默认 price_change_ratio_pct。
   */
  limitBreakPool(params: PoolQueryParams & { sortField?: LimitBreakSortField } = {}): Promise<ApiResponse<LimitBreakPoolData>> {
    validatePoolPaging(params, 'specialData.limitBreakPool');
    return this.http.get<LimitBreakPoolData>('/api/a-share/special-data/limit-break-pool', poolQuery(params));
  }

  /**
   * 连板天梯：近 30 个交易日的连板梯队矩阵（日期 → 六个板位 → 股票列表），无入参。
   *
   * `GET /api/a-share/special-data/limit-up-ladder`
   */
  limitUpLadder(): Promise<ApiResponse<LimitUpLadderData>> {
    return this.http.get<LimitUpLadderData>('/api/a-share/special-data/limit-up-ladder');
  }

  /* ---------------- 同花顺热榜 ---------------- */

  /**
   * 飙升榜 Top30。
   *
   * `GET /api/a-share/special-data/skyrocket-list`
   *
   * @param params.period day=日榜（默认）/ hour=小时榜；非法值返回 code=1002。
   */
  skyrocketList(params: { period?: 'day' | 'hour' } = {}): Promise<ApiResponse<HotStockListData>> {
    return this.http.get<HotStockListData>('/api/a-share/special-data/skyrocket-list', {
      period: params.period,
    });
  }

  /**
   * A 股热股榜单 Top30。
   *
   * `GET /api/a-share/special-data/hot-stock-list`
   *
   * @param params.period day=24 小时级别（默认）/ hour=小时级别。
   */
  hotStockList(params: { period?: 'day' | 'hour' } = {}): Promise<ApiResponse<HotStockListData>> {
    return this.http.get<HotStockListData>('/api/a-share/special-data/hot-stock-list', {
      period: params.period,
    });
  }

  /**
   * 历史热股排行：按自然日返回历史热股榜（最多 30 条）。
   *
   * `GET /api/a-share/special-data/hot-stock-list-history`
   *
   * @param params.date 必填 `yyyy-MM-dd`，仅支持一年内数据（越界 code=1003）。
   */
  hotStockListHistory(params: { date: string }): Promise<ApiResponse<HotStockHistoryData>> {
    validateRequired(params, ['date'], 'specialData.hotStockListHistory');
    assertDate(params.date, 'date', 'specialData.hotStockListHistory');
    return this.http.get<HotStockHistoryData>(
      '/api/a-share/special-data/hot-stock-list-history',
      { date: params.date },
    );
  }

  /**
   * 个股排名走势：单只 A 股一段自然日窗口内的热榜排名走势（不做 Top30 截断）。
   *
   * `GET /api/a-share/special-data/hot-stock-rank-trend`
   *
   * @param params.thscode 必填。
   * @param params.startDate 必填 `yyyy-MM-dd`。
   * @param params.endDate 必填 `yyyy-MM-dd`，需 ≥ startDate；窗口 ≤ 一年
   *        （start > end 服务端返回 code=1004）。
   */
  hotStockRankTrend(params: {
    thscode: string;
    startDate: string;
    endDate: string;
  }): Promise<ApiResponse<RankTrendData>> {
    validateRequired(params, ['thscode', 'startDate', 'endDate'], 'specialData.hotStockRankTrend');
    assertNoComma(params.thscode, 'thscode');
    assertDate(params.startDate, 'startDate', 'specialData.hotStockRankTrend');
    assertDate(params.endDate, 'endDate', 'specialData.hotStockRankTrend');
    if (params.startDate > params.endDate) {
      throw new TypeError('hotStockRankTrend: startDate must be <= endDate');
    }
    return this.http.get<RankTrendData>(
      '/api/a-share/special-data/hot-stock-rank-trend',
      { thscode: params.thscode, start_date: params.startDate, end_date: params.endDate },
    );
  }

  /* ---------------- 个股异动原因 ---------------- */

  /**
   * 当日个股异动原因列表，可按异动标签过滤（OR 关系，大小写不敏感）。
   * 该接口仅提供 REST API，无对应 MCP 工具。
   *
   * `GET /api/a-share/special-data/anomaly-analysis-list`
   *
   * @param params.tagCodes 合法值见 {@link AnomalyTag}；
   *        未知值或空 token 服务端返回 code=1002。
   */
  anomalyAnalysisList(params: { tagCodes?: AnomalyTag[] | string } = {}): Promise<ApiResponse<AnomalyAnalysisData>> {
    return this.http.get<AnomalyAnalysisData>(
      '/api/a-share/special-data/anomaly-analysis-list',
      { tag_codes: params.tagCodes },
    );
  }

  /**
   * 按股票批量查询当日个股异动原因（最多 50 个 token，去重前计数）。
   *
   * `GET /api/a-share/special-data/anomaly-analysis-stock`
   *
   * 缺失 → 1001；空 token/格式非法 → 1002；超 50 → 1003；
   * 有快照但无匹配 → code=0 且 item=[]。
   */
  anomalyAnalysisStock(params: {
    thscodes: string | string[];
  }): Promise<ApiResponse<AnomalyAnalysisData>> {
    validateRequired(params, ['thscodes'], 'specialData.anomalyAnalysisStock');
    const tokens = Array.isArray(params.thscodes)
      ? params.thscodes
      : params.thscodes.split(',');
    if (tokens.length > 50) {
      throw new TypeError('anomalyAnalysisStock: at most 50 thscodes per request (before dedup)');
    }
    return this.http.get<AnomalyAnalysisData>(
      '/api/a-share/special-data/anomaly-analysis-stock',
      { thscodes: params.thscodes },
    );
  }

  /* ---------------- 龙虎榜 ---------------- */

  /**
   * 龙虎榜榜单：一个接口覆盖全部/机构榜/游资榜（board_type 区分），固定全量不分页。
   *
   * `GET /api/a-share/special-data/dragon-tiger-list`
   *
   * @param params.boardType all（默认）/ org / hot_money；非法值 code=1002。
   * @param params.date 目标交易日 `yyyy-MM-dd`，仅一年内；
   *        显式非交易日 → 1002；晚于今天或超一年 → 1003。
   *        省略时：今天为交易日则取上一交易日，否则取今天之前最近交易日。
   */
  dragonTigerList(
    params: {
      boardType?: 'all' | 'org' | 'hot_money';
      date?: string;
    } = {},
  ): Promise<ApiResponse<DragonTigerListData>> {
    if (params.date !== undefined) {
      assertDate(params.date, 'date', 'specialData.dragonTigerList');
    }
    return this.http.get<DragonTigerListData>(
      '/api/a-share/special-data/dragon-tiger-list',
      { board_type: params.boardType, date: params.date },
    );
  }
}

/**
 * 校验 yyyy-MM-dd 日期格式（客户端前置校验，与服务端 code=1002 行为对齐）。
 *
 * @internal
 */
function assertDate(value: string, field: string, method: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${method}: "${field}" must be formatted as yyyy-MM-dd`);
  }
}
