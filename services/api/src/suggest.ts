import type { ProviderError, ProviderResult, SuggestInput } from "@pna/agent";
import { err, isSuggestionKind, SUGGESTION_BATCH, type Suggestion, type TopicContext } from "@pna/core";
import type { RunnerDeps } from "./jobs/runner.js";

const MAX_EXCLUDED = 200;
const MAX_TITLE = 300;

const NO_CREDENTIALS: ProviderError = {
  kind: "auth",
  message: "На сервере нет ключа API — задайте его в настройках приложения",
};

const titles = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, MAX_TITLE))
        .filter((item) => item.length > 0)
        .slice(0, MAX_EXCLUDED)
    : [];

const batchSize = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(SUGGESTION_BATCH, Math.max(1, Math.floor(value)))
    : SUGGESTION_BATCH;

const isContext = (value: unknown): value is TopicContext => {
  const topic = (value as { topic?: { title?: unknown } } | null)?.topic;
  return typeof value === "object" && value !== null && typeof topic?.title === "string";
};

/**
 * Reads a request for ideas. The topic context is the app's own rendering of
 * its state and is trusted the way a job's input is: a malformed one costs the
 * account that sent it a poor answer and nothing else.
 */
export const readSuggestRequest = (raw: unknown): SuggestInput | undefined => {
  const fields = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  if (!isSuggestionKind(fields.kind) || !isContext(fields.context)) return undefined;
  return {
    kind: fields.kind,
    context: fields.context,
    exclude: titles(fields.exclude),
    count: batchSize(fields.count),
  };
};

/**
 * Ideas for a card, answered in the request itself.
 *
 * Unlike a job this does not wait for the cron: it is one short call with no
 * web search, a few seconds of network wait and almost no CPU, and the user is
 * looking at the screen until it comes back.
 */
export const suggestFor = async (
  deps: RunnerDeps,
  accountId: string,
  input: SuggestInput,
): Promise<ProviderResult<Suggestion[]>> => {
  const credentials = await deps.credentials(accountId);
  if (!credentials) return err(NO_CREDENTIALS);
  return deps.provider(credentials).suggest(input);
};
