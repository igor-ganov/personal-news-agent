import {
  createAnthropicProvider,
  isAgentJobKind,
  isRetryable,
  runAgentJob,
  type AgentJobRequest,
  type ProviderError,
} from "@pna/agent";
import type { Env } from "../env.js";
import {
  claimJob,
  completeJob,
  failJob,
  pendingJobs,
  providerCredentials,
  type JobRow,
} from "./db.js";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parseRequest = (row: JobRow): AgentJobRequest | null => {
  if (!isAgentJobKind(row.kind)) return null;
  try {
    const input: unknown = JSON.parse(row.input);
    if (typeof input !== "object" || input === null) return null;
    // The one place JSON meets the typed union. The pairing of kind and input
    // was checked by the app that built the row and cannot be re-proved here
    // without a second copy of every prompt schema; a wrong pairing surfaces as
    // a failed job for the account that submitted it, and nothing else.
    return { kind: row.kind, input } as AgentJobRequest;
  } catch {
    return null;
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
 * Runs one job to completion.
 *
 * Claiming comes first and is atomic, so a job picked up by two invocations —
 * the request that created it and the sweep that found it looking stale — is
 * still generated once. Everything after that ends in exactly one write:
 * a result, a retry, or a failure the app can show.
 */
export const runJob = async (env: Env, row: JobRow): Promise<void> => {
  if (!(await claimJob(env, row.id))) return;

  const request = parseRequest(row);
  if (!request) {
    await failJob(env, row.id, BAD_REQUEST, false);
    return;
  }

  const credentials = await providerCredentials(env, row.account_id);
  if (!credentials) {
    await failJob(env, row.id, NO_CREDENTIALS, false);
    return;
  }

  try {
    const provider = createAnthropicProvider({
      apiKey: credentials.apiKey,
      ...(credentials.model ? { model: credentials.model } : {}),
    });

    const result = await runAgentJob(provider, request);
    if (result.ok) await completeJob(env, row.id, result.value);
    else await failJob(env, row.id, result.error, isRetryable(result.error));
  } catch (error) {
    // Anything the provider did not turn into a Result — a runtime fault here,
    // not a refusal — is worth one more attempt before the user hears about it.
    await failJob(env, row.id, { kind: "unknown", message: messageOf(error) }, true);
  }
};

/**
 * Picks up whatever nobody is running.
 *
 * This is where generation actually happens. It cannot happen in the request
 * that created the job: `ctx.waitUntil` is cut off thirty seconds after the
 * response, and a lecture takes minutes — the call died mid-flight every time
 * and the row sat claimed until it went stale. A cron invocation gets fifteen
 * minutes of wall clock, and waiting on the network costs no CPU, so this is
 * the one place long work belongs.
 *
 * Jobs run side by side: they are network waits, and serialising them would
 * spend the fifteen minutes on the queue rather than on the work.
 */
export const runPending = async (env: Env, limit = 4): Promise<void> => {
  const rows = await pendingJobs(env, limit);
  await Promise.all(rows.map((row) => runJob(env, row)));
};
