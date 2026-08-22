import type { ProviderError } from "../ports/content-provider.js";
import type { AnthropicModule } from "./sdk.js";

export type ErrorMapper = (error: unknown) => ProviderError;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Maps SDK failures onto the port's error vocabulary using the SDK's own typed
 * exception classes, checked most specific first — every class extends `APIError`.
 *
 * The SDK module is passed in rather than imported: it is loaded dynamically,
 * and this keeps the mapper honest about which build of it produced the error.
 */
export const sdkErrorMapper =
  (sdk: AnthropicModule): ErrorMapper =>
  (error: unknown): ProviderError => {
    const Anthropic = sdk.default;
    if (error instanceof Anthropic.AuthenticationError)
      return { kind: "auth", message: "Ключ API отклонён" };
    if (error instanceof Anthropic.PermissionDeniedError)
      return { kind: "auth", message: "Ключу API не хватает прав" };
    if (error instanceof Anthropic.RateLimitError)
      return { kind: "rate-limit", message: "Превышен лимит запросов" };
    if (error instanceof Anthropic.APIConnectionError)
      return { kind: "network", message: "Нет связи с API" };
    if (error instanceof Anthropic.APIError)
      return {
        kind: "unknown",
        message: `Ошибка API ${error.status ?? ""}: ${error.message}`.trim(),
      };
    return { kind: "unknown", message: messageOf(error) };
  };

/**
 * The fallback used when the SDK is not loaded — in tests, and for failures
 * raised before the client exists. It reads the documented `status` field
 * rather than guessing from the message text.
 */
export const structuralErrorMapper: ErrorMapper = (error: unknown): ProviderError => {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    if (status === 401 || status === 403) return { kind: "auth", message: "Ключ API отклонён" };
    if (status === 429) return { kind: "rate-limit", message: "Превышен лимит запросов" };
    return { kind: "unknown", message: `Ошибка API ${status}: ${messageOf(error)}` };
  }
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
