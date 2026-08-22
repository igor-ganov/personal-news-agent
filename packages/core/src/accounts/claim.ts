import { accountOwner, type Owner } from "../model/account.js";
import type { AccountId } from "../model/ids.js";
import { STATE_VERSION, type AppState } from "../model/state.js";

/**
 * How the data already on the device is reconciled with the data the account
 * already has.
 *
 * `merge` is the safe default: nothing the user made is thrown away. The other
 * two exist because sometimes one side is genuinely junk — a throwaway topic
 * created while trying the app out, or a device the user no longer wants to
 * pull data from — and silently keeping both would be the wrong answer.
 */
export const CLAIM_STRATEGIES = ["merge", "keep-local", "keep-account"] as const;
export type ClaimStrategy = (typeof CLAIM_STRATEGIES)[number];

export interface StateCounts {
  readonly topics: number;
  readonly sources: number;
  readonly digests: number;
  readonly programs: number;
  readonly lessons: number;
  readonly quizzes: number;
  readonly attempts: number;
}

export const stateCounts = (state: AppState): StateCounts => ({
  topics: Object.keys(state.topics).length,
  sources: Object.keys(state.sources).length,
  digests: Object.keys(state.digests).length,
  programs: Object.keys(state.programs).length,
  lessons: Object.keys(state.lessonContent).length,
  quizzes: Object.keys(state.quizzes).length,
  attempts: Object.keys(state.attempts).length,
});

export const isEmptyState = (state: AppState): boolean =>
  Object.values(stateCounts(state)).every((n) => n === 0);

export interface ClaimSummary {
  readonly local: StateCounts;
  readonly account: StateCounts;
  /** Both sides hold data, so the choice is the user's to make. */
  readonly needsChoice: boolean;
  /** What happens if nobody is asked. */
  readonly suggested: ClaimStrategy;
}

/**
 * Describes the decision without making it.
 *
 * The user is only asked when both sides actually hold something; the common
 * cases — a fresh account, or signing in on a fresh device — have one obvious
 * answer and no question is worth asking.
 */
export const summariseClaim = (local: AppState, account: AppState): ClaimSummary => ({
  local: stateCounts(local),
  account: stateCounts(account),
  needsChoice: !isEmptyState(local) && !isEmptyState(account),
  suggested: "merge",
});

const mergeRecords = <K extends string, V>(
  base: Readonly<Record<K, V>>,
  incoming: Readonly<Record<K, V>>,
): Record<K, V> => ({ ...base, ...incoming });

export interface ClaimInput {
  readonly local: AppState;
  readonly account: AppState;
  readonly accountId: AccountId;
  readonly strategy: ClaimStrategy;
}

/**
 * Produces the state the account should hold after signing in.
 *
 * Merging is a union keyed by id. That is sound because every id is a UUID
 * minted on the device that created the record: two sides can hold the same
 * record (the same account synced earlier) but never two different records
 * under one id. Where both sides do hold an id, the account's copy wins — it is
 * the one other devices have already seen.
 *
 * Settings are not merged field by field, because half of one configuration and
 * half of another is a configuration nobody chose. The account's settings win,
 * except when the account is empty — a fresh registration, where the only
 * settings that exist are the ones the user has been using on this device.
 */
export const claimState = (input: ClaimInput): AppState => {
  const owner: Owner = accountOwner(input.accountId);
  const { local, account } = input;

  if (input.strategy === "keep-account") {
    return { ...account, version: STATE_VERSION, owner };
  }

  if (input.strategy === "keep-local") {
    return { ...local, version: STATE_VERSION, owner };
  }

  return {
    version: STATE_VERSION,
    owner,
    topics: mergeRecords(local.topics, account.topics),
    sources: mergeRecords(local.sources, account.sources),
    digests: mergeRecords(local.digests, account.digests),
    programs: mergeRecords(local.programs, account.programs),
    lessonContent: mergeRecords(local.lessonContent, account.lessonContent),
    quizzes: mergeRecords(local.quizzes, account.quizzes),
    attempts: mergeRecords(local.attempts, account.attempts),
    settings: isEmptyState(account) ? local.settings : account.settings,
  };
};

/**
 * What the device keeps under its local key after the data has been claimed.
 *
 * The local document is emptied rather than deleted: leaving the old copy
 * behind would mean a later sign-out silently resurrects data that now lives in
 * the account, and the user would have no way to tell the two apart.
 */
export const clearedLocalState = (local: AppState): AppState => ({
  ...local,
  version: STATE_VERSION,
  owner: { kind: "local" },
  topics: {},
  sources: {},
  digests: {},
  programs: {},
  lessonContent: {},
  quizzes: {},
  attempts: {},
});
