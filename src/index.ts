/**
 * fuyao 同花顺金融数据 API SDK — 客户端聚合根与公共导出。
 */
import { FuyaoHttpClient } from './http';
import type { FuyaoClientOptions } from './http';
import { MetaResource } from './resources/meta';
import { DumpsResource } from './resources/dumps';
import {
  AuctionResource,
  CalendarResource,
  CorporateActionsResource,
  FinancialStatementsResource,
  PricesResource,
  ValuationsResource,
} from './resources/aShare';
import { IndexResource } from './resources/indexDomain';
import { SpecialDataResource } from './resources/specialData';
import { FundsResource } from './resources/funds';

/** FuyaoClient 构造选项。 */
export type { FuyaoClientOptions, FetchLike } from './http';

/**
 * 同花顺金融数据 API 客户端。
 *
 * 资源域组织：
 * - {@link FuyaoClient.meta}：标的检索 / 标的列表
 * - {@link FuyaoClient.dumps}：全市场 Parquet 导出下载链接
 * - {@link FuyaoClient.aShare}：A 股行情 / 除复权 / 财务 / 日历 / 估值 / 集合竞价
 * - {@link FuyaoClient.index}：指数目录 / 成分股 / 指数行情
 * - {@link FuyaoClient.specialData}：涨跌停、热榜、异动、龙虎榜
 * - {@link FuyaoClient.funds}：基金全量业务接口
 *
 * @example
 * ```ts
 * import { FuyaoClient } from 'fuyao-api';
 *
 * const client = new FuyaoClient({ apiKey: process.env.FUYAO_API_KEY! });
 * const snap = await client.aShare.prices.snapshot({ thscodes: '600519.SH' });
 * if (snap.code === 0) console.log(snap.data?.item[0]?.last_price);
 * ```
 */
export class FuyaoClient {
  /** 元信息域：标的检索与代码表。 */
  readonly meta: MetaResource;
  /** 全市场数据导出（Parquet 预签名链接）。 */
  readonly dumps: DumpsResource;
  /** A 股数据域。 */
  readonly aShare: {
    prices: PricesResource;
    corporateActions: CorporateActionsResource;
    financials: FinancialStatementsResource;
    calendar: CalendarResource;
    valuations: ValuationsResource;
    auction: AuctionResource;
  };
  /** 指数数据域（同花顺指数 + 标准指数）。 */
  readonly index: IndexResource;
  /** 特色数据域。 */
  readonly specialData: SpecialDataResource;
  /** 基金数据域。 */
  readonly funds: FundsResource;

  /**
   * @param options 必须包含 apiKey；可选 baseUrl/timeoutMs/fetch。
   * @throws {TypeError} apiKey 缺失或为空。
   */
  constructor(options: FuyaoClientOptions) {
    const http = new FuyaoHttpClient(options);
    this.meta = new MetaResource(http);
    this.dumps = new DumpsResource(http);
    this.aShare = {
      prices: new PricesResource(http),
      corporateActions: new CorporateActionsResource(http),
      financials: new FinancialStatementsResource(http),
      calendar: new CalendarResource(http),
      valuations: new ValuationsResource(http),
      auction: new AuctionResource(http),
    };
    this.index = new IndexResource(http);
    this.specialData = new SpecialDataResource(http);
    this.funds = new FundsResource(http);
  }
}

/* 错误体系导出 */
export {
  FuyaoApiError,
  FuyaoHttpError,
  FuyaoTimeoutError,
} from './errors';
export { ErrorCode } from './types';

/* 类型导出（信封与全部响应结构） */
export type {
  ApiResponse,
  AssetType,
  ExchangeFilter,
  TickerItem,
  TickerListData,
  AdjustMode,
  PriceSnapshotItem,
  PriceSnapshotData,
  PriceBarItem,
  PriceHistoricalData,
  AdjustmentFactorItem,
  AdjustmentFactorsData,
  FinancialPeriod,
  IncomeStatementItem,
  BalanceSheetItem,
  CashFlowStatementItem,
  FinancialListData,
  FinancialAbility,
  FinancialAbilityBlock,
  FinancialIndicatorsData,
  TradingDayItem,
  TradingDaysData,
  ValuationSnapshotItem,
  ValuationSnapshotData,
  AuctionStage,
  AuctionSnapshotItem,
  AuctionSnapshotData,
  ShortTermBenchmarkItem,
  ShortTermBenchmarkData,
  ThsIndexTag,
  ThsIndexListItem,
  IndexConstituentItem,
  PoolPagination,
  LimitUpPoolItem,
  LimitUpPoolData,
  LimitDownPoolItem,
  LimitDownPoolData,
  LimitBreakPoolItem,
  LimitBreakPoolData,
  LadderStockItem,
  LadderBoardKey,
  LadderDayItem,
  LimitUpLadderData,
  HotStockRankItem,
  HotStockListData,
  HistoryHotStockItem,
  HotStockHistoryData,
  RankTrendPoint,
  RankTrendData,
  AnomalyTag,
  AnomalyAnalysisItem,
  AnomalyAnalysisData,
  DragonTigerStockItem,
  DragonTigerHotMoneyItem,
  DragonTigerListData,
} from './types';

/* 资源类与入参类型再导出，便于高级用法与测试 */
export type {
  TickerSearchParams,
  TickerListParams,
} from './resources/meta';
export type { DumpKind } from './resources/dumps';
export type {
  PriceSnapshotParams,
  PriceHistoricalParams,
  AdjustmentFactorsParams,
  FinancialStatementParams,
} from './resources/aShare';
export type {
  PoolQueryParams,
  LimitUpSortField,
  LimitDownSortField,
  LimitBreakSortField,
} from './resources/specialData';
export type {
  FundType,
  NavRange,
  FundHistoryParams,
  FundReportDatesParams,
} from './resources/funds';
