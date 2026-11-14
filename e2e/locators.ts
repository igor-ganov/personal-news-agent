/**
 * What the end-to-end tests look for, by the names a person sees. Kept in one
 * place so a renamed button breaks one line, not every spec.
 */
export const LABELS = {
  settings: "Настройки",
  accountAndSync: "Аккаунт и синхронизация",
  continue: "Продолжить",
  signInWithKey: "Войти по ключу",
  newAccount: "Новый аккаунт",
  createAccount: "Завести аккаунт",
  sync: "Синхронизировать",
  signOut: "Выйти",
  aboutTab: "О теме",
  deleteTopic: "Удалить тему со всем содержимым",
  sourcesTab: "Источники",
  skillsTab: "Скилы",
  addSubtopic: "Добавить подтему",
  newProgram: "Новая программа",
  askIdeas: "Подобрать варианты",
  moreIdeas: "Ещё 10",
  subtopicIdeas: "Идеи подтем",
  skillIdeas: "Идеи навыков",
  titleField: "Название",
  create: "Создать",
  queued: "В очереди на сервере — начнётся в течение минуты",
} as const;

/** The six topics the fresh-start migration prepares, as the list shows them. */
export const SEEDED_TOPICS = [
  "AI-агенты и LLM",
  "Облако и DevOps",
  "Безопасность и вход",
  "Frontend-платформа",
  "Архитектура и ФП",
  "Продвижение проектов",
] as const;
