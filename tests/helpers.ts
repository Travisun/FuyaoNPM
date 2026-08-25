import { vi } from 'vitest';
import type { ApiResponse } from '../src/types';

/** 已捕获的请求记录。 */
export interface CapturedRequest {
  url: string;
  path: string;
  query: URLSearchParams;
  init?: RequestInit;
}

/** 构造统一响应信封。 */
export function envelope<T>(
  data: T | null,
  code = 0,
  message = 'success',
): ApiResponse<T> {
  return { code, message, request_id: 'test-request-id', data };
}

/**
 * 构造可编程的 mock fetch：
 * - 记录每次请求（url/path/query/headers）。
 * - 按「路径前缀 → 信封工厂」的路由表返回 JSON 响应；未命中路由返回空 item 信封。
 */
export function createMockFetch(
  routes: Record<string, (query: URLSearchParams) => unknown> = {},
) {
  const requests: CapturedRequest[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const captured: CapturedRequest = {
      url: input,
      path: url.pathname,
      query: url.searchParams,
      init,
    };
    requests.push(captured);
    const handler = Object.entries(routes).find(([prefix]) =>
      captured.path.startsWith(prefix),
    )?.[1];
    const payload = envelope(handler ? handler(captured.query) : { timestamp: 1, item: [] });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { fetchMock, requests };
}
