/**
 * Starts the Worker for an end-to-end run on a database that has never been
 * used: every run begins right after the fresh-start migration, which is
 * exactly the state a phone meets after the reset.
 */
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const api = fileURLToPath(new URL("../../services/api/", import.meta.url));
const state = fileURLToPath(new URL("../.state/", import.meta.url));
const port = process.env.E2E_API_PORT ?? "18787";
const appOrigin = process.env.E2E_APP_ORIGIN ?? "http://localhost:4321";

rmSync(state, { recursive: true, force: true });

const wrangler = (args, options) =>
  (options?.wait ? spawnSync : spawn)("pnpm", ["exec", "wrangler", ...args], {
    cwd: api,
    stdio: "inherit",
    shell: true,
  });

const migrated = wrangler(["d1", "migrations", "apply", "pna", "--local", "--persist-to", state], { wait: true });
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

// The fresh start hands its prepared profile to the first account only. Specs
// run side by side, so every spec that signs in gets a copy of its own.
const SPECS_THAT_SIGN_IN = 3;
const copies = Array.from(
  { length: SPECS_THAT_SIGN_IN - 1 },
  (_, n) => `INSERT INTO account_seeds (id, body, created_at) SELECT id || '-copy-${n}', body, created_at FROM account_seeds WHERE id NOT LIKE '%-copy-%';`,
).join(" ");
const seeded = wrangler(["d1", "execute", "pna", "--local", "--persist-to", state, "--command", JSON.stringify(copies)], { wait: true });
if (seeded.status !== 0) process.exit(seeded.status ?? 1);

const server = wrangler([
  "dev", "--local", "--port", port, "--persist-to", state,
  "--var", "RP_ID:localhost",
  "--var", `ALLOWED_ORIGINS:${appOrigin}`,
  "--var", "PROVIDER_KEY_SECRET:e2e-secret",
  // Generation runs offline, and the cron that runs it fires when a spec asks.
  "--var", "GENERATOR:mock",
  "--var", "JOBS_PER_TICK:100",
  "--test-scheduled",
]);
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
