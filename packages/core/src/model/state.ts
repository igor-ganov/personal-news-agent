import { LOCAL_OWNER, type Owner } from "./account.js";
import type { Digest, DigestPeriod } from "./digest.js";
import type {
  AttemptId,
  DigestId,
  LessonId,
  ProgramId,
  QuizId,
  SourceId,
  TopicId,
} from "./ids.js";
import type { QuizAttempt, Quiz } from "./quiz.js";
import type { LessonContent, SkillProgram } from "./skill.js";
import type { Source } from "./source.js";
import type { Topic } from "./topic.js";

/** Bumped whenever the persisted shape changes; see @pna/storage migrations. */
export const STATE_VERSION = 2;

export interface Settings {
  /** Which content provider implementation is active. */
  readonly providerId: string;
  readonly model: string;
  /** Auto-discovery keeps source lists fresh unless the user turned it off. */
  readonly autoRefreshSources: boolean;
  /** How stale a source list may get before discovery runs again. */
  readonly sourceRefreshDays: number;
  /** Periods for which digests are kept up to date in the background. */
  readonly autoDigestPeriods: readonly DigestPeriod[];
}

export const defaultSettings = (): Settings => ({
  providerId: "anthropic",
  model: "claude-opus-5",
  autoRefreshSources: true,
  sourceRefreshDays: 7,
  autoDigestPeriods: ["day", "week"],
});

/**
 * The whole application state — a plain, serialisable structure.
 * Every mutation goes through a pure reducer (see `state/reduce.ts`).
 */
export interface AppState {
  readonly version: number;
  /**
   * Whose data this is. Everything below belongs to this owner, and the
   * persisted document is stored under a key derived from it, so two accounts
   * on one device never see each other's topics.
   */
  readonly owner: Owner;
  readonly topics: Readonly<Record<TopicId, Topic>>;
  readonly sources: Readonly<Record<SourceId, Source>>;
  readonly digests: Readonly<Record<DigestId, Digest>>;
  readonly programs: Readonly<Record<ProgramId, SkillProgram>>;
  readonly lessonContent: Readonly<Record<LessonId, LessonContent>>;
  readonly quizzes: Readonly<Record<QuizId, Quiz>>;
  readonly attempts: Readonly<Record<AttemptId, QuizAttempt>>;
  readonly settings: Settings;
}

export const emptyState = (owner: Owner = LOCAL_OWNER): AppState => ({
  version: STATE_VERSION,
  owner,
  topics: {},
  sources: {},
  digests: {},
  programs: {},
  lessonContent: {},
  quizzes: {},
  attempts: {},
  settings: defaultSettings(),
});
