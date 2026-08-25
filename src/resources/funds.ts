/**
 * 基金资源域（funds）。
 *
 * 通用约定：
 * - 多数接口以 `(fundType, thscode)` 联合定位；经理用 manager_id；公司用 company_id。
 * - fundType：`otc`（场外）/ `exchange`（ETF、LOF）/ `reits`（公募 REITs）。
 * - thscode 必须保留市场后缀并与 fund_type 分区一致（不一致服务端 code=1004）。
 * - 行情接口只接收 thscode 且当前仅支持 ETF（非 ETF → code=3004）。
 * - 收益率/占比/回撤均为百分数原值（如 8.88 表示 8.88%）。
 *
 * 端点清单（28 个）见 README 与 docs/API_AUDIT.md 第 12 节。
 */
import type { FuyaoHttpClient } from '../http';
import { assertNoComma, validateRequired } from './aShare';
import type {
  ApiResponse,
} from '../types';

/** 基金类型枚举。 */
export type FundType = 'otc' | 'exchange' | 'reits';

/** 净值区间枚举。 */
export type NavRange =
  | 'week'
  | 'month'
  | 'tmonth'
  | 'hyear'
  | 'year'
  | 'twoyear'
  | 'tyear'
  | 'fyear';

/**
 * 校验基金通用入参（fund_type + thscode 必填、thscode 不含逗号）。
 *
 * @internal
 */
function validateFundParams(
  params: { fundType?: string; thscode?: string },
  method: string,
  requireFundType = true,
): void {
  const keys = requireFundType ? ['fundType', 'thscode'] : ['thscode'];
  validateRequired(params, keys, method);
  assertNoComma(params.thscode as string, 'thscode');
}

/* ------------------------------------------------------------------ */
/* 资料 / 持仓                                                          */
/* ------------------------------------------------------------------ */

/** 基金基本资料条目。 */
export interface FundProfileItem {
  thscode: string;
  ticker: string;
  fund_name: string | null;
  /** 成立日期毫秒戳。 */
  estab_date: number | null;
  /** 基金公司 ID，可用于 companies.detail 查询。 */
  company_id: string | null;
  mgmt_name: string | null;
  manager_name: string | null;
  fund_scale: number | null;
  unit_nav: number | null;
  /** 经理引用数组（ID、姓名、任职收益等），保留上游结构。 */
  manager_info: unknown[];
  /** 交易规则数组，保留上游结构。 */
  trade_rule: unknown[];
  /** 费率信息数组，保留上游结构。 */
  rate_info: unknown[];
}

/** 基金重仓持仓条目。 */
export interface FundHoldingItem {
  thscode: string;
  ticker: string;
  /** 资产名称（字段名为兼容既有契约而保留）。 */
  stock_name: string;
  /** 占基金净值比例百分数原值。 */
  hold_ratio: number;
  asset_type: 'stock' | 'bond' | 'fund';
  position_capital: number;
  position_count: number;
  security_market_value_rate_pct: number;
  period_increase_rate_pct: number;
  investment_rank: number;
  start_date_ms?: number;
  end_date_ms?: number;
  publish_date_ms?: number;
  modify_time_ms?: number;
}

/** 基金重仓持仓数据容器。 */
export interface FundHoldingsData {
  timestamp: number;
  item: FundHoldingItem[];
  /** 以下汇总字段可能存在。 */
  total_stock_ratio_pct?: number;
  total_bond_ratio_pct?: number;
  total_fund_ratio_pct?: number;
  turnover_rate_pct?: number;
  stock_ratio_pct?: number;
  main_industry?: string;
  concentration_ratio?: number;
}

/** 历史（股票/债券）持仓条目。 */
export interface FundPortfolioHistoryItem {
  thscode: string;
  ticker: string;
  name: string;
  asset_type: 'stock' | 'bond';
  hold_ratio: number;
  market_value: number;
  period_increase_pct: number;
  rank: number;
  report_type: string;
  end_date_ms: number;
}

/** 报告日期条目。 */
export interface FundReportDateItem {
  report_type: string;
  report_type_name: string;
  start_date_ms: number;
  end_date_ms: number;
}

