/**
 * The fresh-start migration against a running API, on a database that has
 * just been migrated: the first account takes the prepared profile, nobody
 * else does, and the passkey's user handle is the account's own id.
 *
 *   PNA_API_URL=http://127.0.0.1:8787 PNA_API_ORIGIN=http://localhost:8787 \
 *   PNA_LIVE_SEED=1 pnpm vitest run --project api seed
 *
 * Gated separately from the other live tests: it only holds on a database
 * where nobody has registered since migration 0005.
 */

import { createAuthClient, createTransport, type PasskeyAgent } from "@pna/auth";
import { virtualPasskeyAgent } from "@pna/auth/testing";
import { beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.PNA_API_URL?.replace(/\/$/, "");
const ENABLED = Boolean(BASE) && process.env.PNA_LIVE_SEED === "1";

const decodeHandle = (encoded: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** Wraps an agent so the test can read the user handle it was asked to store. */
const recording = (agent: PasskeyAgent) => {
  const handles: string[] = [];
  const wrapped: PasskeyAgent = {
    isAvailable: () => agent.isAvailable(),
    async create(options) {
      handles.push(decodeHandle(options.user.id));
      return agent.create(options);
    },
    get: (options, hints) => agent.get(options, hints),
  };
  return { agent: wrapped, handles: () => handles };
};

const topicTitles = (body: unknown): string[] => {
  const topics = (body as { topics?: Record<string, { title: string }> } | null)?.topics ?? {};
  return Object.values(topics).map((topic) => topic.title).sort();
};

describe.skipIf(!ENABLED)("fresh-start profile", () => {
  const transport = createTransport({ baseUrl: BASE ?? "" });
  let client: ReturnType<typeof createAuthClient>;
  let recorder: ReturnType<typeof recording>;

  beforeAll(async () => {
    const health = await (await fetch(`${BASE}/health`)).json();
    recorder = recording(
      virtualPasskeyAgent({ rpId: health.rpId, origin: process.env.PNA_API_ORIGIN ?? `https://${health.rpId}` }),
    );
    client = createAuthClient({ transport, passkeys: recorder.agent });
  });

  it("the first account after the reset opens on the prepared topics", async () => {
    const session = await client.register({ email: "" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const pulled = await client.pull(session.value.token);
    expect(pulled.ok).toBe(true);
    if (!pulled.ok) return;

    expect(topicTitles(pulled.value.body)).toEqual([
      "AI-агенты и LLM",
      "Frontend-платформа",
      "Архитектура и ФП",
      "Безопасность и вход",
      "Облако и DevOps",
      "Продвижение проектов",
    ]);
  });

  it("the passkey's user handle is the account's id", async () => {
    const session = await client.register({ email: "" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    expect(recorder.handles().at(-1)).toBe(session.value.account.id);
  });

  it("the profile is handed out once — the next account starts empty", async () => {
    const session = await client.register({ email: "" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const pulled = await client.pull(session.value.token);
    expect(pulled.ok && pulled.value.body).toBeNull();
  });
});
