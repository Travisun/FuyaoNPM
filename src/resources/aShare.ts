/**
 * A 股资源域：行情、除复权、财务报表、财务指标、交易日历、估值与集合竞价。
 *
 * 端点清单：
 * - GET /api/a-share/prices/snapshot
 * - GET /api/a-share/prices/historical
 * - GET /api/a-share/corporate-actions/adjustment-factors
 * - GET /api/a-share/financials/income-statements | balance-sheets | cash-flow-statements
 * - GET /api/a-share/financials/indicators
 * - GET /api/a-share/calendar/trading-days
 * - GET /api/a-share/valuations/snapshot
 * - GET /api/a-share/auction/snapshot | short-term-benchmark
 */
import type { FuyaoHttpClient } from '../http';
import type {
  AdjustMode,
  AdjustmentFactorsData,
  AnomalyAnalysisData,
  ApiResponse,
  AuctionSnapshotData,
  AuctionStage,
  BalanceSheetItem,
  CashFlowStatementItem,
  FinancialIndicatorsData,
  FinancialListData,
  FinancialPeriod,
  IncomeStatementItem,
  PriceBarItem,
  PriceHistoricalData,
  PriceSnapshotData,
  ShortTermBenchmarkData,
  TradingDaysData,
  ValuationSnapshotData,
} from '../types';

/* ------------------------------------------------------------------ */
/* 行情                                                                 */
/* ------------------------------------------------------------------ */

/** {@link PricesResource.snapshot} 入参。 */
export interface PriceSnapshotParams {
  /**
   * 逗号分隔的 thscode 列表（如 `600519.SH,000001.SZ`）。
   * 给定时按入参顺序批量取数且不分页；省略时遍历全市场并使用分页参数。
   */
  thscodes?: string | string[];
  /** 分页大小，仅在省略 thscodes 时生效，默认 100。 */
  limit?: number;
  /** 分页偏移，仅在省略 thscodes 时生效，默认 0。 */
  offset?: number;
}

/** {@link PricesResource.historical} 入参。 */
export interface PriceHistoricalParams {
  /** 单只标的 thscode（不接受逗号）。必填。 */
  thscode: string;
  /** K 线周期，当前仅支持 `1d`；默认 `1d`。 */
  interval?: '1d';
  /** 起始时间毫秒 Unix 时间戳。必填；缺失服务端返回 code=1001。 */
  start: number;
  /** 结束时间毫秒 Unix 时间戳。必填；窗口超 10 年返回 code=1003。 */
  end: number;
  /** 复权方式：none / forward(前复权) / backward(后复权)；默认 forward。 */
  adjust?: AdjustMode;
  /** 分页偏移，默认 0。 */
  offset?: number;
}

/**
 * A 股行情资源。
 *
 * 由 FuyaoClient 以 `client.aShare.prices` 暴露。
 */
