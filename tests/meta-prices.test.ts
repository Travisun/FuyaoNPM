import { describe, expect, it } from 'vitest';
import { FuyaoClient } from '../src';
import { createMockFetch } from './helpers';

const BASE = 'https://fuyao.aicubes.cn';

function makeClient(routes: Record<string, (q: URLSearchParams) => unknown>) {
  const { fetchMock, requests } = createMockFetch(routes);
  const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: fetchMock });
  return { client, requests };
}

describe('meta 资源域', () => {
  it('search：路径与参数对齐文档（q/exchange/asset_type/limit）', async () => {
    const { client, requests } = makeClient({
      '/api/meta/tickers/search': () => ({
        timestamp: 1716105600000,
        item: [
          {
            thscode: '601318.SH',
            ticker: '601318',
            name: '中国平安',
            exchange: 'SH',
            asset_type: 'a-share',
            currency: 'CNY',
          },
        ],
      }),
    });
    const res = await client.meta.search({
      q: '平安',
      exchange: 'SH',
      assetType: 'a-share',
      limit: 20,
    });
    expect(requests[0]?.path).toBe('/api/meta/tickers/search');
    expect(requests[0]?.query.get('q')).toBe('平安');
    expect(requests[0]?.query.get('exchange')).toBe('SH');
    expect(requests[0]?.query.get('asset_type')).toBe('a-share');
    expect(requests[0]?.query.get('limit')).toBe('20');
    expect(res.data?.item[0]?.thscode).toBe('601318.SH');
  });

  it('search：缺失 q 抛出 TypeError', async () => {
    const { client } = makeClient({});
    // @ts-expect-error 缺失必填参数
    await expect(async () => client.meta.search({})).rejects.toThrow(TypeError);
  });

  it('listTickers：分页参数与多值 asset_type', async () => {
    const { client, requests } = makeClient({});
    await client.meta.listTickers({ assetType: ['fund-etf', 'fund-lof'], limit: 500, offset: 100 });
    expect(requests[0]?.path).toBe('/api/meta/tickers/list');
    expect(requests[0]?.query.get('asset_type')).toBe('fund-etf,fund-lof');
    expect(requests[0]?.query.get('limit')).toBe('500');
    expect(requests[0]?.query.get('offset')).toBe('100');
  });

  it('iterateAllTickers：自动翻页直到取尽', async () => {
    let call = 0;
    const { fetchMock, requests } = createMockFetch();
    const { vi } = await import('vitest');
    const pagingFetch = vi.fn(async (input: string) => {
      void input;
      call += 1;
      const page = call === 1
        ? { timestamp: 1, item: Array.from({ length: 2 }, (_, i) => ({ thscode: `60000${i}.SH`, ticker: `60000${i}`, name: `n${i}`, exchange: 'SH', asset_type: 'a-share' as const, currency: 'CNY' })) }
        : { timestamp: 1, item: [] };
      return new Response(JSON.stringify({ code: 0, message: 'success', request_id: 'r', data: page }), { status: 200 });
    }) as unknown as typeof fetch;
    void fetchMock;
    void requests;

    const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: pagingFetch });
    const all: string[] = [];
    for await (const t of client.meta.iterateAllTickers({ assetType: 'a-share', pageSize: 2 })) {
      all.push(t.thscode);
    }
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(call).toBe(2); // 第二页为空即终止
  });
});

describe('A 股行情资源', () => {
  it('snapshot：显式 thscodes 按逗号传递', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.prices.snapshot({ thscodes: ['600519.SH', '000001.SZ'] });
    expect(requests[0]?.path).toBe('/api/a-share/prices/snapshot');
    expect(requests[0]?.query.get('thscodes')).toBe('600519.SH,000001.SZ');
    expect(requests[0]?.query.has('limit')).toBe(false);
  });

  it('snapshot：全市场分页模式', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.prices.snapshot({ limit: 50, offset: 10 });
    expect(requests[0]?.query.get('limit')).toBe('50');
    expect(requests[0]?.query.get('offset')).toBe('10');
  });

  it('historical：默认 interval=1d 与 adjust 不传时不序列化', async () => {
    const { client, requests } = makeClient({});
    await client.aShare.prices.historical({
      thscode: '600519.SH',
      start: 1716105600000,
      end: 1747641600000,
    });
    expect(requests[0]?.path).toBe('/api/a-share/prices/historical');
    expect(requests[0]?.query.get('interval')).toBe('1d');
    expect(requests[0]?.query.get('adjust')).toBeNull();
    expect(requests[0]?.query.get('thscode')).toBe('600519.SH');
  });

  it('historical：thscode 含逗号被客户端拒绝', async () => {
    const { client } = makeClient({});
    await expect(async () => 
      client.aShare.prices.historical({ thscode: '600519.SH,000001.SZ', start: 1, end: 2 }),
    ).rejects.toThrow(TypeError);
  });

  it('historical：缺失必填参数抛出 TypeError', async () => {
    const { client } = makeClient({});
    // @ts-expect-error 故意缺参
    await expect(async () => client.aShare.prices.historical({ thscode: '600519.SH' })).rejects.toThrow(/start/);
  });
});
