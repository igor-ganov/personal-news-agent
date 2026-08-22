import { LOCAL_OWNER, sameOwner, type AppState, type Owner, type Result } from "@pna/core";
import type { Migration } from "./codec.js";
import type { KeyValueStore, StorageError } from "./ports/kv.js";
import { createStateRepository, stateKeyFor, type StateRepository } from "./repository.js";

/**
 * A repository that can change whose data it is reading and writing.
 *
 * Signing in does not restart the app, but it does change the document every
 * later save must land in. Everything downstream — the store, the debounced
 * saver — holds one repository reference for the life of the process, so the
 * switch has to happen behind that reference rather than by rebuilding it.
 */
export interface OwnedRepository extends StateRepository {
  /** Whose document reads and writes currently go to. */
  owner(): Owner;
  /** Points subsequent reads and writes at another owner's document. */
  use(owner: Owner): void;
  /** A repository for one specific owner, regardless of the current one. */
  of(owner: Owner): StateRepository;
}

export interface OwnedRepositoryOptions {
  readonly owner?: Owner;
  readonly migrations?: Readonly<Record<number, Migration>>;
}

export const createOwnedRepository = (
  store: KeyValueStore,
  options: OwnedRepositoryOptions = {},
): OwnedRepository => {
  const cache = new Map<string, StateRepository>();

  const of = (owner: Owner): StateRepository => {
    const key = stateKeyFor(owner);
    const existing = cache.get(key);
    if (existing) return existing;

    const repository = createStateRepository(store, {
      key,
      ...(options.migrations ? { migrations: options.migrations } : {}),
    });
    cache.set(key, repository);
    return repository;
  };

  let current = options.owner ?? LOCAL_OWNER;

  return {
    owner: () => current,
    use(owner) {
      if (!sameOwner(owner, current)) current = owner;
    },
    of,
    load: (): Promise<Result<AppState | null, StorageError>> => of(current).load(),
    save: (state: AppState): Promise<Result<void, StorageError>> => of(current).save(state),
    clear: (): Promise<Result<void, StorageError>> => of(current).clear(),
  };
};
