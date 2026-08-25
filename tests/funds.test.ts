import { describe, expect, it } from 'vitest';
import { FuyaoClient } from '../src';
import { createMockFetch } from './helpers';

const BASE = 'https://fuyao.aicubes.cn';

function makeClient(routes: Record<string, (q: URLSearchParams) => unknown>) {
  const { fetchMock, requests } = createMockFetch(routes);
  const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: fetchMock });
  return { client, requests };
}

describe('基金资源域：fund_type/thscode 通用契约', () => {
  it('profile.detail 参数映射 fund_type/thscode', async () => {
    const { client, requests } = makeClient({});
    await client.funds.profile.detail({ fundType: 'otc', thscode: '025480.OF' });
    expect(requests[0]?.path).toBe('/api/fund/profile/detail');
    expect(requests[0]?.query.get('fund_type')).toBe('otc');
    expect(requests[0]?.query.get('thscode')).toBe('025480.OF');
  });

  it('缺失 fundType 抛 TypeError（行情接口除外）', async () => {
    const { client } = makeClient({});
    await expect(async () => client.funds.profile.detail({ thscode: '510300.SH' } as never)).rejects.toThrow(TypeError);
    // market.snapshot 不接收 fund_type，可仅传 thscode
    await expect(
      client.funds.market.snapshot({ thscode: '510300.SH' }),
    ).resolves.toBeDefined();
  });
});

describe('基金持仓与配置', () => {
  it('holdings / asset-allocation / industry-allocation 路径与参数', async () => {
    const { client, requests } = makeClient({});
    await client.funds.portfolio.holdings({ fundType: 'exchange', thscode: '510300.SH' });
    expect(requests[0]?.path).toBe('/api/fund/portfolio/holdings');

    await client.funds.portfolio.assetAllocation({ fundType: 'exchange', thscode: '510300.SH' });
    expect(requests[1]?.path).toBe('/api/fund/portfolio/asset-allocation');

    await client.funds.portfolio.industryAllocation({ fundType: 'reits', thscode: '180101.SZ' });
    expect(requests[2]?.query.get('fund_type')).toBe('reits');
  });

  it('stockHistory 必填 reportType/endDate 且 endDate 格式校验', async () => {
    const { client, requests } = makeClient({});
    await client.funds.portfolio.stockHistory({
      fundType: 'exchange',
      thscode: '510300.SH',
      reportType: 'quarter',
      endDate: '2026-06-30',
    });
    const q = requests[0]!.query;
    expect(q.get('report_type')).toBe('quarter');
    expect(q.get('end_date')).toBe('2026-06-30');

    await expect(async () =>
      client.funds.portfolio.bondHistory({
        fundType: 'exchange',
        thscode: '510300.SH',
        reportType: 'quarter',
        endDate: '20260630',
      }),
    ).rejects.toThrow(/yyyy-MM-dd/);
  });

  it('report-dates 可选 report_type', async () => {
    const { client, requests } = makeClient({});
    await client.funds.portfolio.bondReportDates({
      fundType: 'otc',
      thscode: '025480.OF',
      reportType: 'quarter',
    });
    expect(requests[0]?.path).toBe('/api/fund/portfolio/bond-report-dates');
    expect(requests[0]?.query.get('report_type')).toBe('quarter');
  });
});

describe('基金业绩', () => {
  it('nav range/nav_type 可选参数透传', async () => {
    const { client, requests } = makeClient({});
    await client.funds.performance.nav({
      fundType: 'exchange',
      thscode: '510300.SH',
      range: 'year',
      navType: 'unit',
    });
    const q = requests[0]!.query;
    expect(q.get('range')).toBe('year');
    expect(q.get('nav_type')).toBe('unit');
  });

  it('indicators-historical start/end 必填且 end>=start', async () => {
    const { client, requests } = makeClient({});
    await client.funds.performance.indicatorsHistorical({
      fundType: 'exchange',
      thscode: '510300.SH',
      start: 1735689600000,
      end: 1767225599000,
    });
    const q = requests[0]!.query;
    expect(q.get('start')).toBe('1735689600000');

    await expect(async () => 
      client.funds.performance.indicatorsHistorical({
        fundType: 'exchange',
        thscode: '510300.SH',
        start: 2,
        end: 1,
      }),
    ).rejects.toThrow(/>=/);
  });
});

