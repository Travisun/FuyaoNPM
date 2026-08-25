# 同花顺金融数据 API — REST 接口审计文档

> 审计来源：https://fuyao.aicubes.cn/docs/api-reference/overview/ 及其全部子页面（经 `/llms-full.txt` 聚合核对）。
> 审计日期：2026-08-25。仅覆盖 REST API，MCP 工具不在范围内。

---

## 0. 通用约定（全部接口共享）

| 项目 | 约定 |
|---|---|
| Base URL | `https://fuyao.aicubes.cn` |
| 认证 | 请求头 `X-api-key: <your-api-key>`；缺失/无效 → `code=2001`；无权访问 capability → `code=2003` |
| HTTP 状态 | 业务响应（含错误）恒为 HTTP 200，业务结果经信封 `code` 表达 |
| 响应信封 | `{ code: integer, message: string, request_id: string, data: object \| null }`；`data.timestamp` 为毫秒时间戳，列表数据在 `data.item` |
| 时间戳 | 毫秒级 Unix 时间戳，时区 `Asia/Shanghai` |
| 标的代码 | 使用完整 `thscode`（如 `600519.SH`），不接受纯 `ticker`；基金场外为 `.OF` 后缀但 `exchange` 字段为 `null` |

### 错误码表

| code | 含义 | 典型场景 |
|---|---|---|
| `0` | 成功 | - |
| `1001` | 缺少必填参数 | `start`/`end`/`q`/`thscode` 漏传 |
| `1002` | 参数格式错误 | thscode 含逗号、日期格式错误、枚举非法格式 |
| `1003` | 参数取值越界 | 枚举非法、`limit<=0`、窗口超上限、token 数超限 |
| `1004` | 参数冲突 | financials 同时传 start/end 与 limit；半开区间 |
| `2001` | 未认证 | X-api-key 缺失或无效 |
| `2003` | 权限不足 | API Key 无权调用该 capability |
| `3001` | 标的不存在 | 找不到目标标的 |
| `3002` | 数据未就绪 | 标的存在但暂无可用业务数据 |
| `3004` | 标的类型不支持该能力 | 如对非 ETF 基金请求行情快照 |
| `4001` | 频率超限 | 超过约定 QPS |
| `5001` | 服务内部错误 | 服务端未知错误 |
| `5002` | 上游服务超时 | 数据源响应超时 |
| `5003` | 数据源不可用 | 上游不可用或返回非 0 状态 |

---

## 1. 基础数据（Meta）

### 1.1 标的检索
- **端点**：`GET /api/meta/tickers/search`
- **认证**：`X-api-key`
- **参数（query）**：

| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `q` | string | 是 | - | 关键词：完整 thscode / ticker / 中英文名称（子串匹配） |
| `exchange` | string | 否 | - | `SH` / `SZ` / `BJ`；场外基金不参与该过滤 |
| `asset_type` | string | 否 | - | 单值或逗号分隔多值：`a-share` / `a-share-index` / `fund-otc` / `fund-etf` / `fund-lof`；非法值 → `1003` |
| `limit` | integer | 否 | `10` | 最大 `50` |

- **响应 `data`**：`{ timestamp: long, item: TickerItem[] }`
- **TickerItem**：`thscode`(string)、`ticker`(string)、`name`(string)、`exchange`(string|null，场外基金为 null)、`asset_type`(string 叶子类型)、`currency`(string)

### 1.2 标的列表获取
- **端点**：`GET /api/meta/tickers/list`
- **认证**：`X-api-key`
- **参数（query）**：

| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `asset_type` | string | 否 | 全部类型 | 同上枚举，单值或逗号分隔多值 |
| `limit` | integer | 否 | `1000` | 最大 `10000` |
| `offset` | integer | 否 | `0` | 分页偏移；循环递增直至 `item.length < limit` 取尽 |

- **响应 `data`**：`{ timestamp, item: TickerItem[] }`（同上）

---

## 2. A 股行情（prices）

