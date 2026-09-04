import { Hono } from "hono";
import { cors } from "hono/cors";
import { trimTrailingSlash } from "hono/trailing-slash";
import { pruneExpired } from "./db.js";
import { allowedOrigins, type Env } from "./env.js";
import { pruneJobs } from "./jobs/db.js";
import { runPending } from "./jobs/runner.js";
import { authRoutes } from "./routes/auth.js";
import { jobRoutes } from "./routes/jobs.js";
import { providerRoutes } from "./routes/provider.js";
import { stateRoutes } from "./routes/state.js";

const app = new Hono<{ Bindings: Env }>();

// A stray trailing slash is a typo, not a different resource.
app.use(trimTrailingSlash());

app.use("/auth/*", (c, next) =>
  cors({
    origin: allowedOrigins(c.env),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  })(c, next),
);
app.use("/state/*", (c, next) =>
  cors({
    origin: allowedOrigins(c.env),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "PUT", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  })(c, next),
);

app.use("/jobs/*", (c, next) =>
  cors({
    origin: allowedOrigins(c.env),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  })(c, next),
);
app.use("/provider-key/*", (c, next) =>
  cors({
    origin: allowedOrigins(c.env),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  })(c, next),
);

app.get("/health", (c) => c.json({ ok: true, rpId: c.env.RP_ID }));

/**
 * Digital Asset Links: what lets the Android app use passkeys bound to this
 * domain. The certificate fingerprint here must match the key the APK is
 * actually signed with — sign with a different key and Credential Manager
 * stops recognising the app.
 */
app.get("/.well-known/assetlinks.json", (c) => {
  const fingerprints = (c.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  const packageName = c.env.ANDROID_PACKAGE_NAME ?? "";

  if (fingerprints.length === 0 || packageName.length === 0) return c.json([]);

  return c.json([
    {
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
});

app.route("/auth", authRoutes);
app.route("/state", stateRoutes);
app.route("/jobs", jobRoutes);
app.route("/provider-key", providerRoutes);

app.notFound((c) => c.json({ code: "not_found", message: "Нет такого маршрута" }, 404));

export default {
  fetch: app.fetch,
  /**
   * The sweep does two things.
   *
   * Generation nobody is running — an invocation that died mid-call — is picked
   * up, so work started from a phone that was closed finishes on its own rather
   * than waiting for someone to open the app. Expired challenges, sessions and
   * long-finished jobs are rows, and this is what removes them.
   */
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runPending(env);
    await pruneExpired(env);
    await pruneJobs(env);
  },
};
