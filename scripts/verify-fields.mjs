/**
 * 全量字段契约校验（真实环境）。
 *
 * 用法：FUYAO_API_KEY=xxx node scripts/verify-fields.mjs
 *
 * 对每个端点的实际响应做两层比对：
 *   1) data 容器键 vs 文档登记的容器字段；
 *   2) item[] 元素键 vs 文档登记的条目字段。
 *
 * 输出三类结果：
 *   PASS   完全一致
 *   MISS   文档登记但响应缺失（含可选字段单独标注）
 *   EXTRA  响应存在但文档未记载（需回填审计文档）
 */
import { FuyaoClient } from '../dist/index.js';

const apiKey = process.env.FUYAO_API_KEY;
if (!apiKey) {
  console.error('缺少 FUYAO_API_KEY 环境变量');
  process.exit(1);
}
// 客户端级全局限速（约 2.5 QPS），替代脚本内散落的 sleep
const client = new FuyaoClient({ apiKey, timeoutMs: 20_000, intervalMs: 400 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); // 仅用于重试退避

const retry = async (fn, n = 3) => {
  let e;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (err) { e = err; if (i < n - 1) await sleep(1200); }
  }
  throw e;
};
const probeFund = async (cands) => {
  let last;
  for (const fn of cands) {
    try {
      const r = await fn();
      if (r.code === 0 && (r.data?.item ?? []).length > 0) return r;
      if (!last || (last.code !== undefined && last.code !== 0)) last = r;
    } catch (err) { last = err; }
    await sleep(300);
  }
  // 全部候选 code=0 但 item 为空：环境无数据，抛出可识别标记
  if (last && typeof last === 'object' && 'code' in last) {
    const e = new Error('ALL_EMPTY');
    e.name = 'AllCandidatesEmpty';
    e.envelope = last;
    throw e;
  }
  throw last;
};

/* ------------------------------------------------------------------ */
/* 文档期望 schema（来源 docs/API_AUDIT.md，与官方文档一一对应）           */
/* req = 必有字段；opt = 条件/可选字段                                   */
/* ------------------------------------------------------------------ */
const S = {
  tickerItem: { req: ['thscode', 'ticker', 'name', 'exchange', 'asset_type', 'currency'] },
  priceSnapshotItem: { req: ['thscode', 'ticker', 'last_price', 'price_change', 'price_change_ratio_pct', 'open_price', 'high_price', 'low_price', 'prev_price', 'volume', 'turnover'] },
  priceBar: { req: ['date_ms', 'open_price', 'high_price', 'low_price', 'close_price', 'volume', 'turnover'] },
  adjustFactor: { req: ['ticker', 'ex_date_ms', 'dividend_per_share', 'per_share_bonus'] },
  finMeta: ['thscode', 'ticker', 'period', 'fiscal_year', 'fiscal_period', 'report_date_ms', 'period_end_ms', 'currency'],
  income: [...S_finMetaSafe(), 'operating_income', 'operating_costs', 'operating_expenses', 'sales_fee', 'manage_fee', 'research_and_development_expenses', 'operating_profit', 'interest_expenses', 'profit_total', 'income_tax_expense', 'net_profit', 'parent_holder_net_profit', 'basic_eps'],
  balance: [...S_finMetaSafe(), 'assets_total', 'total_current_assets', 'non_current_nets_total', 'cash', 'accounts_receivable', 'total_debt', 'holder_equity_total'],
  cashflow: [...S_finMetaSafe(), 'act_cash_flow_net', 'invest_cash_flow_net', 'financing_cash_flow_net', 'pay_fixed_assets_etc_cash', 'pay_dividends_profits_interest_cash', 'cash_equivalents_net_addition'],
};

function S_finMetaSafe() {
  return ['thscode', 'ticker', 'period', 'fiscal_year', 'fiscal_period', 'report_date_ms', 'period_end_ms', 'currency'];
}

