/**
 * 统一响应信封与共享数据类型定义。
 *
 * 所有 fuyao.aicubes.cn REST 接口（含错误场景）均返回 HTTP 200 与统一
 * {@link ApiResponse} 信封；业务结果通过 `code` 字段表达（0 为成功）。
 * 时间戳字段统一为毫秒级 Unix 时间戳，时区按 Asia/Shanghai 解释。
 */

/** 统一业务响应信封。 */
export interface ApiResponse<T = unknown> {
  /** 业务结果码：0 表示成功，非 0 表示业务错误（详见 ErrorCode / FuyaoApiError）。 */
  code: number;
  /** 结果描述。 */
  message: string;
  /** 请求追踪 ID，用于问题排查。 */
  request_id: string;
  /** 业务数据容器；错误时可能为 null。 */
  data: T | null;
}

/**
 * 服务端业务错误码枚举。
 * 与官方文档《API 参考 · 错误码》一一对齐。
 */
export enum ErrorCode {
  /** 成功。 */
  OK = 0,
  /** 缺少必填参数。 */
  MISSING_PARAM = 1001,
  /** 参数格式错误。 */
  INVALID_PARAM_FORMAT = 1002,
  /** 参数取值越界。 */
  PARAM_OUT_OF_RANGE = 1003,
  /** 参数冲突（如 financials 同时传 start/end 与 limit）。 */
  PARAM_CONFLICT = 1004,
  /** 未认证：X-api-key 缺失或无效。 */
  UNAUTHENTICATED = 2001,
  /** 权限不足：API Key 无权调用该 capability。 */
  FORBIDDEN = 2003,
  /** 标的不存在。 */
  TICKER_NOT_FOUND = 3001,
  /** 数据未就绪。 */
  DATA_NOT_READY = 3002,
  /** 标的类型不支持该能力。 */
  UNSUPPORTED_CAPABILITY = 3004,
  /** 频率超限。 */
  RATE_LIMITED = 4001,
  /** 服务内部错误。 */
  INTERNAL_ERROR = 5001,
  /** 上游服务超时。 */
  UPSTREAM_TIMEOUT = 5002,
  /** 数据源不可用。 */
  UPSTREAM_UNAVAILABLE = 5003,
}

/** 规范化资产类型（meta 域 asset_type 枚举）。 */
export type AssetType =
  | 'a-share'
  | 'a-share-index'
  | 'fund-otc'
  | 'fund-etf'
  | 'fund-lof';

/** 交易所后缀过滤值。 */
export type ExchangeFilter = 'SH' | 'SZ' | 'BJ';

/** 标的信息条目（标的检索 / 标的列表共用）。 */
export interface TickerItem {
  /** 完整 thscode，如 `600519.SH`。 */
  thscode: string;
  /** 纯代码（无交易所后缀），如 `600519`。 */
  ticker: string;
  /** 展示名称。 */
  name: string;
  /**
   * 交易所后缀（`SH`/`SZ`/`BJ`）；场外基金为 null（`.OF` 不是交易所）。
   */
  exchange: string | null;
  /** 规范化资产类型叶子值，取值见 {@link AssetType}。 */
  asset_type: AssetType;
  /** 币种代码，当前统一为 `CNY`。 */
  currency: string;
}

/** 标的检索 / 列表接口的数据容器。 */
export interface TickerListData {
  /** 数据就绪时间（毫秒），为当前代码表快照的上游加载时间。 */
  timestamp: number;
  /** 标的列表。 */
  item: TickerItem[];
}

/* ------------------------------------------------------------------ */
/* A 股行情                                                            */
/* ------------------------------------------------------------------ */

/** 复权方式。 */
export type AdjustMode = 'none' | 'forward' | 'backward';

/** 行情快照条目（A 股与指数快照共用结构）。 */
export interface PriceSnapshotItem {
  /** 带交易所后缀的完整 thscode。 */
  thscode: string;
  /** 纯代码（无交易所后缀）。 */
  ticker: string;
  /** 最新成交价。 */
  last_price: number;
  /** 相对前收盘价的涨跌额。 */
  price_change: number;
  /** 涨跌幅百分数数值（如 1.74 表示 +1.74%）。 */
  price_change_ratio_pct: number;
  /** 当日开盘价。 */
  open_price: number;
  /** 当日最高价。 */
  high_price: number;
  /** 当日最低价。 */
  low_price: number;
  /** 前收盘价。 */
  prev_price: number;
  /** 成交量（股）。 */
  volume: number;
  /** 成交额（原始货币）。 */
  turnover: number;
}