### 2.1 行情快照
- **端点**：`GET /api/a-share/prices/snapshot`
- **认证**：`X-api-key`
- **参数（query）**：

| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 否 | - | 逗号分隔 thscode 列表；给定时忽略分页参数 |
| `limit` | integer | 否 | `100` | 仅在省略 thscodes 时生效 |
| `offset` | integer | 否 | `0` | 同上 |

- **响应 `data`**：`{ timestamp: long|null, total: int, item: PriceSnapshotItem[] }`
- **PriceSnapshotItem**：`thscode`、`ticker`、`last_price`、`price_change`、`price_change_ratio_pct`(百分数数值)、`open_price`、`high_price`、`low_price`、`prev_price`、`volume`(股)、`turnover`(元)。不返回中文名 `name`。

### 2.2 历史 K 线
- **端点**：`GET /api/a-share/prices/historical`
- **认证**：`X-api-key`
- **参数（query）**：

| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | - | 单只标的，不接受逗号 |
| `interval` | string | 是 | `1d` | 当前仅支持 `1d` |
| `start` | long | 是 | - | 毫秒戳；缺失 → `1001` |
| `end` | long | 是 | - | 毫秒戳；跨度超 10 年 → `1003` |
| `adjust` | string | 否 | `forward` | `none` / `forward` / `backward` |
| `offset` | integer | 否 | `0` | 分页偏移 |

- **响应 `data`**：`{ timestamp, thscode?, interval?, adjust?, item: PriceBarItem[] }`
  > 实测补充（2026-08-25 真实环境核验）：除文档列出的 `timestamp`/`item` 外，服务端实际还返回 `thscode`、`interval`(`1d`) 与 `adjust` 回显字段。
- **PriceBarItem**：`date_ms`、`open_price`、`high_price`、`low_price`、`close_price`、`volume`、`turnover`

---

## 3. 全市场数据导出（market-dumps）

下载接口返回短时有效（约 5 分钟）S3 预签名链接。浏览器入口用登录 Cookie（`/dump/**`），API 客户端用 API Key（`/api/dump/**` + `X-api-key`）。三种 dump：

| dump | dump_id | 下载端点（API Key 版） |
|---|---|---|
| 10 年全量日 K | `a_share_daily_k_1d_none_10y` | `GET /api/dump/market-dumps/daily-k/download-url` |
| 最近 10 交易日日 K | `a_share_daily_k_1d_none_10d` | `GET /api/dump/market-dumps/daily-k-10d/download-url` |
| 复权因子全量 | `a_share_adjustment_factors_event_none_all` | `GET /api/dump/market-dumps/adjustment-factors/download-url` |

- **认证**：`X-api-key`
- **参数**：无入参
- **响应**：统一信封，`data` 内含预签名下载链接字段（链接短时有效，不可持久化）
- Parquet schema 见官方文档（日 K 主键 `(thscode,date_ms)`；复权因子主键 `(thscode,ex_date_ms)`）

---

## 4. 除复权（corporate-actions）

### 4.1 复权因子事件流
- **端点**：`GET /api/a-share/corporate-actions/adjustment-factors`
- **认证**：`X-api-key`
- **参数（query）**：

| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | - | 单只标的，不接受逗号 |
| `from` | string | 否 | - | `YYYY-MM-DD` |
| `to` | string | 否 | - | `YYYY-MM-DD` |

- **响应 `data`**：`{ thscode, ticker, item: AdjustmentFactorItem[] }`（按 `ex_date_ms` 降序）
- **AdjustmentFactorItem**：`ticker`、`ex_date_ms`、`dividend_per_share`(税前现金分红，非现金事件为 0)、`per_share_bonus`(送股比例，如 0.1 表示 10 送 1)。**不返回** event_type/record_date/adjust_factor。

---

## 5. 财务报表（financials）

三个端点入参契约完全一致：
- `GET /api/a-share/financials/income-statements`（利润表）
- `GET /api/a-share/financials/balance-sheets`（资产负债表）
- `GET /api/a-share/financials/cash-flow-statements`（现金流量表）