/** 资产配置条目。 */
export interface FundAssetAllocationItem {
  report_date_ms: number;
  stock_ratio_pct: number;
  bond_ratio_pct: number;
  deposit_ratio_pct: number;
  other_ratio_pct: number;
}

/** 行业配置条目。 */
export interface FundIndustryAllocationItem {
  /** 报告期，如 "2026Q2"。 */
  report_period: string;
  industry_name: string;
  ratio_pct: number;
}

/* ------------------------------------------------------------------ */
/* 业绩                                                                 */
/* ------------------------------------------------------------------ */

/** 基金净值条目；未通过 nav_type 请求的字段不输出。 */
export interface FundNavPoint {
  nav_date: number;
  unit_nav?: number;
  adj_nav?: number;
}

/** 区间收益条目（百分数原值）。 */
export interface FundReturnsItem {
  return_week?: number;
  return_month?: number;
  return_tmonth?: number;
  return_hyear?: number;
  return_year?: number;
  return_twoyear?: number;
  return_tyear?: number;
  return_fyear?: number;
  return_nowyear?: number;
  return_now?: number;
  /** 对应周期同类平均收益率。 */
  [key: `peer_average_${string}`]: number | undefined;
  /** 对应周期同类排名与参与总数。 */
  [key: `rank_${string}`]: number | undefined;
}

/** 历史业绩指标条目（周期固定 DAY_1）。 */
export interface FundIndicatorHistoricalPoint {
  date_ms: number;
  rsi_pct: number;
  donchian_channel: number;
  track_index_pe_ttm_five_year_percentile: number;
}

/** 最大回撤条目。 */
export interface FundDrawdownItem {
  thscode: string;
  ticker: string;
  week: number;
  month: number;
  tmonth: number;
  hyear: number;
  year: number;
  twoyear: number;
  tyear: number;
  fyear: number;
  nowyear: number;
  now: number;
}

/* ------------------------------------------------------------------ */
/* 持有人 / 分红                                                        */
/* ------------------------------------------------------------------ */

/** 持有人结构条目。 */
export interface FundHolderDetailItem {
  /** 实际披露口径 merged / separate。 */
  merge_scope: 'merged' | 'separate';
  report_date_ms: number;
  /** 机构占比百分数原值。 */
  ins_position: number;
  holder_amount: number;
  avg_holder_share: number;
  psnl_rate: number;
  mgmt_staff_hold_rate: number;
}

/** 前十大持有人条目。 */
export interface FundTopHolderItem {
  holder_id: string;
  holder_code: string;
  holder_name: string;
  holder_type: string;
  rank: number;
  hold_share: number;
  hold_rate_pct: number;
  report_date_ms: number;
  publish_date_ms: number;
}

/** 基金分红记录条目。 */
export interface FundDividendItem {
  per_ten_cash_before_tax: number;
  per_ten_cash_after_tax: number;
  progress: string;
  publish_date_ms: number;
  registration_date_ms: number;
  ex_dividend_date_ms: number;
  payment_date_ms: number;
  reinvestment_date_ms: number;
  profit_base_date_ms: number;
  in_dividend_date_ms: number;
}

/** 分红数据容器。 */
export interface FundDividendsData {
  timestamp: number;
  dividend_count: number;
  /** 累计分红汇总值（勿与每 10 份现金分红混用）。 */
  dividend_total: number;
  item: FundDividendItem[];
}

/* ------------------------------------------------------------------ */
/* 经理 / 公司 / 诊断 / 募集 / 资讯                                      */
/* ------------------------------------------------------------------ */

/** 投资风格条目。 */
export interface ManagerInvestmentStyleItem {
  representative_fund_thscode: string | null;
  representative_fund_ticker: string | null;
  representative_fund_name: string | null;
  investment_idea: string | null;
  total_fund_scale: number | null;
  industry_preferences: unknown;
}

/** 经营业绩序列点。 */
export interface ManagerPerformancePoint {
  date_ms: number;
  manager_return_pct: number;
  peer_return_pct: number;
  benchmark_return_pct: number;
}

