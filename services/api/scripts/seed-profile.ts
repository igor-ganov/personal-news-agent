/**
 * Builds the starting document for a fresh account and prints the SQL that
 * stores it as a one-shot seed: the first account registered after the
 * migration takes it.
 *
 *   cd services/api && bun scripts/seed-profile.ts > migrations/0005_reset_and_seed.sql
 */
import { createTopic, emptyState, randomIds, systemClock, type AppState, type Topic } from "@pna/core";

interface Interest {
  readonly title: string;
  readonly brief: string;
  readonly focus: readonly (readonly [string, string])[];
  readonly excludes: readonly string[];
}

const INTERESTS: readonly Interest[] = [
  {
    title: "AI-агенты и LLM",
    brief: "Как строить и применять агентные системы на LLM в реальной разработке: модели, API, инструменты, практики.",
    focus: [
      ["Агентные системы", "Оркестрация агентов, планирование, память, многоагентные схемы и их надёжность."],
      ["MCP и инструменты", "Model Context Protocol, серверы инструментов, интеграции агентов с внешними системами."],
      ["Модели и API", "Новые модели Claude и конкурентов, возможности API, цены, лимиты, структурированный вывод."],
      ["Разработка с ИИ", "Claude Code и аналоги, рабочие процессы, ревью, тестирование кода, написанного агентами."],
    ],
    excludes: ["хайп без технических деталей", "курсы и инфобизнес"],
  },
  {
    title: "Облако и DevOps",
    brief: "Инфраструктура как код и доставка: AWS, Kubernetes, Terraform, GitOps и edge-платформы.",
    focus: [
      ["AWS и EKS", "Kubernetes в AWS: обновления EKS, сеть, IAM, стоимость, эксплуатация."],
      ["Terraform", "Модули, состояние, планы, OpenTofu, практики для больших репозиториев."],
      ["Helm и Argo CD", "GitOps-доставка, чарты, синхронизация, прогрессивные выкладки."],
      ["Cloudflare Workers", "Workers, D1, Queues, Durable Objects, лимиты и цены edge-платформы."],
    ],
    excludes: ["маркетинговые обзоры облаков"],
  },
  {
    title: "Безопасность и вход",
    brief: "Аутентификация и безопасность приложений: passkeys, OAuth/OIDC, Auth0, защита цепочки поставки.",
    focus: [
      ["Passkeys и WebAuthn", "Спецификация, поддержка в браузерах и Android Credential Manager, UX входа без пароля."],
      ["OAuth, OIDC и Auth0", "Протоколы, изменения в Auth0, типичные ошибки интеграции."],
      ["Безопасность CI и зависимостей", "Supply chain, секреты в пайплайнах, подпись артефактов, уязвимости npm."],
    ],
    excludes: [],
  },
  {
    title: "Frontend-платформа",
    brief: "Веб-платформа без тяжёлых фреймворков: веб-компоненты, Lit, Astro, Tauri и новые браузерные API.",
    focus: [
      ["Lit и веб-компоненты", "Lit, стандарты custom elements, shadow DOM, SSR веб-компонентов."],
      ["Astro", "Релизы Astro, острова, контент, производительность."],
      ["Tauri и мобильный WebView", "Tauri 2 на Android и десктопе, плагины, нативные мосты."],
      ["Браузерные API и доступность", "Новые возможности платформы, производительность, доступность интерфейсов."],
    ],
    excludes: ["Angular"],
  },
  {
    title: "Архитектура и ФП",
    brief: "Проектирование систем: DDD, функциональное программирование в TypeScript, Effect-TS.",
    focus: [
      ["DDD", "Моделирование домена, границы контекстов, слои и порты на практике."],
      ["ФП в TypeScript", "Чистые функции, композиция, типобезопасные ошибки, неизменяемые данные."],
      ["Effect-TS", "Экосистема Effect, паттерны, сравнение с альтернативами."],
      ["TypeScript", "Новые версии языка и компилятора, типовые приёмы."],
    ],
    excludes: [],
  },
  {
    title: "Продвижение проектов",
    brief: "Как запускать и продвигать собственные продукты: SEO, аналитика, каналы, запуски.",
    focus: [
      ["SEO", "Технический SEO, индексация, контент, изменения поисковых алгоритмов."],
      ["Аналитика", "Инструменты продуктовой аналитики, приватность, измерение воронки."],
      ["Запуски и каналы", "Product Hunt, сообщества, рассылки, что работает для инди-продуктов."],
    ],
    excludes: ["серые схемы продвижения"],
  },
];

const ids = randomIds();
const deps = { ids, now: systemClock.now() };

const topicOf = (interest: Interest): Topic => {
  const created = createTopic(
    {
      parentId: null,
      title: interest.title,
      brief: interest.brief,
      level: "advanced",
      language: "ru",
      excludes: [...interest.excludes],
      focusAreas: interest.focus.map(([title, detail]) => ({ title, detail, weight: 3 })),
    },
    deps,
  );
  if (!created.ok) throw new Error(`${interest.title}: ${String(created.error)}`);
  return created.value;
};

const topics = INTERESTS.map(topicOf);
const base = emptyState();
const state: AppState = {
  ...base,
  topics: Object.fromEntries(topics.map((topic) => [topic.id, topic])),
  settings: { ...base.settings, model: "claude-opus-5-5" },
};

const sql = (value: string): string => `'${value.replaceAll("'", "''")}'`;

process.stdout.write(`-- Начать с чистого листа и одного профиля.
--
-- Старые аккаунты, ключи, сессии, документы и задания удаляются целиком: после
-- миграции 0004 они висели без связей, и телефон предлагал ключи от аккаунтов,
-- которых уже нет. Взамен готовится стартовый документ с темами — его забирает
-- первый аккаунт, зарегистрированный после этой миграции, и только он.
--
-- Сгенерировано: bun scripts/seed-profile.ts

PRAGMA defer_foreign_keys = true;

DELETE FROM device_invites;
DELETE FROM provider_keys;
DELETE FROM jobs;
DELETE FROM documents;
DELETE FROM sessions;
DELETE FROM credentials;
DELETE FROM challenges;
DELETE FROM rate_limits;
DELETE FROM accounts;

CREATE TABLE account_seeds (
  id         TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO account_seeds (id, body, created_at) VALUES (
  ${sql(ids.next("seed"))},
  ${sql(JSON.stringify(state))},
  ${sql(deps.now)}
);
`);