/** 行情快照数据容器。 */
export interface PriceSnapshotData {
  /** 数据就绪时间（毫秒）；无有效数据时为 null。 */
  timestamp: number | null;
  /** 全市场代码表总数（分页模式估算页数用）。 */
  total: number;
  /** 快照记录列表。 */
  item: PriceSnapshotItem[];
}

/** 历史 K 线单根 K 线条目。 */
export interface PriceBarItem {
  /** K 线日期（毫秒）。 */
  date_ms: number;
  /** 开盘价。 */
  open_price: number;
  /** 最高价。 */
  high_price: number;
  /** 最低价。 */
  low_price: number;
  /** 收盘价。 */
  close_price: number;
  /** 成交量（股）。 */
  volume: number;
  /** 成交额（原始货币）。 */
  turnover: number;
}

/** 历史 K 线数据容器。 */
export interface PriceHistoricalData {
  /** 数据就绪时间（毫秒），为最新一根 K 线的上游有效时间。 */
  timestamp: number;
  /**
   * 复权方式回显；A 股历史 K 线为入参 adjust，
   * 指数历史 K 线固定为 null。
   */
  adjust?: AdjustMode | null;
  /**
   * 请求的标的 thscode 回显（实测返回，官方 REST 文档未列出，已实测核对）。
   */
  thscode?: string;
  /**
   * K 线周期回显，固定 `1d`（实测返回，官方 REST 文档未列出）。
   */
  interval?: '1d';
  /** K 线列表。 */
  item: PriceBarItem[];
}

/* ------------------------------------------------------------------ */
/* 除复权                                                              */
/* ------------------------------------------------------------------ */

/** 复权因子事件条目。 */
export interface AdjustmentFactorItem {
  /** 纯代码（无交易所后缀）。 */
  ticker: string;
  /** 除权除息日（Asia/Shanghai 零点毫秒戳）。事件列表按此字段降序排列。 */
  ex_date_ms: number;
  /** 每股现金分红（税前，原始货币）；非现金事件为 0。 */
  dividend_per_share: number;
  /** 每股送股比例（如 0.1 表示 10 送 1）；纯现金分红事件为 0。 */
  per_share_bonus: number;
}

/** 复权因子事件流数据容器。 */
export interface AdjustmentFactorsData {
  /** 本次返回所属标的的完整 thscode。 */
  thscode: string;
  /** 纯代码。 */
  ticker: string;
  /** 事件列表，按 ex_date_ms 降序（最新在前）。 */
  item: AdjustmentFactorItem[];
}

/* ------------------------------------------------------------------ */
/* 财务报表 / 指标                                                      */
/* ------------------------------------------------------------------ */

/** 报告期类型。 */
export type FinancialPeriod = 'annual' | 'quarterly';

/** 财务报表共有元数据字段。 */
export interface FinancialMeta {
  /** 完整 thscode。 */
  thscode: string;
  /** 纯代码。 */
  ticker: string;
  /** 入参 period 回显。 */
  period: FinancialPeriod;
  /** 财年（自然年）。 */
  fiscal_year: number;
  /** 财报期间：`FY` / `Q1` / `Q2` / `Q3` / `Q4`。 */
  fiscal_period: string;
  /** 披露日（毫秒）。 */
  report_date_ms: number;
  /** 报告期末（Asia/Shanghai 零点毫秒戳）。 */
  period_end_ms: number;
  /** 币种，A 股恒为 CNY。 */
  currency: string;
}

/** 利润表条目（原币元；basic_eps 单位元/股）。 */
export interface IncomeStatementItem extends FinancialMeta {
  operating_income: number | null;
  operating_costs: number | null;
  operating_expenses: number | null;
  sales_fee: number | null;
  manage_fee: number | null;
  research_and_development_expenses: number | null;
  operating_profit: number | null;
  interest_expenses: number | null;
  profit_total: number | null;
  income_tax_expense: number | null;
  net_profit: number | null;
  parent_holder_net_profit: number | null;
  basic_eps: number | null;
}