/** 从业经历条目。 */
export interface ManagerExperienceItem {
  awards: unknown;
  heavy_assets: unknown;
  investment_history: unknown;
}

/** 经理详情条目。 */
export interface ManagerDetailItem {
  manager_id: string;
  manager_name: string;
  sex: string | null;
  degree: string | null;
  company_id: string | null;
  company_name: string | null;
  resume: string | null;
  photo_url: string | null;
  annual_return_pct: number | null;
  maximum_return_pct: number | null;
  radar_comparison: unknown[];
}

/** 公司详情条目。 */
export interface CompanyDetailItem {
  company_id: string;
  company_name: string;
  company_type: string;
  established_date_ms: number;
  fund_count: number;
  scale: number;
}


/* ------------------------------------------------------------------ */
/* 基金财务报表（fund-financials）                                      */
/* ------------------------------------------------------------------ */

/** 基金财务指标条目。 */
export interface FundFinancialIndicatorItem {
  /** 报告期起始时间毫秒戳。 */
  start_date_ms: number;
  /** 报告期结束时间毫秒戳。 */
  end_date_ms: number;
  /** 发布日期毫秒戳。 */
  publish_date_ms: number;
  /** 可分配利润。 */
  distribution_profit: number | null;
  /** 本期利润。 */
  current_profit: number | null;
  /** 本期收入。 */
  current_income: number | null;
  /** 每份可分配利润。 */
  distribution_share_profit: number | null;
  /** 平均净值利润率。 */
  average_nav_profit_margin: number | null;
  /** 平均每份本期利润。 */
  average_share_current_profit: number | null;
  /** 单位净值。 */
  share_nav: number | null;
  /** 累计单位净值。 */
  sum_share_nav: number | null;
  /** 基金资产净值。 */
  asset_nav: number | null;
  /** 累计净值增长率，百分数原值。 */
  sum_nav_rate: number | null;
  /** 净值增长率，百分数原值。 */
  nav_rate: number | null;
}

/** 基金利润表条目。 */
export interface FundIncomeStatementItem {
  /** 报告期起始时间毫秒戳。 */
  start_date_ms: number;
  /** 报告期结束时间毫秒戳。 */
  end_date_ms: number;
  /** 发布日期毫秒戳。 */
  publish_date_ms: number;
  /** 收入合计。 */
  total_income: number | null;
  /** 费用合计。 */
  total_fee: number | null;
  /** 利润总额。 */
  total_profit: number | null;
  /** 净利润。 */
  net_profit: number | null;
}

/** 基金资产负债表条目。 */
export interface FundBalanceSheetItem {
  /** 报告期起始时间毫秒戳。 */
  start_date_ms: number;
  /** 报告期结束时间毫秒戳。 */
  end_date_ms: number;
  /** 发布日期毫秒戳。 */
  publish_date_ms: number;
  /** 资产总计。 */
  total_assets: number | null;
  /** 负债合计。 */
  total_liability: number | null;
  /** 所有者权益合计。 */
  owner_total_equity: number | null;
  /** 负债和所有者权益总计。 */
  liability_and_owner_equity: number | null;
}

/** 基金财务指标数据容器。 */
export interface FundFinancialIndicatorsData {
  timestamp: number;
  item: FundFinancialIndicatorItem[];
}

/** 基金利润表数据容器。 */
export interface FundIncomeStatementsData {
  timestamp: number;
  item: FundIncomeStatementItem[];
}

/** 基金资产负债表数据容器。 */
export interface FundBalanceSheetsData {
  timestamp: number;
  item: FundBalanceSheetItem[];
}

/** 诊断详情条目。 */
export interface FundDiagnosticsItem {
  thscode: string;
  ticker: string;
  fund_type: string;
  peer_code: string;
  dimensions: Record<string, unknown>;
  peer_dimensions: Record<string, unknown>;
  probabilities: Record<string, unknown>;
  ranges: Record<string, unknown>;
  resilience: Record<string, unknown>;
  peer_resilience: Record<string, unknown>;
}

/** 新发基金募集条目。 */
export interface FundOfferingItem {
  thscode: string;
  ticker: string;
  subscription_start_ms: number;
  subscription_end_ms: number;
}