- **认证**：`X-api-key`
- **取数模式（互斥二选一）**：最近 N 期（不传 start/end）；时间区间（同时传 start+end 毫秒戳闭区间）。同时传 limit 与 start/end、或仅传 start 或仅传 end → `1004`。
- **参数（query）**：

| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | - | 单只，含后缀，如 `600519.SH`/`000858.SZ`/`430047.BJ` |
| `period` | enum | 是 | `annual` | `annual`(仅 Q4) / `quarterly`(每季末) |
| `limit` | integer | 否 | `4` | `[1,20]`，与 start/end 互斥 |
| `start` | long | 否 | - | 与 end 同传；窗口 ≤10 年 |
| `end` | long | 否 | - | ≥ start |

- **共有响应字段**（每条 item）：`thscode`、`ticker`、`period`、`fiscal_year`、`fiscal_period`(`FY/Q1..Q4`)、`report_date_ms`、`period_end_ms`、`currency`；`data.timestamp` 取最大 period_end_ms。
- **利润表专属**：`operating_income`、`operating_costs`、`operating_expenses`、`sales_fee`、`manage_fee`、`research_and_development_expenses`、`operating_profit`、`interest_expenses`、`profit_total`、`income_tax_expense`、`net_profit`、`parent_holder_net_profit`、`basic_eps`(元/股)
- **资产负债表专属**：`assets_total`、`total_current_assets`、`non_current_nets_total`、`cash`、`accounts_receivable`、`total_debt`、`holder_equity_total`
- **现金流量表专属**：`act_cash_flow_net`、`invest_cash_flow_net`、`financing_cash_flow_net`、`pay_fixed_assets_etc_cash`、`pay_dividends_profits_interest_cash`、`cash_equivalents_net_addition`
- 未披露字段为 `null`，不补零。

---

## 6. 财务指标（financial-indicators）

- **端点**：`GET /api/a-share/financials/indicators`
- **认证**：`X-api-key`
- **参数（query）**：`thscode`(string，必需)；`report`(string，必需，格式 `yyyy-1|yyyy-2|yyyy-3|yyyy-4`)
- **响应 `data`**：`{ thscode, report, abilities: [{ ability, indicators: [{ index_id, value: string|null }] }] }`
- **abilities 固定顺序**：`growth` → `profitability` → `solvency` → `operation` → `cash-flow`
- **index_id 枚举**：
  - growth：`total_assets_growth_ratio`、`net_profit_yoy_growth_ratio`、`operating_income_yoy_growth_ratio`、`operating_profit_yoy_growth_ratio`
  - profitability：`sale_gross_margin`、`sale_net_interest_ratio`、`total_assets_net_ratio`、`index_deduct_weighted_avg_roe`、`index_weighted_avg_roe`
  - solvency：`current_ratio`、`quick_ratio`、`assets_debt_ratio`、`cash_ratio`、`earned_interest_multiple`
  - operation：`long_term_debt_equity_ratio`、`total_assets_turnover_ratio`、`inventory_turnover_ratio`、`current_assets_turnover_ratio`、`receive_account_turnover_ratio`
  - cash-flow：`cash_operating_index`、`operating_cash_flow_net_divide_income`、`net_profit_cash_content`、`operating_cash_net_yoy_growth_ratio`、`cash_meet_invest_ratio`
- `value` 为原始数值字符串（保留精度），缺失为 `null`；report 格式非法 → `1002`。

---

## 7. 交易日历（calendar）

- **端点**：`GET /api/a-share/calendar/trading-days`
- **认证**：`X-api-key`
- **参数**：无入参（固定窗口 `[今日-1 年, 今日]`）
- **响应 `data`**：`{ timestamp, item: [{ date_ms: long, date: "yyyyMMdd" }] }`（升序）

---

## 8. 估值数据（valuations）

