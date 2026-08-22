/** One error shape for the whole application layer — provider, storage and domain alike. */
export interface AppError {
  readonly kind: string;
  readonly message: string;
}

/** Domain failures are codes; the user needs a sentence. */
const DOMAIN_MESSAGES: Readonly<Record<string, string>> = {
  "empty-title": "Название не может быть пустым",
  "unknown-topic": "Тема не найдена",
  "unknown-focus": "Раздел фокуса не найден",
  "unknown-source": "Источник не найден",
  "unknown-lesson": "Занятие не найдено",
  "unknown-program": "Программа не найдена",
  "unknown-quiz": "Тест ещё не создан",
  cycle: "Нельзя вложить тему саму в себя",
  duplicate: "Такой источник уже есть",
  "invalid-url": "Ссылка не похожа на адрес сайта",
  "out-of-range": "Такого пункта нет в плане",
  "empty-plan": "В плане должен остаться хотя бы один модуль с занятием",
  "weeks-out-of-range": "Длительность должна быть от 1 до 104 недель",
  "sessions-out-of-range": "Занятий в неделю может быть от 1 до 7",
  "minutes-out-of-range": "Длительность занятия — от 10 до 240 минут",
  "no-lesson-content": "Сначала нужно сгенерировать лекцию",
};

export const domainError = (code: string): AppError => ({
  kind: "domain",
  message: DOMAIN_MESSAGES[code] ?? code,
});

export const appError = (kind: string, message: string): AppError => ({ kind, message });