export class PricesResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * A 股行情快照（单只/多只/全市场）。
   *
   * `GET /api/a-share/prices/snapshot`
   *
   * 注意：快照响应不返回中文名 name，需要展示名称时配合 meta.search/listTickers 解析。
   *
   * @returns 信封，data 为 `{ timestamp, total, item: PriceSnapshotItem[] }`。
   */
  snapshot(params: PriceSnapshotParams = {}): Promise<ApiResponse<PriceSnapshotData>> {
    return this.http.get<PriceSnapshotData>('/api/a-share/prices/snapshot', {
      thscodes: params.thscodes,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * 全市场行情快照自动翻页迭代器（仅在省略 thscodes 的分页模式下有效）。
   *
   * @param params.pageSize 每页条数，默认 100。
   * @yields {PriceSnapshotItem} 单条快照。
   */
  async *iterateAllSnapshot(
    params: { pageSize?: number } = {},
  ): AsyncGenerator<Awaited<PriceSnapshotData['item'][number]>> {
    const pageSize = Math.max(params.pageSize ?? 100, 1);
    let offset = 0;
    for (;;) {
      const res = await this.snapshot({ limit: pageSize, offset });
      const items = res.data?.item ?? [];
      yield* items;
      // total 为全市场代码表总数，可据此判断是否取尽；
      // 若服务端未返回 total 则回退为「本页不满一页即结束」。
      const total = res.data?.total;
      if (typeof total === 'number' && offset + items.length >= total) return;
      if (items.length < pageSize) return;
      offset += items.length;
    }
  }

  /**
   * 单只标的历史 K 线序列（日/周/月，当前仅日线）。
   *
   * `GET /api/a-share/prices/historical`
   *
   * 接口强约束：每次仅一个 thscode，[start,end] 窗口 ≤10 年。
   *
   * @returns 信封，data 为 `{ timestamp, item: PriceBarItem[] }`。
   */
  historical(params: PriceHistoricalParams): Promise<ApiResponse<PriceHistoricalData>> {
    validateRequired(params, ['thscode', 'start', 'end'], 'prices.historical');
    assertNoComma(params.thscode, 'thscode');
    return this.http.get<PriceHistoricalData>('/api/a-share/prices/historical', {
      thscode: params.thscode,
      interval: params.interval ?? '1d',
      start: params.start,
      end: params.end,
      adjust: params.adjust,
      offset: params.offset,
    });
  }
}

/* ------------------------------------------------------------------ */
/* 除复权                                                               */
/* ------------------------------------------------------------------ */

/** {@link CorporateActionsResource.adjustmentFactors} 入参。 */
export interface AdjustmentFactorsParams {
  /** 单只标的 thscode（不接受逗号）。必填。 */
  thscode: string;
  /** 事件起始日，`YYYY-MM-DD`。 */
  from?: string;
  /** 事件截止日，`YYYY-MM-DD`。 */
  to?: string;
}

/**
 * A 股除复权资源。
 *
 * 由 FuyaoClient 以 `client.aShare.corporateActions` 暴露。
 */
export class CorporateActionsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 复权因子事件流（分红/送股原始事件，供客户端自行推导复权因子）。
   *
   * `GET /api/a-share/corporate-actions/adjustment-factors`
   *
   * 响应不包含 event_type/record_date/adjust_factor；事件类型由
   * dividend_per_share 与 per_share_bonus 数值隐式区分。
   * 若仅需复权后价格，请改用 prices.historical 并传 adjust。
   *
   * @returns 信封，data 为 `{ thscode, ticker, item[] }`（按 ex_date_ms 降序）。
   */
  adjustmentFactors(
    params: AdjustmentFactorsParams,
  ): Promise<ApiResponse<AdjustmentFactorsData>> {
    validateRequired(params, ['thscode'], 'corporateActions.adjustmentFactors');
    assertNoComma(params.thscode, 'thscode');
    return this.http.get<AdjustmentFactorsData>(
      '/api/a-share/corporate-actions/adjustment-factors',
      { thscode: params.thscode, from: params.from, to: params.to },
    );
  }
}

/* ------------------------------------------------------------------ */
/* 财务                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 财务三表共用入参。
 *
 * 取数模式互斥二选一：
 * - 最近 N 期：只传 limit（或都不传，默认 4 期）
 * - 时间区间：同时传 start 与 end（毫秒戳闭区间）
 *
 * 同时传 start/end 与 limit、或仅传 start 或仅传 end → 服务端返回 code=1004；
 * SDK 会在客户端先行校验并抛出 TypeError，避免无效请求。
 */
export interface FinancialStatementParams {
  /** 单只标的 thscode（含交易所后缀，如 600519.SH）。必填。 */
  thscode: string;
  /** 报告期类型；默认 annual。 */
  period?: FinancialPeriod;
  /** 最近 N 期模式条数，范围 [1,20]；与 start/end 互斥。 */
  limit?: number;
  /** 时间区间模式起始毫秒戳，需与 end 同传。 */
  start?: number;
  /** 时间区间模式结束毫秒戳，需 ≥ start。 */
  end?: number;
}

/**
 * 校验财务三表取数模式约束（客户端侧前置校验）。
 *
 * @internal
 */
function validateFinancialMode(
  params: FinancialStatementParams,
  method: string,
): void {
  validateRequired(params, ['thscode'], method);
  assertNoComma(params.thscode, 'thscode');
  const hasRange = params.start !== undefined || params.end !== undefined;
  if (hasRange && (params.start === undefined || params.end === undefined)) {
    throw new TypeError(
      `${method}: start and end must be provided together (half-open range is not allowed)`,
    );
  }
  if (
    hasRange &&
    typeof params.start === 'number' &&
    typeof params.end === 'number' &&
    params.end < params.start
  ) {
    throw new TypeError(`${method}: end must be >= start`);
  }
  if (hasRange && params.limit !== undefined) {
    throw new TypeError(`${method}: limit conflicts with start/end (pick one mode)`);
  }
  if (params.limit !== undefined && (params.limit < 1 || params.limit > 20)) {
    throw new TypeError(`${method}: limit must be within [1, 20]`);
  }
}

/**
 * A 股财务报表资源（整体合并口径，三个端点入参契约一致）。
 *
 * 由 FuyaoClient 以 `client.aShare.financials` 暴露。
 */
export class FinancialStatementsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 利润表多期序列。
   * `GET /api/a-share/financials/income-statements`
   *
   * @returns 信封，data.item 为 IncomeStatementItem[]（按 period_end 降序）。
   */
  incomeStatements(
    params: FinancialStatementParams,
  ): Promise<ApiResponse<FinancialListData<IncomeStatementItem>>> {
    validateFinancialMode(params, 'financials.incomeStatements');
    return this.http.get<FinancialListData<IncomeStatementItem>>(
      '/api/a-share/financials/income-statements',
      financialQuery(params),
    );
  }

  /**
   * 资产负债表多期序列。
   * `GET /api/a-share/financials/balance-sheets`
   */
  balanceSheets(
    params: FinancialStatementParams,
  ): Promise<ApiResponse<FinancialListData<BalanceSheetItem>>> {
    validateFinancialMode(params, 'financials.balanceSheets');
    return this.http.get<FinancialListData<BalanceSheetItem>>(
      '/api/a-share/financials/balance-sheets',
      financialQuery(params),
    );
  }

  /**
   * 现金流量表多期序列。
   * `GET /api/a-share/financials/cash-flow-statements`
   */
  cashFlowStatements(
    params: FinancialStatementParams,
  ): Promise<ApiResponse<FinancialListData<CashFlowStatementItem>>> {
    validateFinancialMode(params, 'financials.cashFlowStatements');
    return this.http.get<FinancialListData<CashFlowStatementItem>>(
      '/api/a-share/financials/cash-flow-statements',
      financialQuery(params),
    );
  }

  /**
   * 财务指标数据：一次返回成长/盈利/偿债/营运/现金流五类指标。
   *
   * `GET /api/a-share/financials/indicators`
   *
   * @param params.thscode 必填单只标的。
   * @param params.report 必填报告期，格式 `yyyy-1|yyyy-2|yyyy-3|yyyy-4`
   *        （1=一季报、2=中报、3=三季报、4=年报），如 `2025-1`。
   * @returns 信封，abilities 固定顺序 growth→profitability→solvency→operation→cash-flow。
   */
  indicators(params: {
    thscode: string;
    report: string;
  }): Promise<ApiResponse<FinancialIndicatorsData>> {
    validateRequired(params, ['thscode', 'report'], 'financials.indicators');
    assertNoComma(params.thscode, 'thscode');
    if (!/^\d{4}-[1-4]$/.test(params.report)) {
      throw new TypeError(
        `report must match yyyy-[1..4] (e.g. "2025-1"), got "${params.report}"`,
      );
    }
    return this.http.get<FinancialIndicatorsData>(
      '/api/a-share/financials/indicators',
      { thscode: params.thscode, report: params.report },
    );
  }
}