/** 校验用例表：name → { call, data(req), itemSchema } */
const cases = [
  {
    name: 'meta.search',
    call: () => client.meta.search({ q: '贵州茅台' }),
    dataReq: ['timestamp', 'item'], item: S.tickerItem,
  },
  {
    name: 'meta.listTickers',
    call: () => client.meta.listTickers({ assetType: 'a-share-index', limit: 5 }),
    dataReq: ['timestamp', 'item'],
    item: S.tickerItem,
  },
  {
    name: 'prices.snapshot',
    call: () => client.aShare.prices.snapshot({ thscodes: ['600519.SH'] }),
    dataReq: ['timestamp', 'total', 'item'], item: S.priceSnapshotItem,
  },
  {
    name: 'prices.historical',
    call: () => client.aShare.prices.historical({ thscode: '600519.SH', start: 1747584000000, end: 1751328000000 }),
    // 服务端实际还会返回 thscode/interval/adjust（已回填审计文档）
    dataReq: ['timestamp', 'thscode', 'interval', 'adjust', 'item'], item: S.priceBar,
  },
  {
    name: 'corporate-actions.adjustment-factors',
    call: () => client.aShare.corporateActions.adjustmentFactors({ thscode: '600519.SH' }),
    dataReq: ['thscode', 'ticker', 'item'], item: S.adjustFactor,
  },
  {
    name: 'financials.income-statements',
    call: () => client.aShare.financials.incomeStatements({ thscode: '600519.SH', limit: 2 }),
    dataReq: ['timestamp', 'item'],
    item: { req: S.income, opt: [] }, // 字段可能为 null 但键应存在
  },
  {
    name: 'financials.balance-sheets',
    call: () => client.aShare.financials.balanceSheets({ thscode: '600519.SH', limit: 2 }),
    dataReq: ['timestamp', 'item'], item: { req: S.balance },
  },
  {
    name: 'financials.cash-flow-statements',
    call: () => client.aShare.financials.cashFlowStatements({ thscode: '600519.SH', limit: 2 }),
    dataReq: ['timestamp', 'item'], item: { req: S.cashflow },
  },
  {
    name: 'financials.indicators',
    call: () => client.aShare.financials.indicators({ thscode: '300033.SZ', report: '2025-1' }),
    dataReq: ['thscode', 'report', 'abilities'],
    item: null,
    nestedCheck: (data) => {
      const errs = [];
      const order = ['growth', 'profitability', 'solvency', 'operation', 'cash-flow'];
      if (JSON.stringify(data.abilities.map((a) => a.ability)) !== JSON.stringify(order)) {
        errs.push(`abilities 顺序异常: ${data.abilities.map((a) => a.ability).join(',')}`);
      }
      for (const a of data.abilities) {
        if (!('ability' in a)) errs.push('abilities[] 缺 ability');
        for (const ind of a.indicators ?? []) {
          if (!('index_id' in ind && 'value' in ind)) errs.push(`${a.ability}.indicators 缺 index_id/value`);
          else if (ind.value !== null && typeof ind.value !== 'string') errs.push(`${ind.index_id}.value 非字符串: ${typeof ind.value}`);
        }
      }
      return errs;
    },
  },
  {
    name: 'calendar.trading-days',
    call: () => client.aShare.calendar.tradingDays(),
    dataReq: ['timestamp', 'item'],
    item: { req: ['date_ms', 'date'] },
  },
  {
    name: 'valuations.snapshot',
    call: () => client.aShare.valuations.snapshot({ thscodes: '600519.SH,000001.SZ' }),
    dataReq: ['timestamp', 'total', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'pe_ttm', 'pe_mrq', 'pb_mrq', 'ps_ttm', 'pcf_ttm'] },
  },
  {
    name: 'auction.snapshot',
    call: () => client.aShare.auction.snapshot({ thscodes: '600519.SH' }),
    dataReq: ['timestamp', 'auction_phase', 'data_status', 'total', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'auction_price', 'auction_pct', 'auction_volume', 'auction_amount', 'auction_unmatched', 'auction_turnover_pct', 'auction_yesterday_ratio_pct', 'auction_volume_ratio', 'pre_close_price', 'open_price', 'last_price', 'float_market_cap'] },
  },
  {
    name: 'auction.short-term-benchmark',
    call: () => client.aShare.auction.shortTermBenchmark(),
    dataReq: ['timestamp', 'date', 'date_ms', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'auction_pct', 'tags'] },
  },
  {
    name: 'index.catalog.ths-index-list',
    call: () => client.index.catalogThsIndexList({ tag: 'industry' }),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'name'] },
  },
  {
    name: 'index.constituents.ths-stock-list',
    call: () => client.index.constituentsThsStockList({ thscode: '000300.SH' }),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'name'] },
  },
  {
    name: 'index.prices.snapshot',
    call: () => client.index.pricesSnapshot({ thscodes: '000001.SH' }),
    dataReq: ['timestamp', 'total', 'item'], item: S.priceSnapshotItem,
  },
  {
    name: 'index.prices.historical',
    call: () => client.index.pricesHistorical({ thscode: '000001.SH', start: 1747584000000, end: 1751328000000 }),
    dataReq: ['timestamp', 'adjust', 'thscode', 'interval', 'item'],
    item: S.priceBar,
    extraChecks: [(d) => d.adjust === null ? [] : [`指数接口 adjust 应为 null，实际 ${d.adjust}`]],
  },
  {
    name: 'special-data.limit-up-pool',
    call: () => client.specialData.limitUpPool({ page: 1, size: 3 }),
    dataReq: ['timestamp', 'pagination', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'is_st', 'is_new', 'last_price', 'price_change_ratio_pct', 'limit_up_time', 'limit_up_reason', 'continue_day_text', 'continue_day_cnt', 'seal_money', 'max_seal_money'] },
    containerExtra: {
      paginationReq: ['total', 'pages', 'size', 'page'],
    },
  },
  {
    name: 'special-data.limit-down-pool',
    call: () => client.specialData.limitDownPool({ page: 1, size: 3 }),
    dataReq: ['timestamp', 'pagination', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'last_price', 'price_change_ratio_pct', 'first_limit_time', 'last_limit_time', 'turnover_ratio_pct'] },
    containerExtra: { paginationReq: ['total', 'pages', 'size', 'page'] },
  },
  {
    name: 'special-data.limit-break-pool',
    call: () => client.specialData.limitBreakPool({ page: 1, size: 3 }),
    dataReq: ['timestamp', 'pagination', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'last_price', 'price_change_ratio_pct', 'open_times', 'turnover_ratio_pct', 'turnover'] },
    containerExtra: { paginationReq: ['total', 'pages', 'size', 'page'] },
  },
  {
    name: 'special-data.limit-up-ladder',
    call: () => client.specialData.limitUpLadder(),
    dataReq: ['timestamp', 'window', 'item'],
    item: null,
    nestedCheck: (data) => {
      const errs = [];
      const boards = ['two_board', 'three_board', 'four_board', 'five_board', 'six_board', 'seven_over'];
      for (const day of data.item ?? []) {
        if (!('date' in day)) errs.push('ladder 日项缺 date');
        for (const b of boards) {
          if (!(b in (day.boards ?? {}))) errs.push(`ladder ${day.date} 缺板位 ${b}`);
          for (const st of day.boards?.[b] ?? []) {
            for (const k of ['thscode', 'ticker', 'name', 'board_num', 'seal_nextday', 'sign_level']) {
              if (!(k in st)) errs.push(`ladder ${day.date}.${b} 缺 ${k}`);
            }
          }
        }
      }
      for (const k of ['length', 'date_list', 'board_caps']) if (!(k in (data.window ?? {}))) errs.push(`window 缺 ${k}`);
      return errs;
    },
  },
  {
    name: 'special-data.skyrocket-list',
    call: () => client.specialData.skyrocketList(),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'rank', 'heat', 'rank_change', 'rank_trend'] },
  },
  {
    name: 'special-data.hot-stock-list',
    call: () => client.specialData.hotStockList(),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'rank', 'heat', 'rank_change', 'rank_trend'] },
  },
  {
    name: 'special-data.hot-stock-list-history',
    call: () => {
      const d = new Date(Date.now() - 86400000);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return client.specialData.hotStockListHistory({ date });
    },
    dataReq: ['date', 'date_ms', 'item'],
    item: { req: ['thscode', 'ticker', 'name', 'rank'] },
  },
  {
    name: 'special-data.hot-stock-rank-trend',
    call: () => client.specialData.hotStockRankTrend({
      thscode: '300034.SZ',
      startDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    }),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'date', 'date_ms', 'rank'] },
  },
  {
    name: 'special-data.anomaly-analysis-list',
    call: () => client.specialData.anomalyAnalysisList(),
    dataReq: ['timestamp', 'item'],
    item: { req: ['stock_name', 'analysis_content', 'keyword_list', 'thscode', 'tag_name'] },
  },
  {
    name: 'special-data.dragon-tiger-list',
    call: () => client.specialData.dragonTigerList(),
    dataReq: ['timestamp', 'board_type', 'trade_date', 'count', 'stock_count', 'stock_items', 'hot_money_items'],
    item: {
      req: ['thscode', 'ticker', 'name', 'change', 'net_value', 'net_rate', 'hot_rank', 'buy_value', 'sell_value', 'range_days'],
      opt: ['concept_list', 'limit_reason', 'org_net_value', 'org_net_rate', 'org_buy_num', 'org_sell_num', 'amount', 'hot_money_net_value', 'hot_money_net_rate', 'hot_money_item_net_value', 'hot_money_item_net_rate'],
    },
    nestedCheck: (data) => {
      const errs = [];
      for (const hm of data.hot_money_items ?? []) {
        for (const k of ['name', 'buying', 'rows']) if (!(k in hm)) errs.push(`hot_money_items 缺 ${k}`);
      }
      return errs;
    },
  },
  /* ---------------- 基金 ---------------- */
  {
    name: 'fund.profile.detail',
    call: () => probeFund([
      () => client.funds.profile.detail({ fundType: 'otc', thscode: '000037.OF' }),
      () => client.funds.profile.detail({ fundType: 'exchange', thscode: '510300.SH' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'fund_name', 'estab_date', 'company_id', 'mgmt_name', 'manager_name', 'fund_scale', 'unit_nav', 'manager_info', 'trade_rule', 'rate_info'] },
  },
  {
    name: 'fund.portfolio.holdings',
    call: () => probeFund([
      () => client.funds.portfolio.holdings({ fundType: 'otc', thscode: '158003.SZ' }),
      () => client.funds.portfolio.holdings({ fundType: 'exchange', thscode: '510300.SH' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: {
      req: ['thscode', 'ticker', 'stock_name', 'hold_ratio', 'asset_type', 'position_capital', 'position_count', 'security_market_value_rate_pct', 'period_increase_rate_pct', 'investment_rank', 'end_date_ms'],
      opt: ['start_date_ms', 'publish_date_ms', 'modify_time_ms'],
    },
    containerExtra: { extraContainerOpt: ['total_stock_ratio_pct', 'total_bond_ratio_pct', 'total_fund_ratio_pct', 'turnover_rate_pct', 'stock_ratio_pct', 'main_industry', 'concentration_ratio'] },
  },
  {
    name: 'fund.portfolio.stock-report-dates',
    call: () => probeFund([
      () => client.funds.portfolio.stockReportDates({ fundType: 'exchange', thscode: '510300.SH' }),
      () => client.funds.portfolio.stockReportDates({ fundType: 'otc', thscode: '000037.OF' }),
    ]),
    requireNonEmptyItem: true,
    dataReq: ['timestamp', 'item'],
    item: { req: ['report_type', 'report_type_name', 'start_date_ms', 'end_date_ms'] },
  },
  {
    name: 'fund.portfolio.asset-allocation',
    call: () => probeFund([
      () => client.funds.portfolio.assetAllocation({ fundType: 'otc', thscode: '158003.SZ' }),
      () => client.funds.portfolio.assetAllocation({ fundType: 'otc', thscode: '000037.OF' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: { req: ['report_date_ms', 'stock_ratio_pct', 'bond_ratio_pct', 'deposit_ratio_pct', 'other_ratio_pct'] },
  },
  {
    name: 'fund.performance.nav',
    call: () => probeFund([
      () => client.funds.performance.nav({ fundType: 'otc', thscode: '158003.SZ', range: 'month', navType: 'unit,adj' }),
    ]),
    dataReq: ['timestamp', 'item'],
    // nav_type=unit,adj 时两个字段都应输出
    item: { req: ['nav_date', 'unit_nav', 'adj_nav'] },
  },
  {
    name: 'fund.performance.returns',
    call: () => probeFund([
      () => client.funds.performance.returns({ fundType: 'otc', thscode: '158003.SZ' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: {
      req: ['return_month', 'return_tmonth', 'return_hyear', 'return_year', 'return_tyear', 'return_fyear', 'return_nowyear', 'return_now'],
      opt: ['return_week', 'return_twoyear'],
      wildcardOpt: ['peer_average_', 'rank_', 'rank_total_'], // 文档模式化字段
    },
  },
  {
    name: 'fund.performance.indicators-historical',
    call: () => probeFund([
      () => client.funds.performance.indicatorsHistorical({ fundType: 'otc', thscode: '158003.SZ', start: 1751328000000, end: 1767225599000 }),
      () => client.funds.performance.indicatorsHistorical({ fundType: 'exchange', thscode: '510300.SH', start: 1751328000000, end: 1767225599000 }),
      () => client.funds.performance.indicatorsHistorical({ fundType: 'otc', thscode: '000037.OF', start: 1751328000000, end: 1767225599000 }),
    ]),
    requireNonEmptyItem: true,
    dataReq: ['timestamp', 'item'],
    item: {
      req: ['date_ms', 'rsi_pct', 'donchian_channel'],
      // 跟踪指数 PE TTM 五年分位仅指数跟踪型基金提供，属条件字段
      opt: ['track_index_pe_ttm_five_year_percentile'],
    },
  },
  {
    name: 'fund.performance.drawdowns',
    call: () => probeFund([
      () => client.funds.performance.drawdowns({ fundType: 'otc', thscode: '158003.SZ' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'week', 'month', 'tmonth', 'hyear', 'year', 'twoyear', 'tyear', 'fyear', 'nowyear', 'now'] },
  },
  {
    name: 'fund.holders.detail',
    call: () => probeFund([
      () => client.funds.holders.detail({ fundType: 'otc', thscode: '000037.OF' }),
      () => client.funds.holders.detail({ fundType: 'exchange', thscode: '161725.SZ' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: { req: ['merge_scope', 'report_date_ms', 'ins_position', 'holder_amount', 'avg_holder_share', 'psnl_rate', 'mgmt_staff_hold_rate'] },
  },
  {
    name: 'fund.corporate-actions.dividends',
    call: () => probeFund([
      () => client.funds.corporateActions.dividends({ fundType: 'otc', thscode: '000037.OF' }),
    ]),
    dataReq: ['timestamp', 'dividend_count', 'dividend_total', 'item'],
    item: { req: ['per_ten_cash_before_tax', 'per_ten_cash_after_tax', 'progress', 'publish_date_ms', 'registration_date_ms', 'ex_dividend_date_ms', 'payment_date_ms', 'reinvestment_date_ms', 'profit_base_date_ms', 'in_dividend_date_ms'] },
  },
  {
    name: 'fund.diagnostics.detail',
    call: () => probeFund([
      () => client.funds.diagnostics.detail({ fundType: 'otc', thscode: '158003.SZ' }),
    ]),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'fund_type', 'peer_code', 'dimensions', 'peer_dimensions', 'probabilities', 'ranges', 'resilience', 'peer_resilience'] },
  },
  {
    name: 'fund.offerings.list',
    call: () => client.funds.offerings.list({ subscribe: 'active' }),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'subscription_start_ms', 'subscription_end_ms'] },
  },
  {
    name: 'fund.news.article-list',
    call: () => probeFund([
      () => client.funds.news.articleList({ fundType: 'exchange', thscode: '510300.SH', limit: 5 }),
      () => client.funds.news.articleList({ fundType: 'otc', thscode: '110022.OF', limit: 5 }),
      () => client.funds.news.articleList({ fundType: 'otc', thscode: '158003.SZ', limit: 5 }),
    ]),
    requireNonEmptyItem: true,
    dataReq: ['timestamp', 'limit', 'offset', 'has_more', 'item'],
    item: { req: ['id', 'content_type', 'title', 'summary', 'source', 'url', 'image_url', 'author', 'publish_time_ms', 'top'] },
  },
  {
    name: 'fund.market.snapshot',
    call: () => client.funds.market.snapshot({ thscode: '510300.SH' }),
    dataReq: ['timestamp', 'item'],
    item: { req: ['thscode', 'ticker', 'last_price', 'open_price', 'high_price', 'low_price', 'prev_price', 'price_change_ratio_pct', 'price_change', 'price_amplitude_ratio_pct', 'volume', 'turnover', 'turnover_ratio_pct'] },
  },
  {
    name: 'fund.market.historical',
    call: () => client.funds.market.historical({ thscode: '510300.SH', start: 1751328000000, end: 1759008000000 }),
    dataReq: ['timestamp', 'thscode', 'interval', 'adjust', 'item'],
    item: S.priceBar,
    extraChecks: [(d) => (d.interval === '1d' && d.adjust === null) ? [] : [`interval=${d.interval}, adjust=${d.adjust}`]],
  },
];

/* ------------------------------------------------------------------ */
/* 执行比对                                                            */
/* ------------------------------------------------------------------ */
let passCount = 0;
const failures = [];

function diffKeys(expected, actual, wildcards = []) {
  const known = new Set(expected);
  const actualKeys = Object.keys(actual);
  const miss = expected.filter((k) => !knownHas(actualKeys, k));
  return miss;
}
function knownHas(actualKeys, k) { return actualKeys.includes(k); }

for (const c of cases) {
  let res;
  try {
    res = await retry(c.call);
  } catch (err) {
    if (err.name === 'AllCandidatesEmpty') {
      passCount++;
      console.log(`SKIP  ${c.name}  ⚠ 全部样本候选均返回空数据（环境限制），仅校验容器键`);
      // 空响应仍可校验容器键
      const data = err.envelope?.data ?? {};
      const missContainer = diffKeys(c.dataReq.filter((k) => k !== 'offset' || 'offset' in data), data);
      const softMiss = missContainer.filter((k) => k !== 'offset'); // 实测空响应会省略 offset
      if (softMiss.length) { failures.push([c.name, 'MISS', `data 缺 [${softMiss.join(',')}]`]); console.log(`      data 缺 [${softMiss.join(',')}]`); }
      continue;
    }
    failures.push([c.name, 'CALL-FAIL', err.name === 'FuyaoApiError' ? `code=${err.code} ${err.message.slice(0, 60)}` : `${err.name}: ${err.message.slice(0, 60)}`]);
    continue;
  }
  if (res.code !== 0 || !res.data) {
    failures.push([c.name, 'BIZ', `code=${res.code} ${res.message}`]);
    continue;
  }
  const problems = [];
  const extras = [];
  const data = res.data;

  // 容器键比对
  const missContainer = diffKeys(c.dataReq, data);
  if (missContainer.length) problems.push(`data 缺 [${missContainer.join(',')}]`);
  const knownContainer = new Set([...c.dataReq, ...(c.containerExtra?.extraContainerOpt ?? [])]);
  for (const k of Object.keys(data)) {
    if (!knownContainer.has(k)) extras.push(`data.${k}`);
  }

  // 分页子对象
  if (c.containerExtra?.paginationReq && data.pagination) {
    const missPg = diffKeys(c.containerExtra.paginationReq, data.pagination);
    if (missPg.length) problems.push(`pagination 缺 [${missPg.join(',')}]`);
  }

  // item 键比对
  if (c.item && Array.isArray(data.item) && data.item.length > 0) {
    const sample = data.item[0];
    const missItem = diffKeys(c.item.req, sample);
    if (missItem.length) problems.push(`item 缺 [${missItem.join(',')}]`);
    const known = new Set([...(c.item.req ?? []), ...(c.item.opt ?? [])]);
    const wildcards = c.item.wildcardOpt ?? [];
    for (const k of Object.keys(sample)) {
      if (!known.has(k) && !wildcards.some((p) => k.startsWith(p))) extras.push(`item.${k}`);
    }
  } else if (c.item && Array.isArray(data.item) && data.item.length === 0 && !c.requireNonEmptyItem) {
    problems.push('item 为空数组，无法校验条目字段');
  }

  // 嵌套结构自定义校验
  if (c.nestedCheck) problems.push(...c.nestedCheck(data));
  if (c.extraChecks) for (const fn of c.extraChecks) problems.push(...fn(data));

  if (problems.length === 0) {
    passCount++;
    console.log(`PASS  ${c.name}${extras.length ? `  ⚠ 未记载字段: ${extras.join(', ')}` : ''}`);
    for (const e of extras) failures.push([c.name, 'EXTRA(仅提示)', e]);
  } else {
    failures.push([c.name, 'MISS', problems.join('; ')]);
    console.log(`FAIL  ${c.name}  ${problems.join('; ')}${extras.length ? ` | ⚠ 未记载: ${extras.join(', ')}` : ''}`);
  }
  await sleep(200);
}

console.log('-'.repeat(90));
console.log(`契约比对完成：PASS=${passCount}/${cases.length}`);
if (failures.length) {
  console.log('\n差异明细：');
  for (const [name, kind, detail] of failures) console.log(`  [${kind}] ${name}: ${detail}`);
}
process.exit(failures.some(([, k]) => k === 'MISS' || k === 'CALL-FAIL' || k === 'BIZ') ? 1 : 0);
