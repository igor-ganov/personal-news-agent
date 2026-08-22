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
  day: "Что нового за день",
  week: "Что нового за неделю",
  month: "Что нового за месяц",
  year: "Что нового за год",
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

export const formatDate = (instant: Instant | string | null): string =>
  instant ? RU_DATE.format(new Date(instant)) : "";

export const formatDateTime = (instant: Instant | string | null): string =>
  instant ? RU_DATE_TIME.format(new Date(instant)) : "";

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