- **端点**：`GET /api/a-share/valuations/snapshot`
- **认证**：`X-api-key`
- **参数（query）**：`thscodes`(string，必需)：逗号分隔；大小写不敏感，服务端 trim/大写/去重保序；默认最多 100 个原始 token（超出 → `1003`）；空 token/格式非法 → `1002`（须六位数字 + `.SH/.SZ/.BJ`）
- **响应 `data`**：`{ timestamp: long|null, total, item: ValuationItem[] }`
- **ValuationItem**：`thscode`、`ticker`、`name`(string|null)、`pe_ttm`、`pe_mrq`、`pb_mrq`、`ps_ttm`、`pcf_ttm`（五个指标均 number|null，不补零）
- 无匹配时 `code=0, total=0, item=[]`

---

## 9. 集合竞价（auction）

### 9.1 集合竞价快照
- **端点**：`GET /api/a-share/auction/snapshot`
- **认证**：`X-api-key`
- **参数（query）**：`thscodes`(string，必需，逗号分隔，按请求顺序去重)；`stage`(enum，否，`live`/`final`，默认 `final`)
- **响应 `data`**：`{ timestamp, auction_phase, data_status, total, item[] }`
- **item[]**：`thscode/ticker/name`、`auction_price/auction_pct`、`auction_volume/auction_amount/auction_unmatched`、`auction_turnover_pct/auction_yesterday_ratio_pct/auction_volume_ratio`、`pre_close_price/open_price/last_price`、`float_market_cap`

### 9.2 短线风向标竞价基准
- **端点**：`GET /api/a-share/auction/short-term-benchmark`
- **认证**：`X-api-key`
- **参数（query）**：`date`(string，否，`yyyy-MM-dd`；缺省上海当日；显式非交易日不回退)
- **响应 `data`**：`{ timestamp, date, date_ms, item: [{ thscode, ticker, name, auction_pct, tags: string[] }] }`

---

## 10. 指数数据（a-share-index）

通用：thscode 入参被 `trim().toUpperCase()` 标准化，不接受逗号，单次一个指数（快照除外）。

### 10.1 同花顺指数列表
- **端点**：`GET /api/a-share-index/catalog/ths-index-list`
- **参数**：`tag`(string，否，`cn_concept`(默认)/`region`/`tszs`/`industry`，大小写不敏感)，无分页
- **响应 `data.item[]`**：`{ thscode, name }`（无 ticker）

### 10.2 同花顺指数成分股
- **端点**：`GET /api/a-share-index/constituents/ths-stock-list`
- **参数**：`thscode`(string，必需；支持同花顺指数与标准指数如 `000300.SH`)
- **响应 `data.item[]`**：`{ thscode, ticker, name }`

### 10.3 指数行情快照
- **端点**：`GET /api/a-share-index/prices/snapshot`
- **参数**：`thscodes`(string，**必需**，逗号分隔)；`limit`/`offset` 仅签名对齐，无效
- **响应**：同 A 股快照结构（`SnapshotData`/`PriceSnapshotItem`）

### 10.4 指数历史 K 线
- **端点**：`GET /api/a-share-index/prices/historical`
- **参数**：`thscode`*、`interval`*(仅 `1d`)、`start`*、`end`*（毫秒戳，窗口 ≤10 年）。**无 adjust 与 offset 参数**
- **响应**：同 A 股历史 K 线结构，且 `data.adjust` 固定 `null`；实测还返回 `thscode`/`interval` 回显

---

## 11. 特色数据（special-data）

前缀统一为 `GET /api/a-share/special-data/*`。

### 11.1 涨停股票池 `limit-up-pool`
| 参数 | 类型 | 必需 | 默认 | 说明 |
|---|---|---|---|---|
| `date_ms` | long | 否 | 当前自然日 | 交易日毫秒戳（上海零点） |
| `page` | integer | 否 | `1` | 必须 ≥1 |
| `size` | integer | 否 | `50` | `1..200` |
| `sort_field` | enum | 否 | `last_price` | `last_price`/`continue_day_cnt`/`seal_money`/`limit_up_time` |
| `sort_dir` | enum | 否 | `desc` | `asc`/`desc` |

