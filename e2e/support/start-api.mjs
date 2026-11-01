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

const server = wrangler([
  "dev", "--local", "--port", port, "--persist-to", state,
  "--var", "RP_ID:localhost",
  "--var", `ALLOWED_ORIGINS:${appOrigin}`,
  "--var", "PROVIDER_KEY_SECRET:e2e-secret",
]);
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
