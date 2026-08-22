import { err, ok, type Result } from "../fp/result.js";

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|yclid$|ref$|ref_src$|mc_cid$|mc_eid$|igshid$)/i;

const stripWww = (host: string): string => (host.startsWith("www.") ? host.slice(4) : host);

const stripTrailingSlash = (path: string): string =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

/**
 * A stable identity for a source URL, used for de-duplication and — crucially —
 * for keeping a blacklisted source blacklisted no matter which shape of the URL
 * a later discovery run proposes.
 *
 * `https://WWW.Example.com/feed/?utm_source=x#top` → `example.com/feed`
 */
export const normaliseSourceUrl = (raw: string): Result<string, "invalid-url"> => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return err("invalid-url");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return err("invalid-url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return err("invalid-url");
  if (url.hostname.length === 0 || !url.hostname.includes(".")) return err("invalid-url");

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const query = params.length === 0 ? "" : `?${params.map(([k, v]) => `${k}=${v}`).join("&")}`;
  const host = stripWww(url.hostname.toLowerCase());
  const port = url.port === "" ? "" : `:${url.port}`;

  return ok(`${host}${port}${stripTrailingSlash(url.pathname)}${query}`);
};

/** Canonical, user-visible form of the URL — always absolute and https-prefixed when possible. */
export const canonicalSourceUrl = (raw: string): Result<string, "invalid-url"> => {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return err("invalid-url");
    if (!url.hostname.includes(".")) return err("invalid-url");
    url.hash = "";
    return ok(url.toString());
  } catch {
    return err("invalid-url");
  }
};
