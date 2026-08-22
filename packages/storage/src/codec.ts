import {
  accountId,
  defaultSettings,
  emptyState,
  err,
  LOCAL_OWNER,
  ok,
  STATE_VERSION,
  type AppState,
  type Owner,
  type Result,
} from "@pna/core";
import { storageError, type StorageError } from "./ports/kv.js";

/** A migration takes the raw persisted document one version forward. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*.
 *
 * v1 → v2 introduced accounts. A document written before that belongs to nobody
 * in particular, which is exactly what `local` means, so the migration is an
 * annotation rather than a change of data.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (raw) => ({ ...raw, version: 2, owner: { kind: "local" } }),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const collection = (raw: unknown): Record<string, unknown> => (isRecord(raw) ? raw : {});

/**
 * An owner is only honoured when it is well-formed. A half-written owner would
 * silently attach one person's data to another's key, so anything unrecognised
 * falls back to `local`.
 */
const owner = (raw: unknown): Owner => {
  if (!isRecord(raw)) return LOCAL_OWNER;
  const id = raw["accountId"];
  if (raw["kind"] === "account" && typeof id === "string" && id.length > 0)
    return { kind: "account", accountId: accountId(id) };
  return LOCAL_OWNER;
};

/**
 * Rebuilds an `AppState` from a persisted document.
 *
 * Missing or malformed collections fall back to empty rather than failing the
 * whole load — losing one corrupt collection beats losing the user's topics.
 */
const hydrate = (raw: Record<string, unknown>): AppState => {
  const base = emptyState();
  const settings = isRecord(raw["settings"]) ? raw["settings"] : {};

  return {
    version: STATE_VERSION,
    owner: owner(raw["owner"]),
    topics: collection(raw["topics"]) as AppState["topics"],
    sources: collection(raw["sources"]) as AppState["sources"],
    digests: collection(raw["digests"]) as AppState["digests"],
    programs: collection(raw["programs"]) as AppState["programs"],
    lessonContent: collection(raw["lessonContent"]) as AppState["lessonContent"],
    quizzes: collection(raw["quizzes"]) as AppState["quizzes"],
    attempts: collection(raw["attempts"]) as AppState["attempts"],
    settings: { ...base.settings, ...defaultSettings(), ...settings } as AppState["settings"],
  };
};

export const encodeState = (state: AppState): string => JSON.stringify(state);

/**
 * Parses, migrates and hydrates a persisted document.
 *
 * A document from a *newer* app version is refused rather than silently
 * downgraded — reading it with older rules would quietly drop fields.
 */
export const decodeState = (
  serialised: string,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Result<AppState, StorageError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialised);
  } catch {
    return err(storageError("corrupt", "Сохранённые данные не читаются как JSON"));
  }

  if (!isRecord(parsed)) {
    return err(storageError("corrupt", "Сохранённые данные не являются объектом"));
  }

  const rawVersion = parsed["version"];
  let version = typeof rawVersion === "number" && Number.isInteger(rawVersion) ? rawVersion : 1;
  if (version > STATE_VERSION) {
    return err(
      storageError("corrupt", `Данные версии ${version} новее приложения (${STATE_VERSION})`),
    );
  }

  let document = parsed;
  while (version < STATE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      return err(storageError("corrupt", `Нет миграции с версии ${version}`));
    }
    document = migrate(document);
    version += 1;
  }

  return ok(hydrate(document));
};
