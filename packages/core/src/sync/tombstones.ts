import type { AppState } from "../model/state.js";
import { instantOf, isAfter, latest, type Instant } from "../time/instant.js";

/**
 * What the state remembers about records it no longer holds.
 *
 * Merging two copies of the state is a union, and a union cannot tell "deleted
 * here" from "never seen here": without a trace of the deletion, every sync
 * brought a deleted topic back. A tombstone is that trace, keyed by collection
 * and id, carrying the moment of deletion so a record edited later still wins.
 */
export type Tombstones = Readonly<Record<string, Instant>>;

/** The collections of the state that hold records keyed by id. */
export const COLLECTIONS = [
  "topics",
  "sources",
  "digests",
  "programs",
  "lessonContent",
  "quizzes",
  "attempts",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

export const tombstoneKey = (collection: CollectionName, id: string): string =>
  `${collection}:${id}`;

const TIME_FIELDS = ["updatedAt", "generatedAt", "submittedAt", "addedAt", "createdAt"] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/**
 * When a record last changed, as far as its own fields say.
 *
 * Records keep their time under different names; the first one present is the
 * best available. A record with none reads as infinitely old, so a deletion of
 * it always wins — the safe direction for content that is never edited.
 */
export const recordTime = (record: unknown): Instant | undefined => {
  if (!isRecord(record)) return undefined;
  const field = TIME_FIELDS.find((name) => typeof record[name] === "string");
  const value = field ? record[field] : undefined;
  return typeof value === "string" ? instantOf(value) : undefined;
};

/** Whether a record outlives a deletion recorded at `deletedAt`. */
export const survives = (record: unknown, deletedAt: Instant | undefined): boolean => {
  if (deletedAt === undefined) return true;
  const changedAt = recordTime(record);
  return changedAt !== undefined && isAfter(changedAt, deletedAt);
};

const keysOf = (state: AppState, collection: CollectionName): ReadonlySet<string> =>
  new Set(Object.keys(state[collection]));

const removedKeys = (before: AppState, after: AppState): readonly string[] =>
  COLLECTIONS.flatMap((collection) => {
    const remaining = keysOf(after, collection);
    return [...keysOf(before, collection)]
      .filter((id) => !remaining.has(id))
      .map((id) => tombstoneKey(collection, id));
  });

const presentKeys = (state: AppState): ReadonlySet<string> =>
  new Set(
    COLLECTIONS.flatMap((collection) =>
      Object.keys(state[collection]).map((id) => tombstoneKey(collection, id)),
    ),
  );

/**
 * Stamps a local change with what it deleted.
 *
 * Every record present before and gone after gets a tombstone at `at`; a key
 * that is present again after being deleted — a regenerated lecture under the
 * same lesson id — loses its tombstone, because the user just brought it back.
 */
export const recordDeletions = (before: AppState, after: AppState, at: Instant): AppState => {
  const removed = removedKeys(before, after);
  const present = presentKeys(after);
  const kept = Object.entries(after.deleted).filter(([key]) => !present.has(key));
  if (removed.length === 0 && kept.length === Object.keys(after.deleted).length) return after;

  return {
    ...after,
    deleted: Object.fromEntries([...kept, ...removed.map((key) => [key, at] as const)]),
  };
};

/** Both sides' tombstones, keeping the later deletion of any key. */
export const unionTombstones = (a: Tombstones, b: Tombstones): Tombstones =>
  Object.entries(b).reduce<Record<string, Instant>>(
    (merged, [key, at]) => {
      const existing = merged[key];
      merged[key] = existing === undefined ? at : latest(existing, at);
      return merged;
    },
    { ...a },
  );

/**
 * Picks between two copies of one record: the newer one, and on a tie or when
 * neither carries a time, the copy from the side that wins collisions.
 */
const pick = <V>(loser: V | undefined, winner: V | undefined): V | undefined => {
  if (loser === undefined) return winner;
  if (winner === undefined) return loser;
  const loserAt = recordTime(loser);
  const winnerAt = recordTime(winner);
  return loserAt !== undefined && winnerAt !== undefined && isAfter(loserAt, winnerAt)
    ? loser
    : winner;
};

/**
 * Merges one collection: the newer copy of every record, minus the records a
 * tombstone outlives.
 */
export const mergeCollection = <V>(
  collection: CollectionName,
  base: Readonly<Record<string, V>>,
  winner: Readonly<Record<string, V>>,
  deleted: Tombstones,
): Record<string, V> =>
  Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(winner)])].flatMap((id) => {
      const record = pick(base[id], winner[id]);
      return record !== undefined && survives(record, deleted[tombstoneKey(collection, id)])
        ? [[id, record] as const]
        : [];
    }),
  );