响应：`{ timestamp, pagination: { total,pages,size,page }, item[] }`。
item[]：`thscode/ticker/name/is_st/is_new/last_price/price_change_ratio_pct(已乘100)/limit_up_time(HH:MM)/limit_up_reason(string|null)/continue_day_text/continue_day_cnt/seal_money/max_seal_money`。
错误：sort_field 白名单外→`1002`；page<1 或 size∉1..200→`1003`。

### 11.2 跌停股票池 `limit-down-pool`
同分页参数；`sort_field` 白名单：`last_limit_time`(默认)/`first_limit_time`/`last_price`/`price_change_ratio_pct`/`turnover_ratio_pct`。
item[]：`thscode/ticker/name/last_price/price_change_ratio_pct/first_limit_time/last_limit_time(HH:mm)/turnover_ratio_pct`。

### 11.3 炸板股票池 `limit-break-pool`
同分页参数；`sort_field` 白名单：`price_change_ratio_pct`(默认)/`open_times`/`last_price`/`turnover_ratio_pct`/`turnover`。
item[]：`thscode/ticker/name/last_price/price_change_ratio_pct/open_times/turnover_ratio_pct/turnover`。

### 11.4 连板天梯 `limit-up-ladder`
- **参数**：无入参（固定近 30 个交易日，每板位最多 4 只）
- 响应：`{ timestamp, window: { length, date_list[], board_caps }, item: [{ date: "yyyyMMdd", boards: { two_board|three_board|four_board|five_board|six_board|seven_over: LadderStock[] } }] }`
- LadderStock：`thscode/ticker/name/board_num/seal_nextday(boolean|null)/sign_level`

### 11.5 飙升榜 `skyrocket-list`
- **参数**：`period`(enum，否，`day`(默认)/`hour`)；非法→`1002`
- 响应：`{ timestamp, item[] }`，item[]：`thscode/ticker/name/rank/heat(string 原始串)/rank_change(int|null)/rank_trend(up|down|flat|unknown)`，最多 30 条

### 11.6 A股热股榜单 `hot-stock-list`
- 同飙升榜结构与参数（day=24 小时级别）

### 11.7 历史热股排行 `hot-stock-list-history`
- **参数**：`date`(string，**必需**，`yyyy-MM-dd`，一年内)
- 响应：`{ date, date_ms, item: [{ thscode,ticker,name,rank }] }`（最多 30 条）
- 错误：格式→`1002`；超一年→`1003`

### 11.8 个股排名走势 `hot-stock-rank-trend`
- **参数**：`thscode`*、`start_date`*、`end_date`*（`yyyy-MM-dd`；end≥start；一年内）
- 响应：`{ timestamp, item: [{ thscode,ticker,date,date_ms,rank }] }`
- 错误：日期非法→`1002`；越界→`1003`；start>end→`1004`

### 11.9 个股异动原因列表 `anomaly-analysis-list`（无 MCP）
- **参数**：`tag_codes`(string，否，逗号分隔 OR)：`LIMIT_UP/LIMIT_DOWN/SHARP_RISE/SHARP_FALL/RAPID_RALLY/RAPID_DECLINE`；未知值/空 token→`1002`
- 响应：`{ timestamp, item: [{ stock_name,analysis_content,keyword_list:string[],thscode,tag_name }] }`
- 当日数据不可用→`3002`；有快照无匹配→`code=0, item=[]`

### 11.10 按股票查询个股异动原因 `anomaly-analysis-stock`
- **参数**：`thscodes`(string，**必需**，逗号分隔，去重前最多 50 token)
- 缺失→`1001`；空 token/格式非法→`1002`；>50→`1003`。响应结构同 11.9

