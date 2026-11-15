import type {
  DigestDraft,
  DigestPeriod,
  GenerationProgress,
  Instant,
  LessonContentDraft,
  LessonPlan,
  PriorMaterial,
  ProgramDraft,
  QuizDraft,
  Result,
  Source,
  SourceCandidate,
  Suggestion,
  SuggestionKind,
  Setup,
  SetupKind,
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

export interface SuggestInput {
  readonly context: TopicContext;
  /** What is being suggested: subtopics of the topic, or skills to learn in it. */
  readonly kind: SuggestionKind;
  /** Titles that exist or were already offered — each batch must be new. */
  readonly exclude: readonly string[];
  readonly count: number;
}

export interface SetupInput {
  /** What the card is: a topic (or subtopic), or a skill to learn. */
  readonly kind: SetupKind;
  /** The name the user typed: a topic title, or a skill goal. */
  readonly title: string;
  /** Where the card goes: the parent of a subtopic, the topic of a skill; none for a new root topic. */
  readonly context?: TopicContext;
  /** BCP-47 language for the proposed text. */
  readonly language: string;
}

/* --------------------------------------------------------------- the port -- */

export type ProgressListener = (progress: GenerationProgress) => void;

/** How a caller follows a generation while it runs. Never part of the request. */
export interface GenerationOptions {
  readonly onProgress?: ProgressListener;
}

/**
 * Everything the app needs from a content backend. Implementations are swappable:
 * `AnthropicContentProvider` talks to the Claude API with web search;
 * `MockContentProvider` returns deterministic material offline and in tests.
 */
export interface ContentProvider {
  readonly id: string;
  discoverSources(
    input: DiscoverSourcesInput,
    options?: GenerationOptions,
  ): Promise<ProviderResult<SourceCandidate[]>>;
  buildDigest(input: BuildDigestInput, options?: GenerationOptions): Promise<ProviderResult<DigestDraft>>;
  draftProgram(input: DraftProgramInput, options?: GenerationOptions): Promise<ProviderResult<ProgramDraft>>;
  writeLesson(
    input: WriteLessonInput,
    options?: GenerationOptions,
  ): Promise<ProviderResult<LessonContentDraft>>;
  buildQuiz(input: BuildQuizInput, options?: GenerationOptions): Promise<ProviderResult<QuizDraft>>;
  /** Ideas to start a card from — quick, no web search, answered while the user waits. */
  suggest(input: SuggestInput): Promise<ProviderResult<Suggestion[]>>;
  /** Settings for a card from its name — as quick as `suggest`, answered while the user waits. */
  proposeSetup(input: SetupInput): Promise<ProviderResult<Setup>>;
}