/** 组装财务三表 query 参数。@internal */
function financialQuery(params: FinancialStatementParams): Record<string, unknown> {
  return {
    thscode: params.thscode,
    period: params.period ?? 'annual',
    limit: params.limit,
    start: params.start,
    end: params.end,
  };
}

/* ------------------------------------------------------------------ */
/* 日历 / 估值 / 集合竞价                                                */
/* ------------------------------------------------------------------ */

/**
 * A 股交易日历资源。
 *
 * 由 FuyaoClient 以 `client.aShare.calendar` 暴露。
 */
export class CalendarResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * A 股近一年交易日序列（固定窗口 [今日-1年, 今日]，无任何入参）。
   *
   * `GET /api/a-share/calendar/trading-days`
   *
   * @returns 信封，data.item 按时间升序，含 date_ms 与 yyyyMMdd 可读日期。
   */
  tradingDays(): Promise<ApiResponse<TradingDaysData>> {
    return this.http.get<TradingDaysData>('/api/a-share/calendar/trading-days');
  }
}

/**
 * A 股估值快照资源。
 *
 * 由 FuyaoClient 以 `client.aShare.valuations` 暴露。
 */
export class ValuationsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 批量查询 A 股最新估值快照（PE TTM/MRQ、PB MRQ、PS TTM、PCF TTM 共 5 个指标）。
   *
   * `GET /api/a-share/valuations/snapshot`
   *
   * 服务端对 thscodes 做 trim/大写/去重保序；默认最多 100 个原始 token，
   * 空值指标以 null 返回（不补零）；无匹配时 code=0 且 item=[]。
   *
   * @param params.thscodes 必填，逗号分隔或多元素数组。
   */
  snapshot(params: {
    thscodes: string | string[];
  }): Promise<ApiResponse<ValuationSnapshotData>> {
    validateRequired(params, ['thscodes'], 'valuations.snapshot');
    return this.http.get<ValuationSnapshotData>(
      '/api/a-share/valuations/snapshot',
      { thscodes: params.thscodes },
    );
  }
}