/** 资产负债表条目（原币元）。 */
export interface BalanceSheetItem extends FinancialMeta {
  assets_total: number | null;
  total_current_assets: number | null;
  non_current_nets_total: number | null;
  cash: number | null;
  accounts_receivable: number | null;
  total_debt: number | null;
  holder_equity_total: number | null;
}

/** 现金流量表条目（原币元）。 */
export interface CashFlowStatementItem extends FinancialMeta {
  act_cash_flow_net: number | null;
  invest_cash_flow_net: number | null;
  financing_cash_flow_net: number | null;
  pay_fixed_assets_etc_cash: number | null;
  pay_dividends_profits_interest_cash: number | null;
  cash_equivalents_net_addition: number | null;
}

/** 财务报表通用数据容器。 */
export interface FinancialListData<T> {
  /** 取响应中最大的 period_end_ms。 */
  timestamp: number;
  /** 报告期序列，按 period_end 降序。 */
  item: T[];
}

/** 财务指标五类能力标识。 */
export type FinancialAbility =
  | 'growth'
  | 'profitability'
  | 'solvency'
  | 'operation'
  | 'cash-flow';

/** 单个财务指标项；value 为保留精度的原始字符串，缺失为 null。 */
export interface FinancialIndicatorEntry {
  index_id: string;
  value: string | null;
}

/** 一类能力下的指标块。 */
export interface FinancialAbilityBlock {
  ability: FinancialAbility;
  indicators: FinancialIndicatorEntry[];
}

/** 财务指标数据容器。 */
export interface FinancialIndicatorsData {
  /** 入参 thscode 回显。 */
  thscode: string;
  /** 入参 report 回显，格式 `yyyy-1..yyyy-4`。 */
  report: string;
  /** 五类能力块，固定顺序 growth → profitability → solvency → operation → cash-flow。 */
  abilities: FinancialAbilityBlock[];
}

/* ------------------------------------------------------------------ */
/* 日历 / 估值                                                          */
/* ------------------------------------------------------------------ */

/** 单个交易日条目。 */
export interface TradingDayItem {
  /** 该交易日 Asia/Shanghai 00:00:00 毫秒戳。 */
  date_ms: number;
  /** 同一交易日的 `yyyyMMdd` 可读格式。 */
  date: string;
}

/** 交易日历数据容器（升序）。 */
export interface TradingDaysData {
  timestamp: number;
  item: TradingDayItem[];
}

/** A 股估值快照条目；五个估值指标均可能为 null（不补零）。 */
export interface ValuationSnapshotItem {
  thscode: string;
  ticker: string;
  /** 本地代码表中的股票名称。 */
  name: string | null;
  /** 市盈率 TTM。 */
  pe_ttm: number | null;
  /** 市盈率 MRQ。 */
  pe_mrq: number | null;
  /** 市净率 MRQ。 */
  pb_mrq: number | null;
  /** 市销率 TTM。 */
  ps_ttm: number | null;
  /** 市现率 TTM。 */
  pcf_ttm: number | null;
}

/** 估值快照数据容器。 */
export interface ValuationSnapshotData {
  /** 上游指标元数据最大有效时间；无有效时间时为 null。 */
  timestamp: number | null;
  /** 实际返回条数。 */
  total: number;
  /** 按去重后的请求顺序排列。 */
  item: ValuationSnapshotItem[];
}

/* ------------------------------------------------------------------ */
/* 集合竞价                                                             */
/* ------------------------------------------------------------------ */

/** 集合竞价阶段。 */
export type AuctionStage = 'live' | 'final';

/** 集合竞价快照条目。 */
export interface AuctionSnapshotItem {
  thscode: string;
  ticker: string;
  name: string;
  auction_price: number;
  /** 竞价涨跌幅，百分数原值。 */
  auction_pct: number;
  auction_volume: number;
  auction_amount: number;
  auction_unmatched: number;
  auction_turnover_pct: number;
  auction_yesterday_ratio_pct: number;
  auction_volume_ratio: number;
  pre_close_price: number;
  open_price: number;
  last_price: number;
  float_market_cap: number;
}

/** 集合竞价快照数据容器。 */
export interface AuctionSnapshotData {
  /** 接口响应组装时间（毫秒）。 */
  timestamp: number;
  auction_phase: string;
  data_status: string;
  total: number;
  item: AuctionSnapshotItem[];
}

