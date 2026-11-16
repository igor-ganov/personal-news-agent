import type {
  ContinuationMode,
  DigestPeriod,
  Instant,
  SourceKind,
  SourceStatus,
  TopicLevel,
} from "@pna/core";

/** All user-facing wording lives here, so screens stay free of stray strings. */

export const PERIOD_LABEL: Record<DigestPeriod, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  year: "Год",
};

export const PERIOD_QUESTION: Record<DigestPeriod, string> = {
  day: "Собрать новости за день",
  week: "Собрать новости за неделю",
  month: "Собрать новости за месяц",
  year: "Собрать новости за год",
};

export const STATUS_LABEL: Record<SourceStatus, string> = {
  active: "активен",
  muted: "приглушён",
  blacklisted: "в блеклисте",
};

export const KIND_LABEL: Record<SourceKind, string> = {
  rss: "RSS",
  site: "сайт",
  blog: "блог",
  youtube: "YouTube",
  podcast: "подкаст",
  forum: "форум",
  paper: "статьи",
  "release-notes": "релизы",
  newsletter: "рассылка",
  other: "другое",
};

export const LEVEL_LABEL: Record<TopicLevel, string> = {
  beginner: "начальный",
  intermediate: "средний",
  advanced: "продвинутый",
};

export const CONTINUATION_LABEL: Record<ContinuationMode, string> = {
  fresh: "С нуля",
  deepen: "Углубить",
  extend: "Расширить",
  apply: "Применить",
};

export const CONTINUATION_HINT: Record<ContinuationMode, string> = {
  fresh: "Отдельная программа, без опоры на предыдущие",
  deepen: "Идём дальше по той же линии, не повторяя пройденное",
  extend: "Соседняя территория; пройденное считается известным",
  apply: "Практика поверх уже изученной теории",
};

const RU_DATE = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const RU_DATE_TIME = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const RU_DATE_TIME_EXACT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const formatDate = (instant: Instant | string | null): string =>
  instant ? RU_DATE.format(new Date(instant)) : "";

export const formatDateTime = (instant: Instant | string | null): string =>
  instant ? RU_DATE_TIME.format(new Date(instant)) : "";

/**
 * Down to the second — for lists where entries can legitimately land in the
 * same minute, such as two digests asked for one after the other.
 */
export const formatDateTimeExact = (instant: Instant | string | null): string =>
  instant ? RU_DATE_TIME_EXACT.format(new Date(instant)) : "";

/** "21 авг 2026 — 22 авг 2026" */
export const formatWindow = (from: Instant, to: Instant): string =>
  `${formatDate(from)} — ${formatDate(to)}`;

const plural = (n: number, one: string, few: string, many: string): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const formatCount = (n: number, forms: [string, string, string]): string =>
  `${n} ${plural(n, forms[0], forms[1], forms[2])}`;

export const formatSessions = (n: number): string => formatCount(n, ["занятие", "занятия", "занятий"]);
export const formatWeeks = (n: number): string => formatCount(n, ["неделя", "недели", "недель"]);
export const formatSources = (n: number): string => formatCount(n, ["источник", "источника", "источников"]);
export const formatMinutes = (n: number): string => formatCount(n, ["минута", "минуты", "минут"]);

export const formatPercent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

const pad = (n: number): string => String(n).padStart(2, "0");

/** Elapsed time as a stopwatch reads it: `1:20`, `1:02:05`. */
export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

/** The same span as an ISO 8601 duration, for `<time datetime>`. */
export const isoDuration = (ms: number): string => `PT${Math.max(0, Math.floor(ms / 1000))}S`;
export const formatNews = (n: number): string => formatCount(n, ["новость", "новости", "новостей"]);
export const formatSubtopics = (n: number): string => formatCount(n, ["подтема", "подтемы", "подтем"]);