describe('持有人 / 分红 / 经理 / 公司 / 募集 / 资讯 / 行情', () => {
  it('holders.detail merge_scope；holders.top limit<=10 校验', async () => {
    const { client, requests } = makeClient({});
    await client.funds.holders.detail({
      fundType: 'exchange',
      thscode: '161725.SZ',
      mergeScope: 'all',
    });
    expect(requests[0]?.query.get('merge_scope')).toBe('all');

    await client.funds.holders.top({ fundType: 'exchange', thscode: '510300.SH', limit: 10 });
    expect(requests[1]?.query.get('limit')).toBe('10');
    await expect(async () => 
      client.funds.holders.top({ fundType: 'exchange', thscode: '510300.SH', limit: 11 }),
    ).rejects.toThrow(TypeError);
  });

  it('dividends 路径与参数', async () => {
    const { client, requests } = makeClient({});
    await client.funds.corporateActions.dividends({ fundType: 'exchange', thscode: '510300.SH' });
    expect(requests[0]?.path).toBe('/api/fund/corporate-actions/dividends');
  });

  it('managers 四端点均以 manager_id 定位；performance 需 range', async () => {
    const { client, requests } = makeClient({});
    await client.funds.managers.investmentStyle({ managerId: 'm1' });
    await client.funds.managers.experience({ managerId: 'm1' });
    await client.funds.managers.detail({ managerId: 'm1' });
    expect(requests.map((r) => r.path)).toEqual([
      '/api/fund/managers/investment-style',
      '/api/fund/managers/experience',
      '/api/fund/managers/detail',
    ]);

    await expect(async () => 
        client.funds.managers.performance({ managerId: 'm1' } as never),
    ).rejects.toThrow(TypeError);
    await client.funds.managers.performance({ managerId: 'm1', range: 'year' });
    expect(requests[3]?.query.get('range')).toBe('year');
  });

  it('companies.detail 以 company_id 定位', async () => {
    const { client, requests } = makeClient({});
    await client.funds.companies.detail({ companyId: '80000222' });
    expect(requests[0]?.path).toBe('/api/fund/companies/detail');
    expect(requests[0]?.query.get('company_id')).toBe('80000222');
  });

  it('offerings.list subscribe 必填', async () => {
    const { client, requests } = makeClient({});
    await client.funds.offerings.list({ subscribe: 'upcoming' });
    expect(requests[0]?.query.get('subscribe')).toBe('upcoming');
    await expect(async () => client.funds.offerings.list({} as never)).rejects.toThrow(TypeError);
  });

  it('news 游标分页：offset 原样回传、has_more 终止迭代器', async () => {
    let page = 0;
    const pages = [
      {
        timestamp: 1,
        limit: 2,
        offset: 'cursor-page-2',
        has_more: true,
        item: [{ id: 'a1' }, { id: 'a2' }],
      },
      {
        timestamp: 1,
        limit: 2,
        offset: null,
        has_more: false,
        item: [{ id: 'a3' }],
      },
    ];
    const { vi } = await import('vitest');
    const seenOffsets: (string | null)[] = [];
    const pagingFetch = vi.fn(async (input: string) => {
      const q = new URL(input).searchParams;
      seenOffsets.push(q.get('offset'));
      return new Response(JSON.stringify({ code: 0, message: 'success', request_id: 'r', data: pages[page++] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: pagingFetch });
    const ids: string[] = [];
    for await (const article of client.funds.news.iterateArticles({ fundType: 'exchange', thscode: '510300.SH' })) {
      ids.push(article.id);
    }
    expect(ids).toEqual(['a1', 'a2', 'a3']);
    expect(seenOffsets[1]).toBe('cursor-page-2'); // 第二页原样回传游标
  });

  it('market.historical 默认 interval=1d 且响应结构含 adjust:null', async () => {
    const { client, requests } = makeClient({
      '/api/fund/market/historical': () => ({
        timestamp: 1784131200000,
        thscode: '510300.SH',
        interval: '1d',
        adjust: null,
        item: [],
      }),
    });
    const res = await client.funds.market.historical({
      thscode: '510300.SH',
      start: 1626451200000,
      end: 1784217600000,
    });
    expect(requests[0]?.query.get('interval')).toBe('1d');
    expect(res.data?.adjust).toBeNull();
  });
});

describe('基金财务报表（fund-financials）', () => {
  const financialsRoutes: Record<string, (q: URLSearchParams) => unknown> = {
    '/api/fund/financials/indicators': (q) => ({
      timestamp: 1,
      item: [
        {
          start_date_ms: 1672444800000,
          end_date_ms: 1675123200000,
          publish_date_ms: 1677782400000,
          distribution_profit: 1.23,
          current_profit: 4.56,
          current_income: 7.89,
          distribution_share_profit: 0.01,
          average_nav_profit_margin: 2.34,
          average_share_current_profit: 0.05,
          share_nav: 1.02,
          sum_share_nav: 3.04,
          asset_nav: 5.06e9,
          sum_nav_rate: 8.88,
          nav_rate: 2.22,
        },
      ],
    }),
    '/api/fund/financials/income-statements': () => ({
      timestamp: 1,
      item: [
        {
          start_date_ms: 1672444800000,
          end_date_ms: 1675123200000,
          publish_date_ms: 1677782400000,
          total_income: 111.0,
          total_fee: 22.0,
          total_profit: 33.0,
          net_profit: 30.0,
        },
      ],
    }),
    '/api/fund/financials/balance-sheets': () => ({
      timestamp: 1,
      item: [
        {
          start_date_ms: 1672444800000,
          end_date_ms: 1675123200000,
          publish_date_ms: 1677782400000,
          total_assets: 100.0,
          total_liability: 20.0,
          owner_total_equity: 80.0,
          liability_and_owner_equity: 100.0,
        },
      ],
    }),
  };

  it('三个端点路径与 fund_type/thscode 参数映射一致', async () => {
    const { client, requests } = makeClient(financialsRoutes);
    await client.funds.financials.indicators({ fundType: 'otc', thscode: '000037.OF' });
    await client.funds.financials.incomeStatements({ fundType: 'otc', thscode: '000037.OF' });
    await client.funds.financials.balanceSheets({ fundType: 'otc', thscode: '000037.OF' });

    const paths = requests.map((r) => r.path);
    expect(paths).toEqual([
      '/api/fund/financials/indicators',
      '/api/fund/financials/income-statements',
      '/api/fund/financials/balance-sheets',
    ]);
    for (const r of requests) {
      expect(r.query.get('fund_type')).toBe('otc');
      expect(r.query.get('thscode')).toBe('000037.OF');
    }
  });

  it('缺失 fundType 抛 TypeError', async () => {
    const { client } = makeClient(financialsRoutes);
    await expect(
      async () => client.funds.financials.indicators({ thscode: '000037.OF' } as never),
    ).rejects.toThrow(TypeError);
  });

  it('响应数据容器与字段类型契约（数值可空）', async () => {
    const { client } = makeClient(financialsRoutes);
    const ind = await client.funds.financials.indicators({ fundType: 'otc', thscode: '000037.OF' });
    expect(ind.data?.item[0]?.nav_rate).toBe(2.22);
    expect(ind.data?.item[0]?.share_nav).toBe(1.02);

    const inc = await client.funds.financials.incomeStatements({ fundType: 'otc', thscode: '000037.OF' });
    expect(inc.data?.item[0]?.net_profit).toBe(30.0);

    const bal = await client.funds.financials.balanceSheets({ fundType: 'otc', thscode: '000037.OF' });
    expect(bal.data?.item[0]?.liability_and_owner_equity).toBe(100.0);
  });
});