/**
 * A 股集合竞价资源。
 *
 * 由 FuyaoClient 以 `client.aShare.auction` 暴露。
 */
export class AuctionResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 集合竞价快照。
   *
   * `GET /api/a-share/auction/snapshot`
   *
   * @param params.thscodes 必填，逗号分隔或多元素数组；服务端按请求顺序去重返回。
   * @param params.stage 可选阶段：live（实时）/ final（终态，默认）。
   */
  snapshot(params: {
    thscodes: string | string[];
    stage?: AuctionStage;
  }): Promise<ApiResponse<AuctionSnapshotData>> {
    validateRequired(params, ['thscodes'], 'auction.snapshot');
    return this.http.get<AuctionSnapshotData>('/api/a-share/auction/snapshot', {
      thscodes: params.thscodes,
      stage: params.stage,
    });
  }

  /**
   * 短线风向标竞价基准。
   *
   * `GET /api/a-share/auction/short-term-benchmark`
   *
   * @param params.date 可选查询日期 `yyyy-MM-dd`；缺省取上海当日；
   *        显式指定非交易日时不自动回退。
   */
  shortTermBenchmark(params: { date?: string } = {}): Promise<ApiResponse<ShortTermBenchmarkData>> {
    return this.http.get<ShortTermBenchmarkData>(
      '/api/a-share/auction/short-term-benchmark',
      { date: params.date },
    );
  }
}

/* ------------------------------------------------------------------ */
/* 公共校验工具                                                          */
/* ------------------------------------------------------------------ */

/**
 * 断言对象上的必填字段均存在且非空字符串。
 *
 * @throws {TypeError} 任一必填字段缺失时抛出。
 * @internal
 */
export function validateRequired(
  params: unknown,
  keys: string[],
  method: string,
): void {
  if (!params || typeof params !== 'object') {
    throw new TypeError(`${method}: params object is required`);
  }
  for (const key of keys) {
    const value = (params as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === '') {
      throw new TypeError(`${method}: "${key}" is required`);
    }
  }
}

/**
 * 断言 thscode 不含逗号（多数单标的接口明确拒绝逗号）。
 *
 * @internal
 */
export function assertNoComma(value: string, field: string): void {
  if (value.includes(',')) {
    throw new TypeError(`"${field}" must contain exactly one thscode without commas`);
  }
}
