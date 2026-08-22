import { browserPasskeys, type PasskeyAgent } from "@pna/auth";
import { browserStore, type KeyValueStore } from "@pna/storage";

/**
 * Whether the app is running inside the Tauri shell rather than a plain browser.
 * Used only for diagnostics — every capability below has a browser fallback.
 */
export const isTauri = (): boolean =>
  typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;

/**
 * Persistent storage.
 *
 * The Tauri WebView gives `localStorage` a real, per-app profile directory that
 * survives restarts, so one adapter covers both the phone and the browser.
 */
export const platformStore = (): KeyValueStore => browserStore();

/**
 * Secrets get their own slot so the API key never lands in the state document.
 * On Android the WebView profile is inside the app's private storage, which is
 * the same protection the rest of the app data gets.
 */
export const secretStore = (): KeyValueStore => browserStore();

/** Opens an external link in the system browser rather than inside the app. */
export const openExternal = (url: string): void => {
  globalThis.open(url, "_blank", "noopener,noreferrer");
};

/**
 * Where the API lives. Empty at build time means a device-only build: the app
 * runs exactly as before, just without anywhere to sign in.
 */
export const apiBaseUrl = (): string => (import.meta.env.PUBLIC_PNA_API_URL ?? "").trim();

/**
 * Who answers a passkey prompt.
 *
 * The WebView's own WebAuthn implementation covers the browser. On Android the
 * system Credential Manager is what holds passkeys, and reaching it needs a
 * native plugin — until that lands, the WebView path is what runs, so the port
 * exists precisely so swapping it changes nothing else.
 */
export const passkeyAgent = (): PasskeyAgent => browserPasskeys();