### 11.11 龙虎榜榜单 `dragon-tiger-list`
- **参数**：`board_type`(enum，否，`all`(默认)/`org`/`hot_money`)；`date`(string，否，`yyyy-MM-dd`，一年内；显式非交易日→`1002`；晚于今天或超一年→`1003`)
- 响应：`{ timestamp, board_type, trade_date, count, stock_count, stock_items[], hot_money_items[] }`
- stock_items[]：`thscode/ticker/name/concept_list[{name}]/change/net_value/net_rate/hot_rank/buy_value/sell_value/limit_reason/range_days/org_net_value/org_net_rate/org_buy_num/org_sell_num/amount/hot_money_net_value/hot_money_net_rate/hot_money_item_net_value/hot_money_item_net_rate`
- hot_money_items[]：`{ name, buying, rows[](同 stock_items[]) }`

---

## 12. 基金（fund）

通用约定：多数接口 `(fund_type, thscode)` 定位；经理用 `manager_id`；公司用 `company_id`；行情仅接收 `thscode` 且当前仅支持 ETF。`fund_type` ∈ `otc` / `exchange` / `reits`；`thscode` 必须保留后缀并与 fund_type 匹配（不一致 → `1004`）。

| # | 端点 | 必填参数 | 可选参数 |
|---|---|---|---|
| 12.1 | `GET /api/fund/profile/detail` | fund_type, thscode | - |
| 12.2 | `GET /api/fund/portfolio/holdings` | fund_type, thscode | - |
| 12.3 | `GET /api/fund/portfolio/stock-history` | fund_type, thscode, report_type, end_date(`yyyy-MM-dd`) | - |
| 12.4 | `GET /api/fund/portfolio/bond-history` | 同上 | - |
| 12.5 | `GET /api/fund/portfolio/stock-report-dates` | fund_type, thscode | report_type |
| 12.6 | `GET /api/fund/portfolio/bond-report-dates` | 同上 | report_type |
| 12.7 | `GET /api/fund/portfolio/asset-allocation` | fund_type, thscode | - |
| 12.8 | `GET /api/fund/portfolio/industry-allocation` | fund_type, thscode | - |
| 12.9 | `GET /api/fund/performance/nav` | fund_type, thscode | range(`week/month/tmonth/hyear/year/twoyear/tyear/fyear`)，nav_type(`unit`/`adj`/`unit,adj` 默认) |
| 12.10 | `GET /api/fund/performance/returns` | fund_type, thscode | - |
| 12.11 | `GET /api/fund/performance/indicators-historical` | fund_type, thscode, start, end(毫秒戳) | - |
| 12.12 | `GET /api/fund/performance/drawdowns` | fund_type, thscode | - |
| 12.13 | `GET /api/fund/holders/detail` | fund_type, thscode | merge_scope(`all`(默认)/`merged`/`separate`) |
| 12.14 | `GET /api/fund/holders/top` | fund_type, thscode | limit(≤10) |
| 12.15 | `GET /api/fund/corporate-actions/dividends` | fund_type, thscode | - |
| 12.16 | `GET /api/fund/managers/investment-style` | manager_id | - |
| 12.17 | `GET /api/fund/managers/performance` | manager_id, range(`month/tmonth/year/nowyear/now`) | - |
| 12.18 | `GET /api/fund/managers/experience` | manager_id | - |
| 12.19 | `GET /api/fund/managers/detail` | manager_id | - |
| 12.20 | `GET /api/fund/companies/detail` | company_id | - |
| 12.21 | `GET /api/fund/diagnostics/detail` | fund_type, thscode | - |
| 12.22 | `GET /api/fund/offerings/list` | subscribe(`active`/`upcoming`) | - |
| 12.23 | `GET /api/fund/news/article-list` | fund_type, thscode | limit, offset(不透明游标，翻页原样回传) |
| 12.24 | `GET /api/fund/market/snapshot` | thscode（不接收 fund_type，仅 ETF） | - |
| 12.25 | `GET /api/fund/market/historical` | thscode, start, end(≤5 自然年) | interval(仅 `1d`) |

