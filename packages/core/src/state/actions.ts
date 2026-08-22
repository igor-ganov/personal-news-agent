import type { Digest } from "../model/digest.js";
import type { AttemptId, DigestId, LessonId, ProgramId, SourceId, TopicId } from "../model/ids.js";
import type { Quiz, QuizAttempt } from "../model/quiz.js";
import type { LessonContent, SkillProgram } from "../model/skill.js";
import type { Source } from "../model/source.js";
import type { AppState, Settings } from "../model/state.js";
import type { Topic } from "../model/topic.js";

/**
 * Every action carries values that are already valid — validation lives in the
 * use-case layer, which returns `Result`. That keeps the reducer total: it can
 * never fail, so the UI never has to handle a failed dispatch.
 */
export type Action =
  | { readonly type: "state/replace"; readonly state: AppState }
  | { readonly type: "topics/upsert"; readonly topic: Topic }
  | { readonly type: "topics/upsert-many"; readonly topics: readonly Topic[] }
  | { readonly type: "topics/remove"; readonly id: TopicId }
  | { readonly type: "sources/upsert-many"; readonly sources: readonly Source[] }
  | { readonly type: "sources/remove"; readonly id: SourceId }
  | { readonly type: "digests/upsert"; readonly digest: Digest }
  | { readonly type: "digests/remove"; readonly id: DigestId }
  | { readonly type: "digests/prune"; readonly keepPerPeriod: number }
  | { readonly type: "programs/upsert"; readonly program: SkillProgram }
  | { readonly type: "programs/remove"; readonly id: ProgramId }
  | { readonly type: "lessons/content"; readonly content: LessonContent }
  | { readonly type: "lessons/content-remove"; readonly id: LessonId }
  | { readonly type: "quizzes/upsert"; readonly quiz: Quiz }
  | { readonly type: "attempts/record"; readonly attempt: QuizAttempt }
  | { readonly type: "attempts/remove"; readonly id: AttemptId }
  | { readonly type: "settings/patch"; readonly patch: Partial<Settings> };
