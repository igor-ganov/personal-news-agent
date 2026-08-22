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
}

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
        });
      } catch (error) {
        return err(authError("network", (error as Error)?.message || "Сервер недоступен"));
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