/** 资讯文章条目。 */
export interface FundNewsArticleItem {
  id: string;
  content_type: string;
  title: string;
  summary: string;
  source: string;
  url: string | null;
  image_url: string | null;
  author: string;
  publish_time_ms: number;
  top: boolean;
}

/** 资讯数据容器（游标分页，无 total）。 */
export interface FundNewsData {
  timestamp: number;
  limit: number;
  /** 下一页不透明游标；翻页时原样回传。 */
  offset: string | null;
  has_more: boolean;
  item: FundNewsArticleItem[];
}

/* ------------------------------------------------------------------ */
/* 行情                                                                 */
/* ------------------------------------------------------------------ */

/** 场内基金行情快照条目。 */
export interface FundMarketSnapshotItem {
  thscode: string;
  ticker: string;
  last_price: number;
  open_price: number;
  high_price: number;
  low_price: number;
  prev_price: number;
  price_change_ratio_pct: number;
  price_change: number;
  price_amplitude_ratio_pct: number;
  volume: number;
  turnover: number;
  turnover_ratio_pct: number;
}

/** 场内基金历史日线数据容器。 */
export interface FundMarketHistoricalData {
  timestamp: number;
  thscode: string;
  interval: '1d';
  adjust: null;
  item: {
    date_ms: number;
    open_price: number;
    high_price: number;
    low_price: number;
    close_price: number;
    volume: number;
    turnover: number;
  }[];
}

/* ------------------------------------------------------------------ */
/* 资源类                                                              */
/* ------------------------------------------------------------------ */

/**
 * 基金资源聚合根：profile/portfolio/performance/holders/corporateActions/
 * managers/companies/diagnostics/offerings/news/market/financials 子资源。
 *
 * 由 FuyaoClient 以 `client.funds` 暴露。
 */
export class FundsResource {
  readonly profile: FundProfileResource;
  readonly portfolio: FundPortfolioResource;
  readonly performance: FundPerformanceResource;
  readonly holders: FundHoldersResource;
  readonly corporateActions: FundCorporateActionsResource;
  readonly managers: FundManagersResource;
  readonly companies: FundCompaniesResource;
  readonly diagnostics: FundDiagnosticsResource;
  readonly offerings: FundOfferingsResource;
  readonly news: FundNewsResource;
  readonly market: FundMarketResource;
  readonly financials: FundFinancialsResource;

  constructor(http: FuyaoHttpClient) {
    this.profile = new FundProfileResource(http);
    this.portfolio = new FundPortfolioResource(http);
    this.performance = new FundPerformanceResource(http);
    this.holders = new FundHoldersResource(http);
    this.corporateActions = new FundCorporateActionsResource(http);
    this.managers = new FundManagersResource(http);
    this.companies = new FundCompaniesResource(http);
    this.diagnostics = new FundDiagnosticsResource(http);
    this.offerings = new FundOfferingsResource(http);
    this.news = new FundNewsResource(http);
    this.market = new FundMarketResource(http);
    this.financials = new FundFinancialsResource(http);
    this.companies = new FundCompaniesResource(http);
    this.diagnostics = new FundDiagnosticsResource(http);
    this.offerings = new FundOfferingsResource(http);
    this.news = new FundNewsResource(http);
    this.market = new FundMarketResource(http);
  }
}

/** 基金基本资料。 */
export class FundProfileResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 基金基本资料（名称、成立日期、管理人、基金经理、规模与净值等）。
   *
   * `GET /api/fund/profile/detail`
   *
   * @param params.fundType otc/exchange/reits。
   * @param params.thscode 完整基金代码，如 `025480.OF`、`510300.SH`。
   */
  detail(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number; item: FundProfileItem[] }>> {
    validateFundParams(params, 'funds.profile.detail');
    return this.http.get('/api/fund/profile/detail', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }
}

