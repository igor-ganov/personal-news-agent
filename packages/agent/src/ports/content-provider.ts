import type {
  DigestDraft,
  DigestPeriod,
  Instant,
  LessonContentDraft,
  LessonPlan,
  PriorMaterial,
  ProgramDraft,
  QuizDraft,
  Result,
  Source,
  SourceCandidate,
  TopicContext,
  Window,
} from "@pna/core";

export const PROVIDER_ERROR_KINDS = [
  "auth",
  "rate-limit",
  "network",
  "refused",
  "invalid-output",
  "unknown",
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

export interface ProviderError {
  readonly kind: ProviderErrorKind;
  readonly message: string;
}

export type ProviderResult<T> = Result<T, ProviderError>;

/** Whether retrying the same call could plausibly succeed. */
export const isRetryable = (error: ProviderError): boolean =>
  error.kind === "rate-limit" || error.kind === "network";

/* ----------------------------------------------------------------- inputs -- */

export interface DiscoverSourcesInput {
  readonly context: TopicContext;
  /** Sources already known — so the provider proposes genuinely new ones. */
  readonly known: readonly Source[];
  /** Hosts the user blacklisted; must never come back. */
  readonly blockedHosts: readonly string[];
  readonly limit: number;
  readonly now: Instant;
}

export interface BuildDigestInput {
  readonly context: TopicContext;
  readonly period: DigestPeriod;
  readonly window: Window;
  /** Sources to draw on. An empty list means "search the open web". */
  readonly sources: readonly Source[];
  readonly blockedHosts: readonly string[];
  readonly now: Instant;
}

export interface DraftProgramInput {
  readonly context: TopicContext;
  /** What the user wants out of this program, in their own words. */
  readonly intent: string;
  readonly weeks: number;
  readonly sessionsPerWeek: number;
  readonly minutesPerSession: number;
  /** Material from the programs this one builds on. */
  readonly priorMaterial: readonly PriorMaterial[];
  readonly continuation: "fresh" | "deepen" | "extend" | "apply";
  readonly now: Instant;
}

export interface WriteLessonInput {
  readonly context: TopicContext;
  readonly programTitle: string;
  readonly programGoal: string;
  readonly moduleTitle: string;
  readonly lesson: LessonPlan;
  /** Titles of the sessions already covered in this program, in order. */
  readonly coveredInProgram: readonly string[];
  readonly priorMaterial: readonly PriorMaterial[];
  readonly blockedHosts: readonly string[];
  readonly now: Instant;
}

export interface BuildQuizInput {
  readonly context: TopicContext;
  readonly lesson: LessonPlan;
  readonly lessonBody: string;
  readonly keyPoints: readonly string[];
  readonly questionCount: number;
  readonly now: Instant;
}

/* --------------------------------------------------------------- the port -- */

/**
 * Everything the app needs from a content backend. Implementations are swappable:
 * `AnthropicContentProvider` talks to the Claude API with web search;
 * `MockContentProvider` returns deterministic material offline and in tests.
 */
export interface ContentProvider {
  readonly id: string;
  discoverSources(input: DiscoverSourcesInput): Promise<ProviderResult<SourceCandidate[]>>;
  buildDigest(input: BuildDigestInput): Promise<ProviderResult<DigestDraft>>;
  draftProgram(input: DraftProgramInput): Promise<ProviderResult<ProgramDraft>>;
  writeLesson(input: WriteLessonInput): Promise<ProviderResult<LessonContentDraft>>;
  buildQuiz(input: BuildQuizInput): Promise<ProviderResult<QuizDraft>>;
}
