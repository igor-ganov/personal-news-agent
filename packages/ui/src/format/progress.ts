import type { GenerationProgress, ProgressStage } from "@pna/core";

/** The kinds of generation a screen can show progress for. */
export type ProgressSubject = "sources" | "digest" | "program" | "lesson" | "quiz";

/** How the piece being written is named, per kind of work. */
const ITEM: Readonly<Record<ProgressSubject, (item: string, n: number) => string>> = {
  sources: (item) => `Добавляю источник «${item}»`,
  digest: (item) => `Пишу о «${item}»`,
  program: (item) => `Расписываю «${item}»`,
  lesson: (item) => `Пишу раздел «${item}»`,
  quiz: (item, n) => `Вопрос ${n}: «${item}»`,
};

const searchesSoFar = (progress: GenerationProgress): readonly string[] =>
  progress.searches > 0 ? [`Позади поисков: ${progress.searches}`] : [];

const STAGE: Readonly<
  Record<ProgressStage, (subject: ProgressSubject, progress: GenerationProgress) => readonly string[]>
> = {
  queued: () => ["В очереди на сервере — начнётся в течение минуты"],
  thinking: (_subject, progress) =>
    progress.searches === 0
      ? ["Обдумываю, с чего начать"]
      : ["Обдумываю найденное", ...searchesSoFar(progress)],
  searching: (_subject, progress) => [
    progress.query ? `Поиск ${progress.searches}: «${progress.query}»` : "Начинаю поиск",
    ...(progress.found.length > 0 ? [`Смотрю: ${progress.found.join(", ")}`] : []),
  ],
  writing: (subject, progress) => [
    progress.item ? ITEM[subject](progress.item, progress.items) : "Собираю ответ",
    ...searchesSoFar(progress),
  ],
  fixing: () => ["Модель ошиблась в формате ответа — исправляет"],
};

/**
 * What a running generation is doing, as lines a person can read: the current
 * step first, then what supports it. Empty when nobody has reported anything.
 */
export const progressSteps = (
  subject: ProgressSubject,
  progress: GenerationProgress | null,
): readonly string[] => (progress ? STAGE[progress.stage](subject, progress) : []);
