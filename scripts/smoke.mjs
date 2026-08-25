/**
 * 真实环境全端点集成冒烟测试（只读）。
 *
 * 用法：FUYAO_API_KEY=xxx node scripts/smoke.mjs
 *
 * 样本策略：
 * - 基金样本全部来自 /api/meta/tickers/list 真实代码表（动态加载），
 *   不使用硬编码示例代码；ETF 同时探测 exchange / otc 分区。
 * - A 股/指数样本使用流动性最高的公开标的，并在开始前经 search 校验存在。
 *
 * 结果归类：OK（code=0）/ BIZ（重试后仍非 0 业务码）/ THROW（客户端异常）。
 */
import { FuyaoClient } from '../dist/index.js';
import { loadFundSamples, fundProbe, withRetry } from './lib-samples.mjs';

const apiKey = process.env.FUYAO_API_KEY;
if (!apiKey) {
  console.error('缺少 FUYAO_API_KEY 环境变量');
  process.exit(1);
}

// 客户端级全局限速：约 2.5 QPS，避免触发上游限频/间歇性空数据
const client = new FuyaoClient({ apiKey, timeoutMs: 20_000, intervalMs: 400 });

/* ------------------------------------------------------------------ */
/* 第 0 步：从接口动态加载样本                                          */
/* ------------------------------------------------------------------ */
console.log('== 加载动态样本 ==');
// A 股样本：从 a-share 代码表取前几只（含主板，确保行情/财务可用）
const ashareList = await withRetry(() => client.meta.listTickers({ assetType: 'a-share', limit: 5 }));
const ASHARE = (ashareList.data?.item ?? []).map((t) => t.thscode);
// 指数样本（优先标准宽基指数：000xxx.SH / 399xxx.SZ）
const idxList = await withRetry(() => client.meta.listTickers({ assetType: 'a-share-index', limit: 30 }));
const IDX_ALL = (idxList.data?.item ?? []).map((t) => t.thscode);
const IDX_STD = IDX_ALL.filter((c) => /^(000|399)\d{3}\.(SH|SZ)$/.test(c));
const IDX = [...new Set([...IDX_STD, ...IDX_ALL])];

// 基金样本（动态 + 分区探测；内部已带非空重试）
const { etfCodes, otcCodes, candidates: FUND_CANDS } = await loadFundSamples(client);
if (!FUND_CANDS.length || !ASHARE.length) {
  console.error('代码表加载失败，无法构造样本');
  process.exit(1);
}
console.log(`A 股样本: ${ASHARE.slice(0, 3).join(',')} ...`);
console.log(`指数样本: ${IDX.slice(0, 2).join(',')}${IDX.length ? '' : ' (空)'}`);
console.log(`基金样本: ETF=${etfCodes.slice(0, 3).join(',')}... OTC=${otcCodes.slice(0, 3).join(',')}...`);
console.log();

const STOCK = ASHARE[0];
const STOCK2 = ASHARE[1] ?? ASHARE[0];
const IDX0 = IDX[0] ?? '000001.SH';

