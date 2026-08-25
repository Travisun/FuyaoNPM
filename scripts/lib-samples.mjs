/**
 * 动态样本加载与基金端点探测工具（供 smoke / verify-fields 共用）。
 *
 * 核心原则：所有基金测试样本一律来自 /api/meta/tickers/list 真实代码表，
 * 不使用硬编码示例代码。
 *
 * 后端分区特性：同一 thscode 可能在代码表同时挂 fund-etf 与 fund-otc 叶子，
 * 不同业务接口只认特定分区，因此对每只 ETF 同时生成 exchange / otc 两种
 * 基金类型候选做探测。
 */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 从代码表加载基金样本。
 *
 * 注意：listTickers 存在服务端间歇性返回空列表的情况（实测同一参数
 * 时而有数据时而为空），因此对每次拉取做非空重试。
 *
 * @returns {{ etfCodes: string[], otcCodes: string[], candidates: {fundType:string, thscode:string}[] }}
 *          candidates 已按「ETF(exchange) → ETF(otc 分区探测) → OTC」排序。
 */
export async function loadFundSamples(
  client,
  { etfCount = 6, otcCount = 10 } = {},
) {
  const fetchNonEmpty = async (assetType, limit) => {
    for (let i = 0; i < 5; i++) {
      try {
        const res = await client.meta.listTickers({ assetType, limit });
        if (res.code === 0 && (res.data?.item ?? []).length > 0) return res.data.item;
      } catch { /* 重试 */ }
      await sleep(800);
    }
    return [];
  };
  const etfCodes = (await fetchNonEmpty('fund-etf', etfCount)).map((t) => t.thscode);
  const otcCodes = (await fetchNonEmpty('fund-otc', otcCount)).map((t) => t.thscode);

  const candidates = [];
  for (const thscode of etfCodes) {
    candidates.push({ fundType: 'exchange', thscode });
    candidates.push({ fundType: 'otc', thscode }); // ETF 可能挂在 otc 分区
  }
  for (const thscode of otcCodes) {
    candidates.push({ fundType: 'otc', thscode });
  }
  return { etfCodes, otcCodes, candidates };
}

/**
 * 通用基金端点探测：对每个动态候选拼装调用，取第一个成功结果。
 *
 * @param makeCall - (candidate) => Promise<ApiResponse>；返回 code=0 即视为命中。
 * @param opts.requireNonEmpty - 要求 data.item 非空才算命中（用于契约校验）。
 * @param opts.maxTries - 最多尝试的候选数（控制耗时与限频）。
 * @returns 命中的响应信封。
 * @throws 全部失败时抛最后一个错误；全部为空数据时抛 name='AllCandidatesEmpty'
 *         且附带 envelope 供调用方降级校验容器字段。
 */
export async function fundProbe(makeCall, candidates, { requireNonEmpty = false, maxTries = 14 } = {}) {
  let lastBizError;
  let lastEmpty;
  let tries = 0;
  for (const cand of candidates) {
    if (tries >= maxTries) break;
    tries++;
    try {
      const res = await makeCall(cand);
      if (res.code === 0) {
        const empty = requireNonEmpty && (res.data?.item ?? []).length === 0;
        if (!empty) return res;
        lastEmpty = res; // 记录最成功的空响应
      } else {
        lastBizError = res;
      }
    } catch (err) {
      lastBizError = err;
    }
  }
  if (lastEmpty) {
    const e = new Error('ALL_EMPTY');
    e.name = 'AllCandidatesEmpty';
    e.envelope = lastEmpty;
    throw e;
  }
  throw lastBizError instanceof Error ? lastBizError : Object.assign(new Error(lastBizError?.message ?? 'probe failed'), { envelope: lastBizError });
}

/** 统一重试：处理服务端偶发抖动（间歇性 3001 等）。 */
export async function withRetry(fn, attempts = 3, delayMs = 1200) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw last;
}
