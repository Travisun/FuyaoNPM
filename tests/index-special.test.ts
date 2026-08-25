import { describe, expect, it } from 'vitest';
import { FuyaoClient } from '../src';
import { createMockFetch } from './helpers';

const BASE = 'https://fuyao.aicubes.cn';

function makeClient(routes: Record<string, (q: URLSearchParams) => unknown>) {
  const { fetchMock, requests } = createMockFetch(routes);
  const client = new FuyaoClient({ apiKey: 'k', baseUrl: BASE, fetch: fetchMock });
  return { client, requests };
}

describe('指数资源域', () => {
  it('catalogThsIndexList：tag 参数与默认不序列化', async () => {
    const { client, requests } = makeClient({});
    await client.index.catalogThsIndexList();
    expect(requests[0]?.path).toBe('/api/a-share-index/catalog/ths-index-list');
    expect(requests[0]?.query.has('tag')).toBe(false);
    await client.index.catalogThsIndexList({ tag: 'industry' });
    expect(requests[1]?.query.get('tag')).toBe('industry');
  });

  it('constituentsThsStockList：单指数参数传递，拒绝逗号', async () => {
    const { client, requests } = makeClient({});
    await client.index.constituentsThsStockList({ thscode: '886042.TI' });
    expect(requests[0]?.path).toBe('/api/a-share-index/constituents/ths-stock-list');
    await expect(async () => 
      client.index.constituentsThsStockList({ thscode: 'a.TI,b.TI' }),
    ).rejects.toThrow(TypeError);
  });

  it('pricesSnapshot 必填 thscodes 且 SDK 不透传无效的 limit/offset', async () => {
    const { client, requests } = makeClient({});
    await client.index.pricesSnapshot({ thscodes: '000001.SH,399001.SZ' });
    expect(requests[0]?.path).toBe('/api/a-share-index/prices/snapshot');
    expect(requests[0]?.query.get('thscodes')).toBe('000001.SH,399001.SZ');
    expect(requests[0]?.query.has('limit')).toBe(false);
  });

  it('pricesHistorical 无 adjust/offset 参数；end<start 客户端拒绝', async () => {
    const { client, requests } = makeClient({});
    await client.index.pricesHistorical({ thscode: '000001.SH', start: 1716105600000, end: 1747641600000 });
    const q = requests[0]!.query;
    expect(q.has('adjust')).toBe(false);
    expect(q.has('offset')).toBe(false);
    expect(q.get('interval')).toBe('1d');

    const c2 = makeClient({});
    await expect(async () => 
      c2.client.index.pricesHistorical({ thscode: '000001.SH', start: 2, end: 1 }),
    ).rejects.toThrow(TypeError);
  });
});

describe('特色数据资源域', () => {
  it('limitUpPool：分页排序参数对齐文档白名单默认值', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.limitUpPool({
      dateMs: 1748102400000,
      page: 2,
      size: 100,
      sortField: 'limit_up_time',
      sortDir: 'desc',
    });
    expect(requests[0]?.path).toBe('/api/a-share/special-data/limit-up-pool');
    const q = requests[0]!.query;
    expect(q.get('date_ms')).toBe('1748102400000');
    expect(q.get('page')).toBe('2');
    expect(q.get('size')).toBe('100');
    expect(q.get('sort_field')).toBe('limit_up_time');
    expect(q.get('sort_dir')).toBe('desc');
  });

  it('池类接口 page<1 / size 越界客户端拒绝（对齐 code=1003）', async () => {
    const { client } = makeClient({});
    await expect(async () => client.specialData.limitDownPool({ page: 0 })).rejects.toThrow(/page/);
    await expect(async () => client.specialData.limitBreakPool({ size: 201 })).rejects.toThrow(/size/);
    await expect(async () => client.specialData.limitUpPool({ size: 0 })).rejects.toThrow(/size/);
  });

  it('limitUpLadder 无入参', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.limitUpLadder();
    expect(requests[0]?.path).toBe('/api/a-share/special-data/limit-up-ladder');
    expect(requests[0]?.url).not.toContain('?');
  });

  it('skyrocketList / hotStockList 的 period 参数', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.skyrocketList({ period: 'hour' });
    await client.specialData.hotStockList({ period: 'day' });
    expect(requests[0]?.query.get('period')).toBe('hour');
    expect(requests[1]?.query.get('period')).toBe('day');
  });

  it('hotStockListHistory date 格式前置校验（对齐 code=1002）', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.hotStockListHistory({ date: '2026-06-21' });
    expect(requests[0]?.query.get('date')).toBe('2026-06-21');
    await expect(async () => 
      client.specialData.hotStockListHistory({ date: '20260621' }),
    ).rejects.toThrow(TypeError);
  });

  it('hotStockRankTrend 参数命名映射 start_date/end_date，start>end 拒绝', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.hotStockRankTrend({
      thscode: '300034.SZ',
      startDate: '2026-06-21',
      endDate: '2026-07-01',
    });
    expect(requests[0]?.query.get('start_date')).toBe('2026-06-21');
    expect(requests[0]?.query.get('end_date')).toBe('2026-07-01');

    await expect(async () => 
      client.specialData.hotStockRankTrend({
        thscode: '300034.SZ',
        startDate: '2026-07-01',
        endDate: '2026-06-21',
      }),
    ).rejects.toThrow(TypeError);
  });

  it('anomalyAnalysisList tag_codes 多值 OR', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.anomalyAnalysisList({ tagCodes: ['LIMIT_UP', 'SHARP_FALL'] });
    expect(requests[0]?.query.get('tag_codes')).toBe('LIMIT_UP,SHARP_FALL');
  });

  it('anomalyAnalysisStock 超过 50 token 客户端拒绝（对齐 code=1003）', async () => {
    const { client } = makeClient({});
    const codes = Array.from({ length: 51 }, (_, i) => `6005${String(i).padStart(2, '0')}.SH`);
    await expect(async () => 
      client.specialData.anomalyAnalysisStock({ thscodes: codes.join(',') }),
    ).rejects.toThrow(/50/);
  });

  it('dragonTigerList board_type/date 参数与日期格式校验', async () => {
    const { client, requests } = makeClient({});
    await client.specialData.dragonTigerList({ boardType: 'org', date: '2026-07-01' });
    expect(requests[0]?.query.get('board_type')).toBe('org');
    expect(requests[0]?.query.get('date')).toBe('2026-07-01');
    await expect(async () => 
      client.specialData.dragonTigerList({ date: '07/01/2026' }),
    ).rejects.toThrow(TypeError);
  });
});
