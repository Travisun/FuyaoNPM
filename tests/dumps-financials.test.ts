import { describe, expect, it } from 'vitest';
import { FuyaoClient } from '../src';
import { createMockFetch } from './helpers';

const BASE = 'https://fuyao.aicubes.cn';

function makeClient(routes: Record<string, (q: URLSearchParams) => unknown>) {
  const { fetchMock, requests } = createMockFetch(routes);
  const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: fetchMock });
  return { client, requests };
}

describe('dumps 资源域', () => {
  it('三种 dump 端点路径与文档一一对应', async () => {
    const { client, requests } = makeClient({});
    await client.dumps.dailyKDownloadUrl();
    await client.dumps.dailyK10dDownloadUrl();
    await client.dumps.adjustmentFactorsDownloadUrl();
    expect(requests.map((r) => r.path)).toEqual([
      '/api/dump/market-dumps/daily-k/download-url',
      '/api/dump/market-dumps/daily-k-10d/download-url',
      '/api/dump/market-dumps/adjustment-factors/download-url',
    ]);
  });

  it('downloadUrl 泛型透传 data', async () => {
    const { client } = makeClient({
      '/api/dump/market-dumps/daily-k': () => ({ url: 'https://s3/presigned' }),
    });
    const res = await client.dumps.dailyKDownloadUrl<{ url: string }>();
    expect(res.data?.url).toBe('https://s3/presigned');
  });
});

describe('除复权资源', () => {
  it('adjustmentFactors：路径与 from/to 参数对齐文档', async () => {
    const { client, requests } = makeClient({
      '/api/a-share/corporate-actions/adjustment-factors': () => ({
        thscode: '600519.SH',
        ticker: '600519',
        item: [{ ticker: '600519', ex_date_ms: 1766073600000, dividend_per_share: 23.957, per_share_bonus: 0 }],
      }),
    });
    const res = await client.aShare.corporateActions.adjustmentFactors({
      thscode: '600519.SH',
      from: '2021-01-01',
      to: '2026-01-01',
    });
    expect(requests[0]?.query.get('thscode')).toBe('600519.SH');
    expect(requests[0]?.query.get('from')).toBe('2021-01-01');
    expect(requests[0]?.query.get('to')).toBe('2026-01-01');
    expect(res.data?.item[0]?.dividend_per_share).toBe(23.957);
  });
});

describe('财务三表取数模式校验（对齐 code=1004 场景）', () => {
  it.each([
    ['incomeStatements'],
    ['balanceSheets'],
    ['cashFlowStatements'],
  ] as const)('%s：limit 与 start/end 同传抛 TypeError', async (method) => {
    const { client } = makeClient({});
    await expect(async () => 
      client.aShare.financials[method]({
        thscode: '600519.SH',
        limit: 4,
        start: 1,
        end: 2,
      } as never),
    ).rejects.toThrow(/conflict/);
  });

  it.each(['incomeStatements', 'balanceSheets', 'cashFlowStatements'] as const)(
    '%s：半开区间（仅 start）抛 TypeError',
    async (method) => {
      const { client } = makeClient({});
      await expect(async () => 
        client.aShare.financials[method]({ thscode: '600519.SH', start: 1 } as never),
      ).rejects.toThrow(/together/);
    },
  );

  it.each(['incomeStatements', 'balanceSheets', 'cashFlowStatements'] as const)(
    '%s：end < start 抛 TypeError',
    async (method) => {
      const { client } = makeClient({});
      await expect(async () => 
        client.aShare.financials[method]({ thscode: '600519.SH', start: 2, end: 1 }),
      ).rejects.toThrow(/>=/);
    },
  );

  it('incomeStatements：最近 N 期模式默认 period=annual', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.financials.incomeStatements({ thscode: '600519.SH', limit: 3 });
    expect(requests[0]?.path).toBe('/api/a-share/financials/income-statements');
    expect(requests[0]?.query.get('period')).toBe('annual');
    expect(requests[0]?.query.get('limit')).toBe('3');
    expect(requests[0]?.query.has('start')).toBe(false);
  });

  it('cashFlowStatements：区间模式透传 start/end 且不传 limit', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.financials.cashFlowStatements({
      thscode: '600519.SH',
      period: 'quarterly',
      start: 1672502400000,
      end: 1735574400000,
    });
    expect(requests[0]?.query.get('start')).toBe('1672502400000');
    expect(requests[0]?.query.get('end')).toBe('1735574400000');
    expect(requests[0]?.query.has('limit')).toBe(false);
  });

  it('indicators：report 格式校验与参数传递', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.financials.indicators({ thscode: '300033.SZ', report: '2025-1' });
    expect(requests[0]?.path).toBe('/api/a-share/financials/indicators');
    expect(requests[0]?.query.get('report')).toBe('2025-1');

    await expect(async () => 
      client.aShare.financials.indicators({ thscode: '300033.SZ', report: 'bad' }),
    ).rejects.toThrow(TypeError);
  });
});

describe('日历 / 估值 / 竞价', () => {
  it('tradingDays 无入参请求', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.calendar.tradingDays();
    expect(requests[0]?.path).toBe('/api/a-share/calendar/trading-days');
    expect(requests[0]?.url).not.toContain('?');
  });

  it('valuations.snapshot 必填 thscodes', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.valuations.snapshot({ thscodes: '600519.SH,000001.SZ' });
    expect(requests[0]?.path).toBe('/api/a-share/valuations/snapshot');
    await expect(async () => client.aShare.valuations.snapshot({} as never)).rejects.toThrow(TypeError);
  });

  it('auction.snapshot stage 默认不序列化，显式 final 正常传递', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.auction.snapshot({ thscodes: '600519.SH', stage: 'final' });
    expect(requests[0]?.path).toBe('/api/a-share/auction/snapshot');
    expect(requests[0]?.query.get('stage')).toBe('final');
  });

  it('auction.shortTermBenchmark 可选 date', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.auction.shortTermBenchmark();
    expect(requests[0]?.path).toBe('/api/a-share/auction/short-term-benchmark');
    await client.aShare.auction.shortTermBenchmark({ date: '2026-08-14' });
    expect(requests[1]?.query.get('date')).toBe('2026-08-14');
  });
});
