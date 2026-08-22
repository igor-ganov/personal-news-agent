import { pruneDigests } from "../digests/select.js";
import type { AttemptId, DigestId, LessonId, ProgramId, QuizId, SourceId, TopicId } from "../model/ids.js";
import type { AppState } from "../model/state.js";
import { programLessons } from "../skills/progress.js";
import { descendantIdsOf } from "../topics/tree.js";
import type { Action } from "./actions.js";

const without = <K extends string, V>(
  record: Readonly<Record<K, V>>,
  keys: ReadonlySet<K>,
): Record<K, V> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key as K))) as Record<K, V>;

const indexed = <K extends string, V extends { readonly id: K }>(
  items: readonly V[],
): Record<K, V> => Object.fromEntries(items.map((item) => [item.id, item])) as Record<K, V>;

/** Drops a set of programs along with everything hanging off their lessons. */
const removePrograms = (state: AppState, programIds: ReadonlySet<ProgramId>): AppState => {
  const lessonIds = new Set<LessonId>(
    Object.values(state.programs)
      .filter((p) => programIds.has(p.id))
      .flatMap((p) => programLessons(p).map((l) => l.id)),
  );

  const quizIds = new Set<QuizId>(
    Object.values(state.quizzes)
      .filter((q) => lessonIds.has(q.lessonId))
      .map((q) => q.id),
  );

  const attemptIds = new Set<AttemptId>(
    Object.values(state.attempts)
      .filter((a) => quizIds.has(a.quizId))
      .map((a) => a.id),
  );

  return {
    ...state,
    programs: without(state.programs, programIds),
    lessonContent: without(state.lessonContent, lessonIds),
    quizzes: without(state.quizzes, quizIds),
    attempts: without(state.attempts, attemptIds),
  };
};

/**
 * The single place application state changes. Total and pure: same state plus
 * same action always yields the same next state, and nothing here can throw.
 */
export const reduce = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case "state/replace":
      return action.state;

    case "topics/upsert":
      return { ...state, topics: { ...state.topics, [action.topic.id]: action.topic } };

    case "topics/upsert-many":
      return { ...state, topics: { ...state.topics, ...indexed(action.topics) } };

    case "topics/remove": {
      const topicIds = new Set<TopicId>([action.id, ...descendantIdsOf(state.topics, action.id)]);

      const sourceIds = new Set<SourceId>(
        Object.values(state.sources)
          .filter((s) => topicIds.has(s.topicId))
          .map((s) => s.id),
      );
      const digestIds = new Set<DigestId>(
        Object.values(state.digests)
          .filter((d) => topicIds.has(d.topicId))
          .map((d) => d.id),
      );
      const programIds = new Set<ProgramId>(
        Object.values(state.programs)
          .filter((p) => topicIds.has(p.topicId))
          .map((p) => p.id),
      );

      const withoutPrograms = removePrograms(state, programIds);
      return {
        ...withoutPrograms,
        topics: without(state.topics, topicIds),
        sources: without(state.sources, sourceIds),
        digests: without(state.digests, digestIds),
      };
    }

    case "sources/upsert-many":
      return { ...state, sources: { ...state.sources, ...indexed(action.sources) } };

    case "sources/remove":
      return { ...state, sources: without(state.sources, new Set([action.id])) };

    case "digests/upsert":
      return { ...state, digests: { ...state.digests, [action.digest.id]: action.digest } };

    case "digests/remove":
      return { ...state, digests: without(state.digests, new Set([action.id])) };

    case "digests/prune":
      return { ...state, digests: pruneDigests(state.digests, action.keepPerPeriod) };

    case "programs/upsert":
      return { ...state, programs: { ...state.programs, [action.program.id]: action.program } };

    case "programs/remove":
      return removePrograms(state, new Set([action.id]));

    case "lessons/content":
      return {
        ...state,
        lessonContent: { ...state.lessonContent, [action.content.lessonId]: action.content },
      };

    case "lessons/content-remove":
      return { ...state, lessonContent: without(state.lessonContent, new Set([action.id])) };

    case "quizzes/upsert":
      return { ...state, quizzes: { ...state.quizzes, [action.quiz.id]: action.quiz } };

    case "attempts/record":
      return { ...state, attempts: { ...state.attempts, [action.attempt.id]: action.attempt } };

    case "attempts/remove":
      return { ...state, attempts: without(state.attempts, new Set([action.id])) };

    case "settings/patch":
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
};

export const reduceAll = (state: AppState, actions: readonly Action[]): AppState =>
  actions.reduce(reduce, state);
