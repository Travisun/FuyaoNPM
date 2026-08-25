# fuyao-api

同花顺金融数据 API（https://fuyao.aicubes.cn ）的 TypeScript SDK，覆盖官方文档全部 **54 个 REST 端点**（MCP 工具不在范围内）。

- 零运行时依赖（仅使用 Node 18+ 内置 `fetch` / `AbortController`）
- ESM + CJS 双格式产物，含完整 `.d.ts` 类型
- 统一错误体系：`FuyaoApiError`（业务码）/ `FuyaoHttpError`（HTTP 层）/ `FuyaoTimeoutError`
- 客户端前置校验与服务端约束对齐（互斥参数、枚举白名单、日期格式、token 上限等）
- 全量 JSDoc/TSDoc 注释；接口审计见 [`docs/API_AUDIT.md`](docs/API_AUDIT.md)

## 安装

```bash
npm install fuyao-api
```

要求 Node >= 18。

## 快速开始

```ts
import { FuyaoClient } from 'fuyao-api';

const client = new FuyaoClient({
  apiKey: process.env.FUYAO_API_KEY!, // 在 https://fuyao.aicubes.cn/admin 签发
  intervalMs: 400,      // 全局限速（两次请求最小间隔），批量调用强烈建议开启；
                        // 过快请求可能触发 code=4001 或间歇性空数据/5003。默认 0 不限速。
  // baseUrl?: string      // 默认 https://fuyao.aicubes.cn
  // timeoutMs?: number    // 默认 30000（计时从获得限速槽位后开始）
  // fetch?: FetchLike     // 自定义传输层（测试/代理）
});

// A 股行情快照
const snap = await client.aShare.prices.snapshot({ thscodes: '600519.SH' });
if (snap.code === 0) console.log(snap.data?.item[0]?.last_price);

// 标的检索
const hit = await client.meta.search({ q: '贵州茅台' });
```

### 错误处理

所有业务响应（含错误）均为 HTTP 200，SDK 在信封 `code !== 0` 时抛出 `FuyaoApiError`：

```ts
import { FuyaoApiError, ErrorCode } from 'fuyao-api';

try {
  await client.aShare.prices.snapshot({ thscodes: '600519.SH' });
} catch (e) {
  if (e instanceof FuyaoApiError) {
    console.error(e.code, e.message, e.requestId, e.path);
  }
}
```

常用错误码：`1001` 缺参、`1002` 格式错误、`1003` 越界、`1004` 参数冲突、`2001` 未认证、`2003` 权限不足、`3001` 标的不存在、`3002` 数据未就绪、`3004` 类型不支持、`4001` 限频、`500x` 服务端故障。完整表见 `ErrorCode` 枚举与审计文档。

## 资源域总览（方法 → 端点）

