import {
  createDelegatingProvider,
  createMockProvider,
  DEFAULT_MODEL,
  memoiseProvider,
} from "@pna/agent";
import {
  bootstrap,
  shareApiKey,
  startAutoSync,
  startJobPolling,
  syncJobs,
  syncNow,
  type AppContext,
  type AuthWiring,
} from "@pna/app";
import { createAuthClient, createJobsClient, createSessionStore, createTransport } from "@pna/auth";
import { createSecretStore } from "@pna/storage";
import "@fontsource-variable/literata";
import "@fontsource/caveat/600.css";
import { tokensCss } from "@pna/ui";
import { setAppContext } from "./context.js";
import { registerDiagramRenderer } from "./diagrams.js";
import { apiBaseUrl, passkeyAgent, platformStore, secretStore } from "./platform.js";
import { jobPollingWarning } from "./job-warning.js";
import "./screens/pna-app.js";
import "./screens/pna-sign-in-screen.js";

const SEPARATOR = "\u0000";

/**
 * Wires the application together and puts it on screen.
 *
 * The provider is resolved per call rather than fixed at startup: pasting an
 * API key or switching model has to take effect immediately, and until a key
 * exists the app runs on the offline provider so every screen stays usable.
 */
export const start = async (mount: HTMLElement): Promise<void> => {
  injectTokens();

  const kv = platformStore();
  const secrets = createSecretStore(secretStore());
  const auth = authWiring(kv);

  let context: AppContext | null = null;

  const provider = createDelegatingProvider(
    memoiseProvider(
      async () => {
        const key = (await secrets.get()) ?? "";
        const model = context?.store.getState().settings.model ?? DEFAULT_MODEL;
        return `${key}${SEPARATOR}${model}`;
      },
      (fingerprint) => {
        const at = fingerprint.indexOf(SEPARATOR);
        const apiKey = fingerprint.slice(0, at);
        const model = fingerprint.slice(at + 1);
        if (apiKey.length === 0) return createMockProvider();

        // Loaded on first use, so the startup chunk carries neither the SDK nor
        // the prompt and schema machinery around it.
        return createDelegatingProvider(async () => {
          const { createProvider } = await import("./anthropic.js");
          return createProvider(apiKey, model);
        }, "anthropic");
      },
    ),
  );

  // The shell exists only after bootstrap, so the reporter reaches it by reference.
  let shell: HTMLElement | null = null;

  const started = await bootstrap({
    provider,
    kv,
    ...(auth ? { auth } : {}),
    secrets,
    onSaveError: (message) =>
      shell?.setAttribute("warning", `Данные не сохраняются: ${message}`),
  });
  context = started.context;
  setAppContext(started.context);
  registerDiagramRenderer();

  // A phone can kill the process without warning; write before it can.
  const flush = (): void => {
    void started.flush();
  };
  globalThis.addEventListener("pagehide", flush);

  // Generation runs on the server, so coming back to the app is the moment to
  // ask what happened while it was away — a lecture may be waiting, or a
  // failure that nobody has seen yet.
  startJobPolling(started.context, jobPollingWarning(() => shell ?? undefined));

  // The account, not this phone, is where the data lives: every change is
  // pushed on its own, so a topic typed here shows up on the other device.
  startAutoSync(started.context, {
    onError: (message) => shell?.setAttribute("warning", `Синхронизация: ${message}`),
  });

  globalThis.addEventListener("visibilitychange", () => {
    if (globalThis.document?.visibilityState === "hidden") {
      flush();
      return;
    }
    void syncJobs(started.context);
    void syncNow(started.context);
  });

  const app = globalThis.document.createElement("pna-app");
  if (started.loadWarning) app.setAttribute("warning", started.loadWarning);
  shell = app;

  const service = started.context.deps.account;
  if (!service || service.current()) {
    mount.replaceChildren(app);
    // A session saved by an older build never recorded which keys it uses.
    void service?.learnKeys();
    await loadAccount(started.context, app);
    return;
  }

  // Nobody is signed in: the app opens on the passkey prompt and nothing else.
  const signIn = globalThis.document.createElement("pna-sign-in-screen");
  signIn.addEventListener("signed-in", () => {
    mount.replaceChildren(app);
    void loadAccount(started.context, app);
  });
  mount.replaceChildren(signIn);
};

/**
 * Brings the signed-in account's data up to date and says so on screen.
 *
 * A signed-in app that opens on an empty list is indistinguishable from one
 * that lost everything, so the shell reports the load and any failure of it.
 */
const loadAccount = async (context: AppContext, app: HTMLElement): Promise<void> => {
  if (!context.deps.account?.current()) return;
  app.setAttribute("warning", "Загружаем данные аккаунта…");
  const outcome = await syncNow(context);
  if (outcome === "synced" || outcome === "offline") app.removeAttribute("warning");
  else app.setAttribute("warning", `Данные аккаунта не загрузились: ${outcome}`);
  // A key saved on this phone before signing in has to reach the server, or
  // every job there fails for want of one.
  void shareApiKey(context);
};

/**
 * Sign-in, when the build has somewhere to sign in to.
 *
 * The session lives in the same store as everything else but under its own key,
 * never inside the state document: a token is a credential, and the document is
 * what gets synced.
 */
const authWiring = (kv: ReturnType<typeof platformStore>): AuthWiring | null => {
  const baseUrl = apiBaseUrl();
  if (baseUrl.length === 0) return null;

  const transport = createTransport({ baseUrl });
  return {
    client: createAuthClient({ transport, passkeys: passkeyAgent() }),
    sessions: createSessionStore(kv),
    jobs: createJobsClient(transport),
  };
};

/** Design tokens live on :root so every shadow root can read them. */
/**
 * Tokens go in as a constructed stylesheet, not a <style> element: the packaged
 * app's CSP carries a nonce (added by Tauri at build), which makes the WebView
 * refuse script-created <style> elements, while adopted sheets are not subject
 * to style-src. Lit adopts every component's styles the same way.
 */
const injectTokens = (): void => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(tokensCss);
  globalThis.document.adoptedStyleSheets = [...globalThis.document.adoptedStyleSheets, sheet];
};