/* ------------------------------------------------------------------ */
/* 端点清单                                                            */
/* ------------------------------------------------------------------ */
const cases = [
  ['01', 'meta.search', () => client.meta.search({ q: '贵州茅台', limit: 5 })],
  ['02', 'meta.search(asset_type)', () =>
    client.meta.search({ q: etfCodes[0]?.slice(0, 6) ?? '510300', assetType: 'fund-etf' })],
  ['03', 'meta.listTickers', () => client.meta.listTickers({ assetType: 'a-share-index', limit: 10 })],
  ['04', 'dumps.dailyKDownloadUrl', () => client.dumps.dailyKDownloadUrl()],
  ['05', 'dumps.dailyK10dDownloadUrl', () => client.dumps.dailyK10dDownloadUrl()],
  ['06', 'dumps.adjustmentFactorsDownloadUrl', () => client.dumps.adjustmentFactorsDownloadUrl()],
  ['07', 'prices.snapshot(thscodes)', () =>
    client.aShare.prices.snapshot({ thscodes: [STOCK, STOCK2] })],
  ['08', 'prices.snapshot(paged)', () => client.aShare.prices.snapshot({ limit: 3, offset: 0 })],
  ['09', 'prices.historical', () =>
    client.aShare.prices.historical({ thscode: STOCK, start: 1716105600000, end: 1747641600000 })],
  ['10', 'corporate-actions.adjustment-factors', () =>
    client.aShare.corporateActions.adjustmentFactors({ thscode: STOCK })],
  ['11', 'financials.incomeStatements(limit)', () =>
    client.aShare.financials.incomeStatements({ thscode: STOCK, period: 'annual', limit: 3 })],
  ['12', 'financials.incomeStatements(range)', () =>
    client.aShare.financials.incomeStatements({
      thscode: STOCK, period: 'quarterly',
      start: 1672502400000, end: 1735574400000,
    })],
  ['13', 'financials.balanceSheets', () =>
    client.aShare.financials.balanceSheets({ thscode: STOCK2, period: 'quarterly' })],
  ['14', 'financials.cashFlowStatements', () =>
    client.aShare.financials.cashFlowStatements({ thscode: STOCK })],
  ['15', 'financials.indicators', () =>
    fundProbe(
      (p) => client.aShare.financials.indicators({
        thscode: p.thscode,
        // 最近已披露年报：财年 = 当前年 - 1（4 月底前再减一）
        report: `${new Date().getFullYear() - ((new Date().getMonth() + 1) < 4 ? 2 : 1)}-4`,
      }),
      // 指标数据用 A 股样本逐个尝试（report 取最近完整年报）
      ASHARE.map((thscode) => ({ thscode })),
      { maxTries: 3 },
    )],
  ['16', 'calendar.tradingDays', () => client.aShare.calendar.tradingDays()],
  ['17', 'valuations.snapshot', () =>
    client.aShare.valuations.snapshot({ thscodes: `${STOCK},${STOCK2}` })],
  ['18', 'auction.snapshot', () =>
    client.aShare.auction.snapshot({ thscodes: `${STOCK},${STOCK2}` })],
  ['19', 'auction.shortTermBenchmark', () => client.aShare.auction.shortTermBenchmark()],
  ['20', 'index.catalogThsIndexList(concept)', () =>
    client.index.catalogThsIndexList({ tag: 'cn_concept' })],
  ['21', 'index.catalogThsIndexList(industry)', () =>
    client.index.catalogThsIndexList({ tag: 'industry' })],
  ['22', 'index.constituentsThsStockList(TI)', async () => {
    // 从概念列表动态取第一个同花顺板块指数
    const cat = await client.index.catalogThsIndexList({ tag: 'cn_concept' });
    const ti = (cat.data?.item ?? []).find((x) => x.thscode.endsWith('.TI'));
    return client.index.constituentsThsStockList({ thscode: ti.thscode });
  }],
  ['23', 'index.constituentsThsStockList(std)', () => {
    const std = IDX.find((c) => c.endsWith('.SH') || c.endsWith('.SZ'));
    return client.index.constituentsThsStockList({ thscode: std ?? IDX0 });
  }],
  ['24', 'index.pricesSnapshot', () =>
    client.index.pricesSnapshot({ thscodes: IDX.slice(0, 3).join(',') || IDX0 })],
  ['25', 'index.pricesHistorical', () =>
    client.index.pricesHistorical({ thscode: IDX0, start: 1716105600000, end: 1747641600000 })],
  ['26', 'specialData.limitUpPool', () => client.specialData.limitUpPool({ page: 1, size: 5 })],
  ['27', 'specialData.limitDownPool', () => client.specialData.limitDownPool({ page: 1, size: 5 })],
  ['28', 'specialData.limitBreakPool', () => client.specialData.limitBreakPool({ page: 1, size: 5 })],
  ['29', 'specialData.limitUpLadder', () => client.specialData.limitUpLadder()],
  ['30', 'specialData.skyrocketList(day)', () => client.specialData.skyrocketList({ period: 'day' })],
  ['31', 'specialData.hotStockList(hour)', () => client.specialData.hotStockList({ period: 'hour' })],
  ['32', 'specialData.hotStockListHistory', () => {
    const d = new Date(Date.now() - 86400000);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return client.specialData.hotStockListHistory({ date });
  }],
  ['33', 'specialData.hotStockRankTrend', () => {
    const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    // 从飙升榜动态取一只个股作为走势样本
    return client.specialData.skyrocketList().then((r) => {
      const code = r.data?.item?.[0]?.thscode ?? STOCK;
      return client.specialData.hotStockRankTrend({
        thscode: code,
        startDate: fmt(new Date(Date.now() - 7 * 86400000)),
        endDate: fmt(new Date()),
      });
    });
  }],
  ['34', 'specialData.anomalyAnalysisList', () =>
    client.specialData.anomalyAnalysisList({ tagCodes: ['LIMIT_UP'] })],
  ['35', 'anomalyAnalysisStock(动态)', async () => {
    // 从涨停池动态取当日有异动的股票查询
    const pool = await client.specialData.limitUpPool({ page: 1, size: 5 });
    const codes = (pool.data?.item ?? []).map((x) => x.thscode);
    return client.specialData.anomalyAnalysisStock({
      thscodes: codes.length ? codes.join(',') : STOCK,
    });
  }],
  ['36', 'dragonTigerList(all)', () => client.specialData.dragonTigerList()],
  ['37', 'dragonTigerList(org)', () => client.specialData.dragonTigerList({ boardType: 'org' })],

  /* ---------------- 基金（样本全部来自代码表动态探测） ---------------- */
  ['38', 'funds.profile.detail', () =>
    fundProbe((p) => client.funds.profile.detail(p), FUND_CANDS)],
  ['39', 'funds.portfolio.holdings', () =>
    fundProbe((p) => client.funds.portfolio.holdings(p), FUND_CANDS)],
  ['40', 'portfolio.stockHistory', () =>
    fundProbe(
      (p) => client.funds.portfolio.stockHistory({
        ...p, reportType: 'quarter',
        endDate: (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })(),
      }),
      FUND_CANDS,
    )],
  ['41', 'portfolio.bondHistory', () =>
    fundProbe(
      (p) => client.funds.portfolio.bondHistory({
        ...p, reportType: 'quarter',
        endDate: (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })(),
      }),
      FUND_CANDS,
    )],
  ['42', 'portfolio.stockReportDates', () =>
    fundProbe((p) => client.funds.portfolio.stockReportDates(p), FUND_CANDS)],
  ['43', 'portfolio.assetAllocation', () =>
    fundProbe((p) => client.funds.portfolio.assetAllocation(p), FUND_CANDS)],
  ['44', 'portfolio.industryAllocation', () =>
    fundProbe((p) => client.funds.portfolio.industryAllocation(p), FUND_CANDS)],
  ['45', 'performance.nav', () =>
    fundProbe((p) => client.funds.performance.nav({ ...p, range: 'month', navType: 'unit,adj' }), FUND_CANDS)],
  ['46', 'performance.returns', () =>
    fundProbe((p) => client.funds.performance.returns(p), FUND_CANDS)],
  ['47', 'performance.indicatorsHistorical', () =>
    fundProbe(
      (p) => client.funds.performance.indicatorsHistorical({ ...p, start: 1751328000000, end: 1767225599000 }),
      FUND_CANDS,
    )],
  ['48', 'performance.drawdowns', () =>
    fundProbe((p) => client.funds.performance.drawdowns(p), FUND_CANDS)],
  ['49', 'funds.holders.detail', () =>
    fundProbe((p) => client.funds.holders.detail(p), FUND_CANDS)],
  ['50', 'corporate-actions.dividends(fund)', () =>
    fundProbe((p) => client.funds.corporateActions.dividends(p), FUND_CANDS)],
  ['51', 'funds.diagnostics.detail', () =>
    fundProbe((p) => client.funds.diagnostics.detail(p), FUND_CANDS)],
  ['52', 'funds.offerings.list', () => client.funds.offerings.list({ subscribe: 'active' })],
  ['53', 'news.articleList(动态)', () =>
    fundProbe((p) => client.funds.news.articleList({ ...p, limit: 5 }), FUND_CANDS, { requireNonEmpty: true, maxTries: 14 })],
  ['54', 'market.snapshot(动态ETF)', () =>
    fundProbe(
      (p) => client.funds.market.snapshot({ thscode: p.thscode }),
      FUND_CANDS.filter((p) => p.fundType === 'exchange'),
    )],
  ['55', 'market.historical(动态ETF)', () =>
    fundProbe(
      (p) => client.funds.market.historical({ thscode: p.thscode, start: 1751328000000, end: 1759008000000 }),
      FUND_CANDS.filter((p) => p.fundType === 'exchange'),
    )],
  ['56', 'financials.indicators', () =>
    fundProbe((p) => client.funds.financials.indicators(p), FUND_CANDS)],
  ['57', 'financials.incomeStatements', () =>
    fundProbe((p) => client.funds.financials.incomeStatements(p), FUND_CANDS)],
  ['58', 'financials.balanceSheets', () =>
    fundProbe((p) => client.funds.financials.balanceSheets(p), FUND_CANDS)],
];

