import {
  createAnthropicProvider,
  isAgentJobKind,
  isRetryable,
  runAgentJob,
  type AgentJobRequest,
  type ContentProvider,
  type ProviderError,
} from "@pna/agent";
import type { Env } from "../env.js";
import {
  claimJob,
  completeJob,
  failJob,
  HEARTBEAT_EVERY_MS,
  pendingJobs,
  providerCredentials,
  touchJob,
  type JobRow,
  type JobStore,
  type ProviderCredentials,
} from "./db.js";

/**
 * How many jobs one cron invocation takes on.
 *
 * Waiting on the network is free, but assembling a streamed answer is not, and
 * every job in the invocation draws on the same CPU budget. Two keeps a tick
 * well inside it; the next minute's tick takes the rest of the queue.
 */
export const JOBS_PER_TICK = 2;

/** What the runner needs from the world beyond the job table. */
export interface RunnerDeps {
  readonly credentials: (accountId: string) => Promise<ProviderCredentials | undefined>;
  readonly provider: (credentials: ProviderCredentials) => ContentProvider;
  /** Observes each successful claim — a seam for tests and logging. */
  readonly onClaim?: (id: string) => void;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parseRequest = (row: JobRow): AgentJobRequest | undefined => {
  if (!isAgentJobKind(row.kind)) return undefined;
  try {
    const input: unknown = JSON.parse(row.input);
    if (typeof input !== "object" || input === null) return undefined;
    // The one place JSON meets the typed union. The pairing of kind and input
    // was checked by the app that built the row and cannot be re-proved here
    // without a second copy of every prompt schema; a wrong pairing surfaces as
    // a failed job for the account that submitted it, and nothing else.
    return { kind: row.kind, input } as AgentJobRequest;
  } catch {
    return undefined;
  }
};

const NO_CREDENTIALS: ProviderError = {
  kind: "auth",
  message: "На сервере нет ключа API — задайте его в настройках приложения",
};

const BAD_REQUEST: ProviderError = {
  kind: "invalid-output",
  message: "Задание повреждено и не может быть выполнено",
};

/**
 * Keeps a job's heartbeat going for as long as `work` is pending.
 *
 * The beat is what tells the sweep this invocation is alive. When the isolate
 * dies, so does the timer, the stamp goes stale, and the job is retried or
 * reported within minutes rather than after a fixed quarter of an hour.
 */
const withHeartbeat = async <T>(store: JobStore, id: string, work: () => Promise<T>): Promise<T> => {
  const timer = setInterval(() => void touchJob(store, id).catch(() => undefined), HEARTBEAT_EVERY_MS);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
};

const generate = async (
  store: JobStore,
  row: JobRow,
  request: AgentJobRequest,
  provider: ContentProvider,
): Promise<void> => {
  try {
    const result = await withHeartbeat(store, row.id, () => runAgentJob(provider, request));
    if (result.ok) await completeJob(store, row.id, result.value);
    else await failJob(store, row.id, result.error, isRetryable(result.error));
  } catch (error) {
    // Anything the provider did not turn into a Result — a runtime fault here,
    // not a refusal — is worth one more attempt before the user hears about it.
    await failJob(store, row.id, { kind: "unknown", message: messageOf(error) }, true);
  }
};

/**
 * The job runner over a store and its dependencies.
 *
 * Claiming comes first and is atomic, so a job picked up by two invocations is
 * still generated once. Everything after that ends in exactly one write:
 * a result, a retry, or a failure the app can show.
 */
export const createRunner = (store: JobStore, deps: RunnerDeps) => {
  const runJob = async (row: JobRow): Promise<void> => {
    if (!(await claimJob(store, row.id))) return;
    deps.onClaim?.(row.id);

    const request = parseRequest(row);
    if (!request) return failJob(store, row.id, BAD_REQUEST, false);

    const credentials = await deps.credentials(row.account_id);
    if (!credentials) return failJob(store, row.id, NO_CREDENTIALS, false);

    return generate(store, row, request, deps.provider(credentials));
  };

  /**
   * Picks up whatever nobody is running. Jobs in one tick run side by side:
   * they are mostly network waits, and serialising them would spend the
   * invocation on the queue rather than on the work.
   */
  const runPending = async (limit = JOBS_PER_TICK): Promise<void> => {
    const rows = await pendingJobs(store, limit);
    await Promise.all(rows.map(runJob));
  };

  return { runJob, runPending } as const;
};

const anthropicProvider = (credentials: ProviderCredentials): ContentProvider =>
  createAnthropicProvider({
    apiKey: credentials.apiKey,
    ...(credentials.model ? { model: credentials.model } : {}),
  });

/** The production wiring: the account's stored key, the Anthropic provider. */
export const runnerDeps = (env: Env): RunnerDeps => ({
  credentials: async (accountId) => (await providerCredentials(env, accountId)) ?? undefined,
  provider: anthropicProvider,
});

/**
 * Runs the queue from the cron. This is the one place generation happens: the
 * request that creates a job cannot run it, because `ctx.waitUntil` is cut off
 * thirty seconds after the response.
 */
export const runPending = (env: Env, limit = JOBS_PER_TICK): Promise<void> =>
  createRunner(env, runnerDeps(env)).runPending(limit);