关键响应要点：
- **profile/detail item[]**：`thscode/ticker/fund_name/estab_date/company_id/mgmt_name/manager_name/fund_scale/unit_nav/manager_info[]/trade_rule[]/rate_info[]`
- **holdings**：item[] `thscode/ticker/stock_name/hold_ratio/asset_type(stock|bond|fund)/position_capital/position_count/security_market_value_rate_pct/period_increase_rate_pct/investment_rank/end_date_ms(/start_date_ms/publish_date_ms/modify_time_ms)`；data 另含汇总 `total_stock_ratio_pct/total_bond_ratio_pct/total_fund_ratio_pct/turnover_rate_pct/stock_ratio_pct/main_industry/concentration_ratio`
- **stock/bond-history item[]**：`thscode/ticker/name/asset_type/hold_ratio/market_value/period_increase_pct/rank/report_type/end_date_ms`
- **report-dates item[]**：`report_type/report_type_name/start_date_ms/end_date_ms`
- **asset-allocation item[]**：`report_date_ms/stock_ratio_pct/bond_ratio_pct/deposit_ratio_pct/other_ratio_pct`
- **industry-allocation item[]**：`report_period("2026Q2")/industry_name/ratio_pct`
- **nav item[]**：`nav_date/unit_nav?/adj_nav?`（未请求的 nav_type 不输出）
- **returns item[]**：`return_{week/month/tmonth/hyear/year/twoyear/tyear/fyear/nowyear/now}` + `peer_average_*` + `rank_*`/`rank_total_*`
- **indicators-historical item[]**：`date_ms/rsi_pct/donchian_channel/track_index_pe_ttm_five_year_percentile`（周期固定 DAY_1）
- **drawdowns item[]**：`thscode/ticker/{week,month,tmonth,hyear,year,twoyear,tyear,fyear,nowyear,now}`
- **holders/detail item[]**：`merge_scope/report_date_ms/ins_position/holder_amount/avg_holder_share/psnl_rate/mgmt_staff_hold_rate`（all 口径最多两条；无数据→`3002`）
- **holders/top**：data 另含 `limit`；item[] `holder_id/holder_code/holder_name/holder_type/rank/hold_share/hold_rate_pct/report_date_ms/publish_date_ms`
- **dividends**：data 元数据 `dividend_count/dividend_total`；item[] `per_ten_cash_before_tax/per_ten_cash_after_tax/progress/publish_date_ms/registration_date_ms/ex_dividend_date_ms/payment_date_ms/reinvestment_date_ms/profit_base_date_ms/in_dividend_date_ms`
- **managers/investment-style item[]**：`representative_fund_thscode/representative_fund_ticker/representative_fund_name/investment_idea/total_fund_scale/industry_preferences`
- **managers/performance item[]**：`date_ms/manager_return_pct/peer_return_pct/benchmark_return_pct`
- **managers/experience item[]**：`awards/heavy_assets/investment_history`（保留上游结构）
- **managers/detail item[]**：`manager_id/manager_name/sex/degree/company_id/company_name/resume/photo_url/annual_return_pct/maximum_return_pct/radar_comparison[]`
- **companies/detail item[]**：`company_id/company_name/company_type/established_date_ms/fund_count/scale`
- **diagnostics item[]**：`thscode/ticker/fund_type/peer_code/dimensions/peer_dimensions/probabilities/ranges/resilience/peer_resilience`
- **offerings item[]**：`thscode/ticker/subscription_start_ms/subscription_end_ms`
- **news**：data 分页元数据 `limit/offset(string|null 游标)/has_more(bool)`（无 total）；item[] `id/content_type/title/summary/source/url/image_url/author/publish_time_ms/top`
  > 实测补充（2026-08-25）：当结果为空时服务端省略 `offset` 键（而非返回 null），仅返回 `{timestamp, limit, has_more}`；且当前环境对全部抽样基金（75+ 只）均返回空资讯列表。
