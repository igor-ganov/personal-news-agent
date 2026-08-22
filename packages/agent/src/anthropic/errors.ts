import Anthropic from "@anthropic-ai/sdk";
import type { ProviderError } from "../ports/content-provider.js";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Maps SDK failures onto the port's error vocabulary.
 * Checked most specific first — every class extends `APIError`.
 */
export const toProviderError = (error: unknown): ProviderError => {
  if (error instanceof Anthropic.AuthenticationError)
    return { kind: "auth", message: "Ключ API отклонён" };
  if (error instanceof Anthropic.PermissionDeniedError)
    return { kind: "auth", message: "Ключу API не хватает прав" };
  if (error instanceof Anthropic.RateLimitError)
    return { kind: "rate-limit", message: "Превышен лимит запросов" };
  if (error instanceof Anthropic.APIConnectionError)
    return { kind: "network", message: "Нет связи с API" };
  if (error instanceof Anthropic.APIError)
    return { kind: "unknown", message: `Ошибка API ${error.status ?? ""}: ${error.message}`.trim() };
  return { kind: "unknown", message: messageOf(error) };
};

export const invalidOutput = (detail: string): ProviderError => ({
  kind: "invalid-output",
  message: `Модель вернула непригодный ответ: ${detail}`,
});

export const refused = (explanation: string): ProviderError => ({
  kind: "refused",
  message: explanation || "Запрос отклонён политикой безопасности",
});
