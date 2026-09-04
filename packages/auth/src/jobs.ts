import { err, ok, type Result } from "@pna/core";
import { authError, type AuthError } from "./errors.js";
import type { Transport } from "./transport.js";

/**
 * Generation that runs on the server rather than on the device.
 *
 * The client here knows nothing about what a job contains: `input`, `meta` and
 * `result` pass through as opaque JSON. That keeps the domain out of the
 * transport and lets the application layer decide what any of it means.
 */
export type RemoteJobStatus = "queued" | "running" | "done" | "failed";

export interface RemoteJobError {
  readonly kind: string;
  readonly message: string;
}

export interface RemoteJob {
  readonly id: string;
  /** The key the app tracks this work under, e.g. `program:topic_1`. */
  readonly key: string;
  readonly kind: string;
  readonly status: RemoteJobStatus;
  readonly meta: unknown;
  readonly result: unknown;
  readonly error: RemoteJobError | null;
  readonly updatedAt: string;
}

export interface JobSubmission {
  readonly key: string;
  readonly kind: string;
  readonly input: unknown;
  readonly meta: unknown;
}

export interface ProviderKeyStatus {
  /** Whether the server can generate at all — own key or the deployment's. */
  readonly configured: boolean;
  /** Whether this account uploaded a key of its own. */
  readonly ownKey: boolean;
  readonly model: string;
}

const STATUSES: readonly RemoteJobStatus[] = ["queued", "running", "done", "failed"];

const asStatus = (value: unknown): RemoteJobStatus =>
  STATUSES.find((status) => status === value) ?? "queued";

const asError = (value: unknown): RemoteJobError | null => {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { kind?: unknown; message?: unknown };
  return {
    kind: typeof raw.kind === "string" ? raw.kind : "unknown",
    message: typeof raw.message === "string" ? raw.message : "Не получилось",
  };
};

const parseJob = (raw: unknown): RemoteJob | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const job = raw as Record<string, unknown>;
  if (typeof job.id !== "string" || typeof job.key !== "string" || typeof job.kind !== "string")
    return null;

  return {
    id: job.id,
    key: job.key,
    kind: job.kind,
    status: asStatus(job.status),
    meta: job.meta ?? {},
    result: job.result ?? null,
    error: asError(job.error),
    updatedAt: typeof job.updatedAt === "string" ? job.updatedAt : "",
  };
};

const parseStatus = (raw: {
  configured?: unknown;
  ownKey?: unknown;
  model?: unknown;
}): ProviderKeyStatus => ({
  configured: raw.configured === true,
  ownKey: raw.ownKey === true,
  model: typeof raw.model === "string" ? raw.model : "",
});

export interface JobsClient {
  list(token: string): Promise<Result<RemoteJob[], AuthError>>;
  submit(token: string, submission: JobSubmission): Promise<Result<RemoteJob, AuthError>>;
  /** Removes a job the app is done with — result applied, or failure dismissed. */
  dismiss(token: string, id: string): Promise<Result<true, AuthError>>;
  providerKey(token: string): Promise<Result<ProviderKeyStatus, AuthError>>;
  setProviderKey(
    token: string,
    apiKey: string,
    model: string,
  ): Promise<Result<ProviderKeyStatus, AuthError>>;
}

export const createJobsClient = (transport: Transport): JobsClient => ({
  async list(token) {
    const response = await transport.request<{ jobs?: unknown[] }>("/jobs", { token });
    if (!response.ok) return response;

    const jobs = (response.value.jobs ?? [])
      .map(parseJob)
      .filter((job): job is RemoteJob => job !== null);
    return ok(jobs);
  },

  async submit(token, submission) {
    const response = await transport.request<{ job?: unknown }>("/jobs", {
      method: "POST",
      token,
      body: submission,
    });
    if (!response.ok) return response;

    const job = parseJob(response.value.job);
    return job ? ok(job) : err(authError("server", "Сервер вернул непонятный ответ"));
  },

  async dismiss(token, id) {
    const response = await transport.request<Record<string, unknown>>(
      `/jobs/${encodeURIComponent(id)}`,
      { method: "DELETE", token },
    );
    return response.ok ? ok(true) : response;
  },

  async providerKey(token) {
    const response = await transport.request<Parameters<typeof parseStatus>[0]>("/provider-key", {
      token,
    });
    return response.ok ? ok(parseStatus(response.value)) : response;
  },

  async setProviderKey(token, apiKey, model) {
    const response = await transport.request<Parameters<typeof parseStatus>[0]>("/provider-key", {
      method: "PUT",
      token,
      body: { apiKey, model },
    });
    return response.ok ? ok(parseStatus(response.value)) : response;
  },
});
