import { ApiResponse } from './types';

/**
 * fuyao API SDK 错误体系。
 *
 * - {@link FuyaoApiError}：服务端信封 `code !== 0` 的业务错误（HTTP 仍为 200）。
 * - {@link FuyaoHttpError}：HTTP 层异常（非 200 状态码）。
 * - {@link FuyaoTimeoutError}：请求超时。
 */

/** 业务错误：服务端返回 code !== 0。 */
export class FuyaoApiError extends Error {
  override readonly name: string = 'FuyaoApiError';
  /** 业务错误码，含义见官方文档错误码表。 */
  readonly code: number;
  /** 服务端 message。 */
  override readonly message: string;
  /** 请求追踪 ID。 */
  readonly requestId: string;
  /** 发生错误的请求路径。 */
  readonly path: string;

  constructor(code: number, message: string, requestId: string, path: string) {
    super(`[${path}] fuyao API error ${code}: ${message} (request_id=${requestId})`);
    this.code = code;
    this.message = message;
    this.requestId = requestId;
    this.path = path;
  }
}

/** HTTP 层错误：状态码非 2xx 或网络失败。 */
export class FuyaoHttpError extends Error {
  override readonly name: string = 'FuyaoHttpError';
  /** HTTP 状态码；网络层失败（无响应）时为 undefined。 */
  readonly status?: number;
  readonly path: string;
  readonly requestId?: string;

  constructor(message: string, path: string, status?: number, requestId?: string) {
    super(message);
    this.status = status;
    this.path = path;
    this.requestId = requestId;
  }
}

/** 请求超时错误。 */
export class FuyaoTimeoutError extends FuyaoHttpError {
  override readonly name: string = 'FuyaoTimeoutError';

  constructor(path: string, timeoutMs: number) {
    super(`Request to ${path} timed out after ${timeoutMs}ms`, path);
  }
}

/**
 * 解析信封并在业务失败时抛出 {@link FuyaoApiError}。
 *
 * @param envelope - 已 JSON 解析的响应信封。
 * @param path - 请求路径（用于错误上下文）。
 * @returns 成功时的完整信封。
 * @internal
 */
export function assertEnvelopeOk<T>(
  envelope: ApiResponse<T>,
  path: string,
): ApiResponse<T> {
  if (typeof envelope.code !== 'number') {
    throw new FuyaoHttpError(
      `Malformed response envelope (missing numeric "code") from ${path}`,
      path,
      200,
    );
  }
  if (envelope.code !== 0) {
    throw new FuyaoApiError(
      envelope.code,
      envelope.message ?? '',
      envelope.request_id ?? '',
      path,
    );
  }
  return envelope;
}
