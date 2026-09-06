import { Hono } from "hono";
import { cors } from "hono/cors";
import { trimTrailingSlash } from "hono/trailing-slash";
import { pruneExpired } from "./db.js";
import { allowedOrigins, type Env } from "./env.js";
import { failStuckJobs, pruneJobs } from "./jobs/db.js";
import { runPending } from "./jobs/runner.js";
import { authRoutes } from "./routes/auth.js";
import { enrollRoutes } from "./routes/enroll.js";
import { jobRoutes } from "./routes/jobs.js";
import { providerRoutes } from "./routes/provider.js";
import { stateRoutes } from "./routes/state.js";

/** The daily housekeeping schedule, as written in wrangler.toml. */
const DAILY_SWEEP = "0 3 * * *";

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
app.route("/enroll", enrollRoutes);
app.route("/state", stateRoutes);
app.route("/jobs", jobRoutes);
app.route("/provider-key", providerRoutes);

app.notFound((c) => c.json({ code: "not_found", message: "Нет такого маршрута" }, 404));

export default {
  fetch: app.fetch,
  /**
   * Where generation actually runs.
   *
   * Every minute: pick up queued work and finish it, and turn runs that died
   * mid-flight into a failure the app can show instead of a spinner that never
   * stops. Once a day the same handler also sweeps expired rows — that part is
   * cheap but pointless to repeat sixty times an hour.
   */
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await runPending(env);
    await failStuckJobs(env);

    if (event.cron === DAILY_SWEEP) {
      await pruneExpired(env);
      await pruneJobs(env);
    }
  },
};