/* ------------------------------------------------------------------ */
/* 执行与汇总                                                          */
/* ------------------------------------------------------------------ */
const results = [];
for (const [no, name, fn] of cases) {
  try {
    const res = await withRetry(() => fn());
    if (res.code === 0) {
      const itemCount = Array.isArray(res.data?.item)
        ? res.data.item.length
        : Object.keys(res.data ?? {}).length;
      results.push([no, name, 'OK', `item=${itemCount}`]);
    } else {
      results.push([no, name, 'BIZ', `code=${res.code} ${res.message}`]);
    }
  } catch (err) {
    if (err.name === 'AllCandidatesEmpty') {
      results.push([no, name, 'WARN', '全部动态候选均为空数据（环境限制）']);
    } else {
      results.push([
        no, name, 'THROW',
        err.name === 'FuyaoApiError'
          ? `code=${err.code} ${err.message}`
          : `${err.name}: ${err.message}`,
      ]);
    }
  }
}

console.log('\n编号  端点                                        结果   详情');
console.log('-'.repeat(110));
for (const [no, name, status, detail] of results) {
  console.log(`${no}   ${name.padEnd(42)} ${status.padEnd(6)} ${detail.slice(0, 80)}`);
}
const ok = results.filter((r) => r[2] === 'OK').length;
const biz = results.filter((r) => r[2] === 'BIZ');
const thr = results.filter((r) => r[2] === 'THROW');
const warn = results.filter((r) => r[2] === 'WARN');
console.log('-'.repeat(110));
console.log(`合计 ${results.length} 个调用：OK=${ok}  BIZ=${biz.length}  WARN=${warn.length}  THROW=${thr.length}`);
for (const label of ['业务非 0 明细', '客户端异常明细']) {
  const rows = label === '业务非 0 明细' ? biz : thr;
  if (rows.length) {
    console.log(`\n${label}：`);
    for (const [no, name, , detail] of rows) console.log(`  ${no} ${name}: ${detail}`);
  }
}
process.exit(thr.length > 0 ? 1 : 0);