| SDK 入口 | 方法 | 端点 |
|---|---|---|
| `meta.search` | 标的检索 | GET `/api/meta/tickers/search` |
| `meta.listTickers` | 标的列表 | GET `/api/meta/tickers/list` |
| `meta.iterateAllTickers` | 自动翻页取尽代码表 | （封装 listTickers） |
| `dumps.dailyKDownloadUrl` | 10 年日 K Parquet | GET `/api/dump/market-dumps/daily-k/download-url` |
| `dumps.dailyK10dDownloadUrl` | 近 10 交易日日 K | GET `/api/dump/market-dumps/daily-k-10d/download-url` |
| `dumps.adjustmentFactorsDownloadUrl` | 复权因子全量 | GET `/api/dump/market-dumps/adjustment-factors/download-url` |
| `aShare.prices.snapshot` | 行情快照 | GET `/api/a-share/prices/snapshot` |
| `aShare.prices.historical` | 历史 K 线 | GET `/api/a-share/prices/historical` |
| `aShare.corporateActions.adjustmentFactors` | 复权因子事件流 | GET `/api/a-share/corporate-actions/adjustment-factors` |
| `aShare.financials.incomeStatements` | 利润表 | GET `/api/a-share/financials/income-statements` |
| `aShare.financials.balanceSheets` | 资产负债表 | GET `/api/a-share/financials/balance-sheets` |
| `aShare.financials.cashFlowStatements` | 现金流量表 | GET `/api/a-share/financials/cash-flow-statements` |
| `aShare.financials.indicators` | 五类财务指标 | GET `/api/a-share/financials/indicators` |
| `aShare.calendar.tradingDays` | 交易日历 | GET `/api/a-share/calendar/trading-days` |
| `aShare.valuations.snapshot` | 估值快照 | GET `/api/a-share/valuations/snapshot` |
| `aShare.auction.snapshot` | 集合竞价快照 | GET `/api/a-share/auction/snapshot` |
| `aShare.auction.shortTermBenchmark` | 短线风向标 | GET `/api/a-share/auction/short-term-benchmark` |
| `index.catalogThsIndexList` | 同花顺指数列表 | GET `/api/a-share-index/catalog/ths-index-list` |
| `index.constituentsThsStockList` | 指数成分股 | GET `/api/a-share-index/constituents/ths-stock-list` |
| `index.pricesSnapshot` | 指数快照 | GET `/api/a-share-index/prices/snapshot` |
| `index.pricesHistorical` | 指数历史 K 线 | GET `/api/a-share-index/prices/historical` |
| `specialData.limitUpPool` | 涨停池 | GET `/api/a-share/special-data/limit-up-pool` |
| `specialData.limitDownPool` | 跌停池 | GET `/api/a-share/special-data/limit-down-pool` |
| `specialData.limitBreakPool` | 炸板池 | GET `/api/a-share/special-data/limit-break-pool` |
| `specialData.limitUpLadder` | 连板天梯 | GET `/api/a-share/special-data/limit-up-ladder` |
| `specialData.skyrocketList` | 飙升榜 | GET `/api/a-share/special-data/skyrocket-list` |
| `specialData.hotStockList` | 热股榜单 | GET `/api/a-share/special-data/hot-stock-list` |
| `specialData.hotStockListHistory` | 历史热股排行 | GET `/api/a-share/special-data/hot-stock-list-history` |
| `specialData.hotStockRankTrend` | 个股排名走势 | GET `/api/a-share/special-data/hot-stock-rank-trend` |
| `specialData.anomalyAnalysisList` | 异动原因列表（无 MCP） | GET `/api/a-share/special-data/anomaly-analysis-list` |
| `specialData.anomalyAnalysisStock` | 按股票查异动 | GET `/api/a-share/special-data/anomaly-analysis-stock` |
| `specialData.dragonTigerList` | 龙虎榜 | GET `/api/a-share/special-data/dragon-tiger-list` |
| `funds.profile.detail` | 基金资料 | GET `/api/fund/profile/detail` |
| `funds.portfolio.holdings` | 重仓持仓 | GET `/api/fund/portfolio/holdings` |
| `funds.portfolio.stockHistory` / `bondHistory` | 历史股票/债券持仓 | GET `/api/fund/portfolio/{stock,bond}-history` |
| `funds.portfolio.stockReportDates` / `bondReportDates` | 报告日期 | GET `/api/fund/portfolio/{stock,bond}-report-dates` |
| `funds.portfolio.assetAllocation` | 资产配置 | GET `/api/fund/portfolio/asset-allocation` |
| `funds.portfolio.industryAllocation` | 行业配置 | GET `/api/fund/portfolio/industry-allocation` |
| `funds.performance.nav` | 净值 | GET `/api/fund/performance/nav` |
| `funds.performance.returns` | 区间收益 | GET `/api/fund/performance/returns` |
| `funds.performance.indicatorsHistorical` | 历史业绩指标 | GET `/api/fund/performance/indicators-historical` |
| `funds.performance.drawdowns` | 最大回撤 | GET `/api/fund/performance/drawdowns` |
| `funds.holders.detail` / `top` | 持有人结构 / 前十大 | GET `/api/fund/holders/{detail,top}` |
| `funds.corporateActions.dividends` | 分红记录 | GET `/api/fund/corporate-actions/dividends` |
| `funds.managers.investmentStyle` / `performance` / `experience` / `detail` | 经理数据 | GET `/api/fund/managers/*` |
| `funds.companies.detail` | 公司详情 | GET `/api/fund/companies/detail` |
| `funds.diagnostics.detail` | 基金诊断 | GET `/api/fund/diagnostics/detail` |
| `funds.offerings.list` | 新发募集 | GET `/api/fund/offerings/list` |
| `funds.news.articleList` / `iterateArticles` | 资讯（游标分页） | GET `/api/fund/news/article-list` |
| `funds.market.snapshot` / `historical` | ETF 行情 | GET `/api/fund/market/*` |

> 规划中未纳入：股票基础信息、股票所属同花顺指数查询、指数概况。

## 使用示例

```ts
// 财务三表（最近 N 期 / 时间区间两种模式互斥，客户端先行校验）
await client.aShare.financials.incomeStatements({ thscode: '600519.SH', period: 'annual', limit: 3 });
await client.aShare.financials.cashFlowStatements({
  thscode: '600519.SH', period: 'quarterly',
  start: 1672502400000, end: 1735574400000,
});

// 财务指标（report = yyyy-[1..4]）
const ind = await client.aShare.financials.indicators({ thscode: '300033.SZ', report: '2025-1' });

// 涨停池分页排序
await client.specialData.limitUpPool({ page: 1, size: 50, sortField: 'limit_up_time', sortDir: 'desc' });

// 基金全链路：profile → 经理/公司 ID → 详情
const profile = await client.funds.profile.detail({ fundType: 'exchange', thscode: '510300.SH' });

// 游标自动翻页拉取基金资讯
for await (const article of client.funds.news.iterateArticles({ fundType: 'exchange', thscode: '510300.SH' })) {
  // ...
}
```

## 参数约定速查

- **命名映射**：SDK 采用 camelCase（如 `fundType`、`sortField`、`startDate`），序列化时自动映射为服务端的 snake_case query。
- **多值**：数组参数以英文逗号连接（如 `assetType: ['fund-etf','fund-lof']`）。
- **前置校验**（抛 `TypeError`，不发请求）：必填参数、thscode 单值接口拒绝逗号、财务三表 limit 与 start/end 互斥且需成对、`report` 格式 `yyyy-[1..4]`、日期格式 `yyyy-MM-dd`、分页 `page>=1`/`size∈[1,200]`、异动股票 ≤50、持有人 top limit ≤10 等。
- **时间戳**：一律毫秒 Unix 时间戳，时区 Asia/Shanghai。
- **百分数**：`*_pct` 字段为百分数原值（`8.88` 表示 8.88%）。

## 开发

```bash
npm install        # 安装依赖
npm run typecheck  # tsc --noEmit
npm test           # vitest（61 个用例）
npm run build      # tsup 产出 dist/（ESM+CJS+DTS）
```

测试策略：以 mock fetch 捕获请求做契约断言（路径、query、认证头），并覆盖文档中的默认值、白名单、互斥约束与错误信封解析；不依赖真实网络与 API Key。