/** 短线风向标基准条目。 */
export interface ShortTermBenchmarkItem {
  thscode: string;
  ticker: string;
  name: string;
  /** 竞价涨跌幅，百分数原值。 */
  auction_pct: number;
  /** 短线风向标标签，如 ["高开","放量"]。 */
  tags: string[];
}

/** 短线风向标竞价基准数据容器。 */
export interface ShortTermBenchmarkData {
  /** 接口响应组装时间（毫秒）。 */
  timestamp: number;
  /** 最终查询日期 `yyyy-MM-dd`。 */
  date: string;
  /** 查询日上海零点毫秒戳。 */
  date_ms: number;
  item: ShortTermBenchmarkItem[];
}

/* ------------------------------------------------------------------ */
/* 指数                                                                 */
/* ------------------------------------------------------------------ */

/** 同花顺指数列表 tag 枚举。 */
export type ThsIndexTag = 'cn_concept' | 'region' | 'tszs' | 'industry';

/** 同花顺指数清单条目（不含 ticker）。 */
export interface ThsIndexListItem {
  thscode: string;
  name: string;
}

/** 指数成分股条目。 */
export interface IndexConstituentItem {
  thscode: string;
  ticker: string;
  name: string;
}

/** 指数清单 / 成分股数据容器。 */
export interface IndexListData<T> {
  timestamp: number;
  item: T[];
}

/* ------------------------------------------------------------------ */
/* 特色数据                                                             */
/* ------------------------------------------------------------------ */

/** 分页信息（涨跌停类股票池）。 */
export interface PoolPagination {
  /** 总条数。 */
  total: number;
  /** 总页数。 */
  pages: number;
  /** 当前分页大小（回显请求参数）。 */
  size: number;
  /** 当前页码（回显请求参数）。 */
  page: number;
}

/** 涨停股票池条目。 */
export interface LimitUpPoolItem {
  thscode: string;
  ticker: string;
  name: string;
  is_st: boolean;
  is_new: boolean;
  last_price: number;
  /** 已乘以 100 的涨跌幅百分比。 */
  price_change_ratio_pct: number;
  /** 涨停时间 HH:MM。 */
  limit_up_time: string;
  /** 涨停原因；上游空字符串标准化为 null。 */
  limit_up_reason: string | null;
  /** 连板文本，如「首板」「5天4板」。 */
  continue_day_text: string;
  continue_day_cnt: number;
  seal_money: number;
  max_seal_money: number;
}

/** 涨停股票池数据容器。 */
export interface LimitUpPoolData {
  timestamp: number;
  pagination: PoolPagination;
  item: LimitUpPoolItem[];
}

/** 跌停股票池条目。 */
export interface LimitDownPoolItem {
  thscode: string;
  ticker: string;
  name: string;
  last_price: number;
  price_change_ratio_pct: number;
  first_limit_time: string;
  last_limit_time: string;
  turnover_ratio_pct: number;
}

/** 跌停股票池数据容器。 */
export interface LimitDownPoolData {
  timestamp: number;
  pagination: PoolPagination;
  item: LimitDownPoolItem[];
}

/** 炸板股票池条目。 */
export interface LimitBreakPoolItem {
  thscode: string;
  ticker: string;
  name: string;
  last_price: number;
  price_change_ratio_pct: number;
  open_times: number;
  turnover_ratio_pct: number;
  turnover: number;
}

/** 炸板股票池数据容器。 */
export interface LimitBreakPoolData {
  timestamp: number;
  pagination: PoolPagination;
  item: LimitBreakPoolItem[];
}

/** 连板天梯单个板位上的股票条目。 */
export interface LadderStockItem {
  thscode: string;
  ticker: string;
  name: string;
  board_num: number;
  /** 次一交易日是否继续封板；最近交易日固定为 null。 */
  seal_nextday: boolean | null;
  sign_level: number;
}

/** 连板天梯板位集合键。 */
export type LadderBoardKey =
  | 'two_board'
  | 'three_board'
  | 'four_board'
  | 'five_board'
  | 'six_board'
  | 'seven_over';

/** 连板天梯单日矩阵。 */
export interface LadderDayItem {
  /** 交易日期 `yyyyMMdd`。 */
  date: string;
  boards: Record<LadderBoardKey, LadderStockItem[]>;
}

