import { describe, expect, it } from 'vitest';
import { FuyaoClient } from '../src';
import { createMockFetch, envelope } from './helpers';
import type { FetchLike } from '../src';

const BASE = 'https://fuyao.aicubes.cn';

describe('FuyaoClient 构造与核心 HTTP', () => {
  it('缺失 apiKey 时抛出 TypeError', () => {
    expect(() => new FuyaoClient(undefined as never)).toThrow(TypeError);
    expect(() => new FuyaoClient({ apiKey: '' })).toThrow(TypeError);
  });

  it('baseUrl 尾部斜杠被规范化，且携带 X-api-key 头', async () => {
    const { fetchMock, requests } = createMockFetch();
    const client = new FuyaoClient({
      apiKey: 'k-test',
      baseUrl: `${BASE}/`,
      fetch: fetchMock,
    });
    await client.aShare.calendar.tradingDays();
    expect(requests[0]?.url).toBe(`${BASE}/api/a-share/calendar/trading-days`);
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get('X-api-key')).toBe('k-test');
  });

  it('业务错误 code!=0 抛出 FuyaoApiError 并携带 request_id 与路径', async () => {
    const client = new FuyaoClient({
      apiKey: 'bad',
      baseUrl: BASE,
      fetch: async () =>
        new Response(
          JSON.stringify(envelope(null, 2001, 'invalid api key')),
          { status: 200 },
        ),
    });
    await expect(async () => client.aShare.calendar.tradingDays()).rejects.toMatchObject({
      name: 'FuyaoApiError',
      code: 2001,
      requestId: 'test-request-id',
    });
  });

  it('HTTP 非 200 抛出 FuyaoHttpError', async () => {
    const client = new FuyaoClient({
      apiKey: 'k',
      baseUrl: BASE,
      fetch: async () => new Response('gateway timeout', { status: 504 }),
    });
    await expect(async () => client.aShare.calendar.tradingDays()).rejects.toMatchObject({
      name: 'FuyaoHttpError',
      status: 504,
    });
  });

  it('超时抛出 FuyaoTimeoutError', async () => {
    const client = new FuyaoClient({
      apiKey: 'k',
      baseUrl: BASE,
      timeoutMs: 20,
      fetch: ((_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        })) as FetchLike,
    });
    await expect(async () => client.aShare.calendar.tradingDays()).rejects.toMatchObject({
      name: 'FuyaoTimeoutError',
    });
  });

  it('query 序列化跳过 undefined/null 且数组以逗号连接', async () => {
    const { fetchMock, requests } = createMockFetch();
    const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: fetchMock });
    await client.meta.search({ q: '平安', assetType: ['fund-etf', 'fund-lof'], limit: undefined });
    expect(requests[0]?.query.get('asset_type')).toBe('fund-etf,fund-lof');
    expect(requests[0]?.query.has('limit')).toBe(false);
  });
});

describe('全局限速 intervalMs', () => {
  it('两次请求发起间隔不小于 intervalMs', async () => {
    const starts: number[] = [];
    const client = new FuyaoClient({
      apiKey: 'k',
      baseUrl: BASE,
      intervalMs: 120,
      fetch: (async (input: string) => {
        starts.push(Date.now());
        return new Response(JSON.stringify(envelope({ timestamp: 1, item: [] })), { status: 200 });
      }) as unknown as typeof fetch,
    });
    // 并发发起三个请求，观察实际发起时刻
    await Promise.all([
      client.aShare.calendar.tradingDays(),
      client.aShare.calendar.tradingDays(),
      client.aShare.calendar.tradingDays(),
    ]);
    expect(starts.length).toBe(3);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(100); // 留 20ms 时钟容差
    }
  });

  it('intervalMs=0（默认）时不限速', async () => {
    const starts: number[] = [];
    const client = new FuyaoClient({
      apiKey: 'k',
      baseUrl: BASE,
      fetch: (async () => {
        starts.push(Date.now());
        return new Response(JSON.stringify(envelope({ timestamp: 1, item: [] })), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await Promise.all([
      client.aShare.calendar.tradingDays(),
      client.aShare.calendar.tradingDays(),
      client.aShare.calendar.tradingDays(),
    ]);
    expect(starts[2]! - starts[0]!).toBeLessThan(500);
  });

  it('超时计时从获得限速槽位后才开始', async () => {
    const client = new FuyaoClient({
      apiKey: 'k',
      baseUrl: BASE,
      intervalMs: 150,
      timeoutMs: 1000,
      fetch: (async (_input: string, init?: RequestInit) => {
        // 慢响应 300ms < timeoutMs(1000)，若超时计时含排队时间则会误判超时
        await new Promise((r) => setTimeout(r, 300));
        void init;
        return new Response(JSON.stringify(envelope({ timestamp: 1, item: [] })), { status: 200 });
      }) as FetchLike,
    });
    await expect(client.aShare.calendar.tradingDays()).resolves.toBeDefined();
  });
});
