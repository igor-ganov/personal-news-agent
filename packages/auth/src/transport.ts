import { err, ok, type Result } from "@pna/core";
import { authError, errorFromResponse, type AuthError } from "./errors.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly token?: string | null;
}

export interface Transport {
  readonly baseUrl: string;
  request<T>(path: string, options?: RequestOptions): Promise<Result<T, AuthError>>;
}

export interface TransportOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  /** How long a single request may take before it counts as a dead network. */
  readonly timeoutMs?: number;
}

export const REQUEST_TIMEOUT_MS = 30_000;

const TIMED_OUT = "Сервер не ответил вовремя";

const isTimeout = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");

const networkFailure = (error: unknown): AuthError =>
  authError(
    "network",
    isTimeout(error) ? TIMED_OUT : (error instanceof Error && error.message) || "Сервер недоступен",
  );

/**
 * The only place that speaks HTTP.
 *
 * It turns every outcome — a failure to connect, an error payload, a body that
 * is not JSON — into a `Result`, so nothing above it has to guard against
 * exceptions from the network.
 */
export const createTransport = (options: TransportOptions): Transport => {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return {
    baseUrl,
    async request<T>(path: string, request: RequestOptions = {}): Promise<Result<T, AuthError>> {
      const headers: Record<string, string> = {};
      if (request.body !== undefined) headers["Content-Type"] = "application/json";
      if (request.token) headers.Authorization = `Bearer ${request.token}`;

      let response: Response;
      try {
        response = await doFetch(`${baseUrl}${path}`, {
          method: request.method ?? "GET",
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
          // A request that hangs would otherwise leave whatever waits on it
          // spinning for as long as the process lives.
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return err(networkFailure(error));
      }

      const payload = (await response.json().catch(() => null)) as
        | (Record<string, unknown> & { code?: string; message?: string })
        | null;

      if (!response.ok)
        return err(
          errorFromResponse(
            response.status,
            payload?.code,
            payload?.message ?? "",
            payload ?? undefined,
          ),
        );

      return ok((payload ?? {}) as T);
    },
  };
};
