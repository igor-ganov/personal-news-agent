import { parseRoute, type Route } from "@pna/ui";

/**
 * Hash routing.
 *
 * The app is one static page loaded from disk in a WebView, so the hash is the
 * only navigation mechanism that works without a server — and it makes the
 * Android back button behave, because each navigation is a history entry.
 */
export const currentRoute = (): Route => parseRoute(globalThis.location?.hash ?? "");

export const navigate = (href: string): void => {
  globalThis.location.hash = href.replace(/^#/, "");
};

export const goBack = (): void => {
  if (globalThis.history.length > 1) globalThis.history.back();
  else navigate("#/");
};

export const onRouteChange = (listener: (route: Route) => void): (() => void) => {
  const handler = (): void => listener(currentRoute());
  globalThis.addEventListener("hashchange", handler);
  return () => globalThis.removeEventListener("hashchange", handler);
};