- **market/snapshot item[]**：`thscode/ticker/last_price/open_price/high_price/low_price/prev_price/price_change_ratio_pct/price_change/price_amplitude_ratio_pct/volume/turnover/turnover_ratio_pct`（非 ETF → `3004`）
- **market/historical data**：`timestamp/thscode/interval("1d")/adjust(null)`；item[] `date_ms/volume/turnover/open_price/high_price/low_price/close_price`

---

## 13. 规划中（暂不纳入 SDK）

以下页面为「敬请期待」，无可用端点：`stock-basics`、`ths-index-membership`、`index-overview`（指数基本信息/成分股/权重）、`a-share/prices` 的周月线（interval 当前仅 `1d`）。

## 14. 端点清单汇总（共 54 个）

| # | 方法 | 路径 | SDK 方法 |
|---|---|---|---|
| 1 | GET | /api/meta/tickers/search | meta.search |
| 2 | GET | /api/meta/tickers/list | meta.listTickers |
| 3 | GET | /api/a-share/prices/snapshot | aShare.prices.snapshot |
| 4 | GET | /api/a-share/prices/historical | aShare.prices.historical |
| 5 | GET | /api/dump/market-dumps/daily-k/download-url | dumps.dailyKDownloadUrl |
| 6 | GET | /api/dump/market-dumps/daily-k-10d/download-url | dumps.dailyK10dDownloadUrl |
| 7 | GET | /api/dump/market-dumps/adjustment-factors/download-url | dumps.adjustmentFactorsDownloadUrl |
| 8 | GET | /api/a-share/corporate-actions/adjustment-factors | aShare.corporateActions.adjustmentFactors |
| 9 | GET | /api/a-share/financials/income-statements | aShare.financials.incomeStatements |
| 10 | GET | /api/a-share/financials/balance-sheets | aShare.financials.balanceSheets |
| 11 | GET | /api/a-share/financials/cash-flow-statements | aShare.financials.cashFlowStatements |
| 12 | GET | /api/a-share/financials/indicators | aShare.financials.indicators |
| 13 | GET | /api/a-share/calendar/trading-days | aShare.calendar.tradingDays |
| 14 | GET | /api/a-share/valuations/snapshot | aShare.valuations.snapshot |
| 15 | GET | /api/a-share/auction/snapshot | aShare.auction.snapshot |
| 16 | GET | /api/a-share/auction/short-term-benchmark | aShare.auction.shortTermBenchmark |
| 17 | GET | /api/a-share-index/catalog/ths-index-list | index.catalogThsIndexList |
| 18 | GET | /api/a-share-index/constituents/ths-stock-list | index.constituentsThsStockList |
| 19 | GET | /api/a-share-index/prices/snapshot | index.pricesSnapshot |
| 20 | GET | /api/a-share-index/prices/historical | index.pricesHistorical |
| 21 | GET | /api/a-share/special-data/limit-up-pool | specialData.limitUpPool |
| 22 | GET | /api/a-share/special-data/limit-down-pool | specialData.limitDownPool |
| 23 | GET | /api/a-share/special-data/limit-break-pool | specialData.limitBreakPool |
| 24 | GET | /api/a-share/special-data/limit-up-ladder | specialData.limitUpLadder |
| 25 | GET | /api/a-share/special-data/skyrocket-list | specialData.skyrocketList |
| 26 | GET | /api/a-share/special-data/hot-stock-list | specialData.hotStockList |
| 27 | GET | /api/a-share/special-data/hot-stock-list-history | specialData.hotStockListHistory |
| 28 | GET | /api/a-share/special-data/hot-stock-rank-trend | specialData.hotStockRankTrend |
| 29 | GET | /api/a-share/special-data/anomaly-analysis-list | specialData.anomalyAnalysisList |
| 30 | GET | /api/a-share/special-data/anomaly-analysis-stock | specialData.anomalyAnalysisStock |
| 31 | GET | /api/a-share/special-data/dragon-tiger-list | specialData.dragonTigerList |
| 32–56 | GET | /api/fund/**（见第 12 节明细） | funds.* |