/** 连板天梯数据容器。 */
export interface LimitUpLadderData {
  timestamp: number;
  window: {
    length: number;
    date_list: string[];
    board_caps: Partial<Record<LadderBoardKey, number>>;
  };
  item: LadderDayItem[];
}

/** 热榜榜单条目（飙升榜 / 热股榜单共用）。 */
export interface HotStockRankItem {
  thscode: string;
  ticker: string;
  name: string;
  rank: number;
  /** 热度值，保留上游原始字符串。 */
  heat: string;
  /** 排名变化；上游缺失时为 null。 */
  rank_change: number | null;
  /** 排名趋势。 */
  rank_trend: 'up' | 'down' | 'flat' | 'unknown';
}

/** 飙升榜 / 热股榜单数据容器。 */
export interface HotStockListData {
  timestamp: number;
  item: HotStockRankItem[];
}

/** 历史热股排行条目。 */
export interface HistoryHotStockItem {
  thscode: string;
  ticker: string;
  name: string;
  rank: number;
}

/** 历史热股排行数据容器。 */
export interface HotStockHistoryData {
  /** 查询自然日 `yyyy-MM-dd`。 */
  date: string;
  /** 查询自然日上海零点毫秒戳。 */
  date_ms: number;
  item: HistoryHotStockItem[];
}

/** 个股排名走势点位。 */
export interface RankTrendPoint {
  thscode: string;
  ticker: string;
  date: string;
  date_ms: number;
  rank: number;
}

/** 个股排名走势数据容器。 */
export interface RankTrendData {
  /** 起始自然日上海零点毫秒戳。 */
  timestamp: number;
  item: RankTrendPoint[];
}

/** 异动标签枚举。 */
export type AnomalyTag =
  | 'LIMIT_UP'
  | 'LIMIT_DOWN'
  | 'SHARP_RISE'
  | 'SHARP_FALL'
  | 'RAPID_RALLY'
  | 'RAPID_DECLINE';

/** 个股异动原因条目。 */
export interface AnomalyAnalysisItem {
  stock_name: string;
  analysis_content: string;
  /** 关键词列表；无关键词时为空数组。 */
  keyword_list: string[];
  thscode: string;
  /** 异动标签展示名。 */
  tag_name: string;
}

/** 个股异动原因数据容器。 */
export interface AnomalyAnalysisData {
  timestamp: number;
  item: AnomalyAnalysisItem[];
}

/** 龙虎榜个股维度条目。 */
export interface DragonTigerStockItem {
  thscode: string;
  ticker: string;
  name: string;
  /** 所属概念列表，元素含 name。 */
  concept_list: { name: string }[];
  /** 当日涨跌幅，小数形式。 */
  change: number;
  /** 净买入金额（元）。 */
  net_value: number;
  /** 净买入占比，小数形式。 */
  net_rate: number;
  /** 同花顺人气排名，越小越靠前。 */
  hot_rank: number;
  buy_value: number;
  sell_value: number;
  limit_reason: string;
  /** 上榜区间天数：1=当日榜，3=三日榜。 */
  range_days: number;
  org_net_value?: number;
  org_net_rate?: number;
  org_buy_num?: number;
  org_sell_num?: number;
  amount?: number;
  hot_money_net_value?: number;
  hot_money_net_rate?: number;
  hot_money_item_net_value?: number;
  hot_money_item_net_rate?: number;
}

/** 龙虎榜游资维度聚合条目。 */
export interface DragonTigerHotMoneyItem {
  name: string;
  /** 聚合净买入金额（元）。 */
  buying: number;
  /** 关联股票列表，字段同 DragonTigerStockItem。 */
  rows: DragonTigerStockItem[];
}

/** 龙虎榜榜单数据容器。 */
export interface DragonTigerListData {
  /** 目标交易日上海零点毫秒戳。 */
  timestamp: number;
  board_type: 'all' | 'org' | 'hot_money';
  trade_date: string;
  /** 上游记录数（同一股票可同时出现当日榜与 3 日榜）。 */
  count: number;
  /** 股票去重数量。 */
  stock_count: number;
  /** 股票维度榜单；hot_money 榜时为空数组。 */
  stock_items: DragonTigerStockItem[];
  /** 游资维度聚合榜单；普通榜时为空数组。 */
  hot_money_items: DragonTigerHotMoneyItem[];
}