/** 基金持仓与资产配置。 */
export class FundPortfolioResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 定期披露的重仓持仓（股票、债券与基金资产及汇总指标）。
   * `GET /api/fund/portfolio/holdings`
   */
  holdings(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<FundHoldingsData>> {
    validateFundParams(params, 'funds.portfolio.holdings');
    return this.http.get<FundHoldingsData>('/api/fund/portfolio/holdings', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }

  /**
   * 历史股票持仓。
   * `GET /api/fund/portfolio/stock-history`
   *
   * @param params.reportType 报告类型（如 `quarter`）。
   * @param params.endDate 报告截止日期 `yyyy-MM-dd`。
   */
  stockHistory(params: FundHistoryParams): Promise<ApiResponse<{ timestamp: number; item: FundPortfolioHistoryItem[] }>> {
    const q = historyQuery(params, 'funds.portfolio.stockHistory');
    return this.http.get('/api/fund/portfolio/stock-history', q);
  }

  /**
   * 历史债券持仓（字段结构与股票持仓一致，asset_type 为 bond）。
   * `GET /api/fund/portfolio/bond-history`
   */
  bondHistory(params: FundHistoryParams): Promise<ApiResponse<{ timestamp: number; item: FundPortfolioHistoryItem[] }>> {
    const q = historyQuery(params, 'funds.portfolio.bondHistory');
    return this.http.get('/api/fund/portfolio/bond-history', q);
  }

  /**
   * 股票持仓报告日期列表。
   * `GET /api/fund/portfolio/stock-report-dates`
   *
   * @param params.reportType 可选报告类型过滤。
   */
  stockReportDates(params: FundReportDatesParams): Promise<ApiResponse<{ timestamp: number; item: FundReportDateItem[] }>> {
    return this.http.get('/api/fund/portfolio/stock-report-dates', reportDatesQuery(params, 'funds.portfolio.stockReportDates'));
  }

  /**
   * 债券持仓报告日期列表（字段结构与股票版一致）。
   * `GET /api/fund/portfolio/bond-report-dates`
   */
  bondReportDates(params: FundReportDatesParams): Promise<ApiResponse<{ timestamp: number; item: FundReportDateItem[] }>> {
    return this.http.get('/api/fund/portfolio/bond-report-dates', reportDatesQuery(params, 'funds.portfolio.bondReportDates'));
  }

  /**
   * 资产配置（股票/债券/存款/其他占比序列）。
   * `GET /api/fund/portfolio/asset-allocation`
   */
  assetAllocation(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number; item: FundAssetAllocationItem[] }>> {
    validateFundParams(params, 'funds.portfolio.assetAllocation');
    return this.http.get('/api/fund/portfolio/asset-allocation', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }

  /**
   * 行业配置（报告期 → 行业 → 占比）。
   * `GET /api/fund/portfolio/industry-allocation`
   */
  industryAllocation(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number; item: FundIndustryAllocationItem[] }>> {
    validateFundParams(params, 'funds.portfolio.industryAllocation');
    return this.http.get('/api/fund/portfolio/industry-allocation', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }
}

/** {@link FundPortfolioResource.stockHistory} / bondHistory 入参。 */
export interface FundHistoryParams {
  fundType: FundType;
  thscode: string;
  reportType: string;
  /** `yyyy-MM-dd`。 */
  endDate: string;
}

/** {@link FundPortfolioResource.stockReportDates} / bondReportDates 入参。 */
export interface FundReportDatesParams {
  fundType: FundType;
  thscode: string;
  reportType?: string;
}

/** 组装 history 类 query 并校验。@internal */
function historyQuery(
  params: FundHistoryParams,
  method: string,
): Record<string, unknown> {
  validateFundParams(params, method);
  validateRequired(params, ['reportType', 'endDate'], method);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
    throw new TypeError(`${method}: endDate must be formatted as yyyy-MM-dd`);
  }
  return {
    fund_type: params.fundType,
    thscode: params.thscode,
    report_type: params.reportType,
    end_date: params.endDate,
  };
}

/** 组装 report-dates 类 query 并校验。@internal */
function reportDatesQuery(
  params: FundReportDatesParams,
  method: string,
): Record<string, unknown> {
  validateFundParams(params, method);
  return {
    fund_type: params.fundType,
    thscode: params.thscode,
    report_type: params.reportType,
  };
}

/** 基金业绩与回撤。 */
export class FundPerformanceResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 基金净值。
   * `GET /api/fund/performance/nav`
   *
   * @param params.range 不传时最多返回最新一个净值日期；传入后按 nav_date 升序返回区间序列。
   * @param params.navType `unit` / `adj` / `unit,adj`（默认）；未请求的类型不输出对应字段。
   */
  nav(params: {
    fundType: FundType;
    thscode: string;
    range?: NavRange;
    navType?: 'unit' | 'adj' | 'unit,adj';
  }): Promise<ApiResponse<{ timestamp: number; item: FundNavPoint[] }>> {
    validateFundParams(params, 'funds.performance.nav');
    return this.http.get('/api/fund/performance/nav', {
      fund_type: params.fundType,
      thscode: params.thscode,
      range: params.range,
      nav_type: params.navType,
    });
  }

  /**
   * 区间收益（近周/月/三月/半年/年/两年/三年/五年/今年以来/成立以来，
   * 含同类平均与排名）。
   * `GET /api/fund/performance/returns`
   */
  returns(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number; item: FundReturnsItem[] }>> {
    validateFundParams(params, 'funds.performance.returns');
    return this.http.get('/api/fund/performance/returns', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }

  /**
   * 历史业绩指标（RSI、唐奇安通道、跟踪指数 PE TTM 五年分位；周期固定 DAY_1）。
   * `GET /api/fund/performance/indicators-historical`
   *
   * start/end 均为必填毫秒戳。
   */
  indicatorsHistorical(params: {
    fundType: FundType;
    thscode: string;
    start: number;
    end: number;
  }): Promise<ApiResponse<{ timestamp: number; item: FundIndicatorHistoricalPoint[] }>> {
    validateFundParams(params, 'funds.performance.indicatorsHistorical');
    validateRequired(params, ['start', 'end'], 'funds.performance.indicatorsHistorical');
    if (params.end < params.start) {
      throw new TypeError('funds.performance.indicatorsHistorical: end must be >= start');
    }
    return this.http.get('/api/fund/performance/indicators-historical', {
      fund_type: params.fundType,
      thscode: params.thscode,
      start: params.start,
      end: params.end,
    });
  }

  /**
   * 最大回撤（多区间快照）。
   * `GET /api/fund/performance/drawdowns`
   */
  drawdowns(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number; item: FundDrawdownItem[] }>> {
    validateFundParams(params, 'funds.performance.drawdowns');
    return this.http.get('/api/fund/performance/drawdowns', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }
}

/** 基金持有人数据。 */
export class FundHoldersResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 持有人结构。
   * `GET /api/fund/holders/detail`
   *
   * merge_scope=all 时最多返回 merged 与 separate 各自最新一条；
   * 所选口径暂无可用数据时服务端返回 code=3002。
   */
  detail(params: {
    fundType: FundType;
    thscode: string;
    mergeScope?: 'all' | 'merged' | 'separate';
  }): Promise<ApiResponse<{ timestamp: number; item: FundHolderDetailItem[] }>> {
    validateFundParams(params, 'funds.holders.detail');
    return this.http.get('/api/fund/holders/detail', {
      fund_type: params.fundType,
      thscode: params.thscode,
      merge_scope: params.mergeScope,
    });
  }

  /**
   * 前十大持有人。
   * `GET /api/fund/holders/top`
   *
   * @param params.limit 返回条数上限 10。
   */
  top(params: {
    fundType: FundType;
    thscode: string;
    limit?: number;
  }): Promise<ApiResponse<{ timestamp: number; limit: number; item: FundTopHolderItem[] }>> {
    validateFundParams(params, 'funds.holders.top');
    if (params.limit !== undefined && (params.limit < 1 || params.limit > 10)) {
      throw new TypeError('funds.holders.top: limit must be within [1, 10]');
    }
    return this.http.get('/api/fund/holders/top', {
      fund_type: params.fundType,
      thscode: params.thscode,
      limit: params.limit,
    });
  }
}


/* ------------------------------------------------------------------ */
/* 基金财务报表（fund-financials）                                      */
/* ------------------------------------------------------------------ */

/** 基金财务报表资源。 */
export class FundFinancialsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 基金财务指标。
   * `GET /api/fund/financials/indicators`
   */
  indicators(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<FundFinancialIndicatorsData>> {
    validateFundParams(params, 'funds.financials.indicators');
    return this.http.get<FundFinancialIndicatorsData>('/api/fund/financials/indicators', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }

  /**
   * 基金利润表。
   * `GET /api/fund/financials/income-statements`
   */
  incomeStatements(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<FundIncomeStatementsData>> {
    validateFundParams(params, 'funds.financials.incomeStatements');
    return this.http.get<FundIncomeStatementsData>('/api/fund/financials/income-statements', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }

  /**
   * 基金资产负债表。
   * `GET /api/fund/financials/balance-sheets`
   */
  balanceSheets(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<FundBalanceSheetsData>> {
    validateFundParams(params, 'funds.financials.balanceSheets');
    return this.http.get<FundBalanceSheetsData>('/api/fund/financials/balance-sheets', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }
}

/** 基金分红记录。 */
export class FundCorporateActionsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 历史分红与权益登记日期。
   * `GET /api/fund/corporate-actions/dividends`
   */
  dividends(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<FundDividendsData>> {
    validateFundParams(params, 'funds.corporateActions.dividends');
    return this.http.get<FundDividendsData>(
      '/api/fund/corporate-actions/dividends',
      { fund_type: params.fundType, thscode: params.thscode },
    );
  }
}

/** 基金经理数据（manager_id 取自 profile 的 manager_info）。 */
export class FundManagersResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  private base(managerId: string, method: string): Record<string, unknown> {
    validateRequired({ managerId }, ['managerId'], method);
    return { manager_id: managerId };
  }

  /** 投资风格。`GET /api/fund/managers/investment-style` */
  investmentStyle(params: {
    managerId: string;
  }): Promise<ApiResponse<{ timestamp: number; item: ManagerInvestmentStyleItem[] }>> {
    return this.http.get('/api/fund/managers/investment-style', this.base(params.managerId, 'managers.investmentStyle'));
  }

  /**
   * 经营业绩序列。
   * `GET /api/fund/managers/performance`
   *
   * @param params.range 必填：month/tmonth/year/nowyear/now。
   */
  performance(params: {
    managerId: string;
    range: 'month' | 'tmonth' | 'year' | 'nowyear' | 'now';
  }): Promise<ApiResponse<{ timestamp: number; item: ManagerPerformancePoint[] }>> {
    const q = this.base(params.managerId, 'managers.performance');
    if (!params.range) {
      throw new TypeError('managers.performance: "range" is required');
    }
    return this.http.get('/api/fund/managers/performance', { ...q, range: params.range });
  }

  /** 从业经历。`GET /api/fund/managers/experience` */
  experience(params: {
    managerId: string;
  }): Promise<ApiResponse<{ timestamp: number; item: ManagerExperienceItem[] }>> {
    return this.http.get('/api/fund/managers/experience', this.base(params.managerId, 'managers.experience'));
  }

  /** 经理详情。`GET /api/fund/managers/detail` */
  detail(params: {
    managerId: string;
  }): Promise<ApiResponse<{ timestamp: number; item: ManagerDetailItem[] }>> {
    return this.http.get('/api/fund/managers/detail', this.base(params.managerId, 'managers.detail'));
  }
}

/** 基金公司详情。 */
export class FundCompaniesResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 公司基本信息、基金数量与规模。
   * `GET /api/fund/companies/detail`
   *
   * @param params.companyId 必填公司 ID（取自 profile 的 company_id，非公司名称）。
   */
  detail(params: {
    companyId: string;
  }): Promise<ApiResponse<{ timestamp: number; item: CompanyDetailItem[] }>> {
    validateRequired(params, ['companyId'], 'companies.detail');
    return this.http.get('/api/fund/companies/detail', { company_id: params.companyId });
  }
}

/** 基金诊断详情。 */
export class FundDiagnosticsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 诊断维度、同类对比、概率区间与韧性指标。
   * `GET /api/fund/diagnostics/detail`
   */
  detail(params: {
    fundType: FundType;
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number; item: FundDiagnosticsItem[] }>> {
    validateFundParams(params, 'funds.diagnostics.detail');
    return this.http.get('/api/fund/diagnostics/detail', {
      fund_type: params.fundType,
      thscode: params.thscode,
    });
  }
}

/** 基金募集列表。 */
export class FundOfferingsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 当前募集或即将募集的新发基金。
   * `GET /api/fund/offerings/list`
   *
   * @param params.subscribe 必填：active（当前募集）/ upcoming（即将募集）。
   */
  list(params: {
    subscribe: 'active' | 'upcoming';
  }): Promise<ApiResponse<{ timestamp: number; item: FundOfferingItem[] }>> {
    validateRequired(params, ['subscribe'], 'funds.offerings.list');
    return this.http.get('/api/fund/offerings/list', { subscribe: params.subscribe });
  }
}

/** 基金资讯（游标分页）。 */
export class FundNewsResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 资讯文章列表。
   * `GET /api/fund/news/article-list`
   *
   * 分页约定：offset 是不透明游标，下一页必须原样回传上一页 data.offset；
   * 结束与否以 data.has_more 为准（本接口无 total）。
   */
  articleList(params: {
    fundType: FundType;
    thscode: string;
    limit?: number;
    offset?: string;
  }): Promise<ApiResponse<FundNewsData>> {
    validateFundParams(params, 'funds.news.articleList');
    return this.http.get<FundNewsData>('/api/fund/news/article-list', {
      fund_type: params.fundType,
      thscode: params.thscode,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * 自动游标翻页迭代器，逐条产出资讯文章直到 has_more=false。
   */
  async *iterateArticles(params: {
    fundType: FundType;
    thscode: string;
    pageSize?: number;
  }): AsyncGenerator<Awaited<FundNewsData['item'][number]>> {
    let offset: string | undefined;
    // 游标分页：以上一页 data.offset 作为下一页入参，直至 has_more=false。
    for (;;) {
      const res = await this.articleList({
        fundType: params.fundType,
        thscode: params.thscode,
        limit: params.pageSize,
        offset,
      });
      const data = res.data;
      if (!data) return;
      yield* data.item;
      if (!data.has_more || !data.offset) return;
      offset = data.offset;
    }
  }
}

/** 基金行情（仅 ETF）。 */
export class FundMarketResource {
  /** @internal */
  constructor(private readonly http: FuyaoHttpClient) {}

  /**
   * 场内基金行情快照。仅支持 ETF（LOF/场外/REITs → code=3004）；
   * 本接口不接收 fund_type，SDK 同样不透传。
   *
   * `GET /api/fund/market/snapshot`
   *
   * @param params.thscode 必填单只 ETF 完整代码（不接受逗号）。
   */
  snapshot(params: {
    thscode: string;
  }): Promise<ApiResponse<{ timestamp: number | null; item: FundMarketSnapshotItem[] }>> {
    validateFundParams(params, 'funds.market.snapshot', false);
    return this.http.get('/api/fund/market/snapshot', { thscode: params.thscode });
  }

  /**
   * 场内基金历史日线行情。单次一只，查询窗口最长 5 个自然年。
   * `GET /api/fund/market/historical`
   *
   * @param params.interval 仅支持 `1d`（默认）。
   * @param params.start 必填起始毫秒戳。
   * @param params.end 必填结束毫秒戳（≥ start）。
   */
  historical(params: {
    thscode: string;
    interval?: '1d';
    start: number;
    end: number;
  }): Promise<ApiResponse<FundMarketHistoricalData>> {
    validateFundParams(params, 'funds.market.historical', false);
    validateRequired(params, ['start', 'end'], 'funds.market.historical');
    if (params.end < params.start) {
      throw new TypeError('funds.market.historical: end must be >= start');
    }
    return this.http.get<FundMarketHistoricalData>('/api/fund/market/historical', {
      thscode: params.thscode,
      interval: params.interval ?? '1d',
      start: params.start,
      end: params.end,
    });
  }
}
