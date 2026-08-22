import type {
  AuthenticationResponseJson,
  PasskeyAgent,
  PasskeyCreationOptions,
  PasskeyRequestOptions,
  RegistrationResponseJson,
} from "@pna/auth";

/**
 * Ключи доступа на Android.
 *
 * В WebView нет WebAuthn, поэтому запрос уходит в нативный плагин, а тот — в
 * системный менеджер учётных данных. Формат по обе стороны один и тот же JSON
 * WebAuthn, так что переводить ничего не нужно: options идут как есть, ответ
 * возвращается как есть.
 */

interface PluginResponse {
  readonly responseJson: string;
}

const invokeTauri = async <T>(command: string, payload?: unknown): Promise<T> => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, payload as Record<string, unknown>);
};

/** Отмену интерфейс показывает иначе, чем сбой, поэтому имя ошибки важно. */
const asDomLikeError = (error: unknown): never => {
  const message = String((error as Error)?.message ?? error ?? "");
  const named = new Error(message);
  named.name = message.includes("CANCELLED")
    ? "NotAllowedError"
    : message.includes("UNSUPPORTED") || message.includes("недоступны")
      ? "NotSupportedError"
      : "UnknownError";
  throw named;
};

export const tauriPasskeys = (): PasskeyAgent => ({
  async isAvailable() {
    try {
      const result = await invokeTauri<{ available: boolean }>("plugin:passkeys|is_available");
      return result.available;
    } catch {
      return false;
    }
  },

  async create(options: PasskeyCreationOptions): Promise<RegistrationResponseJson> {
    try {
      const result = await invokeTauri<PluginResponse>("plugin:passkeys|create", {
        payload: { requestJson: JSON.stringify(options) },
      });
      return JSON.parse(result.responseJson) as RegistrationResponseJson;
    } catch (error) {
      return asDomLikeError(error);
    }
  },

  async get(options: PasskeyRequestOptions): Promise<AuthenticationResponseJson> {
    try {
      const result = await invokeTauri<PluginResponse>("plugin:passkeys|get", {
        payload: { requestJson: JSON.stringify(options) },
      });
      return JSON.parse(result.responseJson) as AuthenticationResponseJson;
    } catch (error) {
      return asDomLikeError(error);
    }
  },
});
