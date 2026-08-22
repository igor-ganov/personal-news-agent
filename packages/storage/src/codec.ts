import { defaultSettings, emptyState, err, ok, STATE_VERSION, type AppState, type Result } from "@pna/core";
import { storageError, type StorageError } from "./ports/kv.js";

/** A migration takes the raw persisted document one version forward. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version being migrated *from*. Empty while v1 is the only shape. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const collection = (raw: unknown): Record<string, unknown> => (isRecord(raw) ? raw : {});

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
