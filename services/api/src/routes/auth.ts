import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { Hono } from "hono";
import { fromBase64Url, randomId, toBase64Url, utf8Bytes } from "../crypto.js";
import {
  accountForInvite,
  accountForToken,
  consumeInvite,
  createAccount,
  createInvite,
  createSession,
  credentialsOfAccount,
  deleteCredential,
  findAccountByEmail,
  findCredential,
  hitRateLimit,
  insertCredential,
  putChallenge,
  revokeSession,
  takeChallenge,
  touchCredential,
} from "../db.js";
import { expectedOrigins, type Env } from "../env.js";
import { badRequest, clientIp, fail, readJson, tooManyRequests, unauthorized } from "../http.js";

const normalise = (email: string): string => email.trim().toLowerCase();

const isPlausibleEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email) && email.length <= 254;

const bearer = (header: string | undefined): string | null =>
  header?.startsWith("Bearer ") ? header.slice(7) : null;

export const publicAccount = (row: {
  id: string;
  email: string;
  email_verified: number;
  display_name: string;
  created_at: string;
}) => ({
  id: row.id,
  email: row.email,
  emailVerified: row.email_verified === 1,
  displayName: row.display_name,
  createdAt: row.created_at,
});

export const authRoutes = new Hono<{ Bindings: Env }>();

/* ------------------------------------------------------------- register -- */

authRoutes.post("/register/options", async (c) => {
  const body = await readJson<{ email?: string }>(c);
  const email = normalise(body?.email ?? "");
  if (!isPlausibleEmail(email)) return badRequest(c, "Проверьте адрес почты");

  if (!(await hitRateLimit(c.env, "register", clientIp(c), 20, 3_600_000)))
    return tooManyRequests(c);

  if (await findAccountByEmail(c.env, email))
    return fail(c, 409, "email_taken", "Такой аккаунт уже есть — войдите по ключу");

  // The account id is decided now so the authenticator stores it as the user
  // handle; that is what makes a later passwordless login possible.
  const accountId = randomId();
  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userID: utf8Bytes(accountId),
    userName: email,
    userDisplayName: email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = await putChallenge(c.env, "register", options.challenge, email, accountId);
  return c.json({ challengeId, options });
});

authRoutes.post("/register/verify", async (c) => {
  const body = await readJson<{ challengeId?: string; response?: unknown; label?: string }>(c);
  if (!body?.challengeId || !body.response) return badRequest(c, "Неполный запрос");

  const challenge = await takeChallenge(c.env, body.challengeId);
  if (!challenge || challenge.kind !== "register" || !challenge.email_lower || !challenge.account_id)
    return fail(c, 400, "challenge_expired", "Попытка устарела, начните заново");

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigins(c.env),
      expectedRPID: c.env.RP_ID,
      requireUserVerification: false,
    });
  } catch (error) {
    return fail(c, 400, "verification_failed", (error as Error).message);
  }

  if (!verification.verified || !verification.registrationInfo)
    return fail(c, 400, "verification_failed", "Ключ не подтверждён");

  // The window between the check above and this insert is closed by the unique
  // index on email_lower: a duplicate registration fails here rather than
  // creating a second account for one address.
  if (await findAccountByEmail(c.env, challenge.email_lower))
    return fail(c, 409, "email_taken", "Такой аккаунт уже есть — войдите по ключу");

  const account = await createAccount(c.env, challenge.email_lower);
  const credential = verification.registrationInfo.credential;

  await insertCredential(c.env, {
    id: credential.id,
    account_id: account.id,
    public_key: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: (credential.transports ?? []).join(","),
    label: (body.label ?? "").slice(0, 60),
  });

  const session = await createSession(c.env, account.id);
  return c.json({ token: session.token, expiresAt: session.expiresAt, account: publicAccount(account) });
});

/* ---------------------------------------------------------------- login -- */

authRoutes.post("/login/options", async (c) => {
  const body = await readJson<{ email?: string }>(c);
  const email = body?.email ? normalise(body.email) : null;

  if (!(await hitRateLimit(c.env, "login", clientIp(c), 60, 3_600_000))) return tooManyRequests(c);

  const account = email ? await findAccountByEmail(c.env, email) : null;
  const credentials = account ? await credentialsOfAccount(c.env, account.id) : [];

  // When an address was given but is unknown, options are still returned with
  // an empty allow-list: the response looks the same either way, so this
  // endpoint does not answer "does this account exist?".
  const options = await generateAuthenticationOptions({
    rpID: c.env.RP_ID,
    userVerification: "preferred",
    ...(email
      ? {
          allowCredentials: credentials.map((cred) => ({
            id: cred.id,
            ...(cred.transports ? { transports: cred.transports.split(",") as never } : {}),
          })),
        }
      : {}),
  });

  const challengeId = await putChallenge(
    c.env,
    "login",
    options.challenge,
    email,
    account?.id ?? null,
  );
  return c.json({ challengeId, options });
});

authRoutes.post("/login/verify", async (c) => {
  const body = await readJson<{ challengeId?: string; response?: { id?: string } }>(c);
  if (!body?.challengeId || !body.response?.id) return badRequest(c, "Неполный запрос");

  const challenge = await takeChallenge(c.env, body.challengeId);
  if (!challenge || challenge.kind !== "login")
    return fail(c, 400, "challenge_expired", "Попытка устарела, начните заново");

  const credential = await findCredential(c.env, body.response.id);
  if (!credential) return fail(c, 401, "unknown_credential", "Этот ключ не привязан к аккаунту");

  // An allow-list was sent, so the response must come from that same account.
  if (challenge.account_id && challenge.account_id !== credential.account_id)
    return fail(c, 401, "unknown_credential", "Этот ключ не привязан к аккаунту");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigins(c.env),
      expectedRPID: c.env.RP_ID,
      requireUserVerification: false,
      credential: {
        id: credential.id,
        publicKey: fromBase64Url(credential.public_key),
        counter: credential.counter,
        ...(credential.transports ? { transports: credential.transports.split(",") as never } : {}),
      },
    });
  } catch (error) {
    return fail(c, 401, "verification_failed", (error as Error).message);
  }

  if (!verification.verified) return fail(c, 401, "verification_failed", "Ключ не подтверждён");

  await touchCredential(c.env, credential.id, verification.authenticationInfo.newCounter);

  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?")
    .bind(credential.account_id)
    .first<Parameters<typeof publicAccount>[0]>();
  if (!account) return unauthorized(c);

  const session = await createSession(c.env, account.id);
  return c.json({ token: session.token, expiresAt: session.expiresAt, account: publicAccount(account) });
});

/* -------------------------------------------------------------- session -- */

authRoutes.get("/me", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) return unauthorized(c);
  const account = await accountForToken(c.env, token);
  if (!account) return unauthorized(c);

  const credentials = await credentialsOfAccount(c.env, account.id);
  return c.json({
    account: publicAccount(account),
    passkeys: credentials.map((cred) => ({
      credentialId: cred.id,
      label: cred.label,
      createdAt: cred.created_at,
      lastUsedAt: cred.last_used_at,
    })),
  });
});

authRoutes.post("/logout", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  if (token) await revokeSession(c.env, token);
  return c.json({ ok: true });
});

authRoutes.delete("/passkeys/:id", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) return unauthorized(c);
  const account = await accountForToken(c.env, token);
  if (!account) return unauthorized(c);

  const remaining = await credentialsOfAccount(c.env, account.id);
  // Removing the last key would lock the account out entirely, and there is no
  // password to fall back on.
  if (remaining.length <= 1)
    return fail(c, 409, "last_passkey", "Это единственный ключ — сначала добавьте другой");

  await deleteCredential(c.env, account.id, c.req.param("id"));
  return c.json({ ok: true });
});

/* ------------------------------------------------------- adding a device -- */

/**
 * Mints a one-time link that enrolls another device into this account.
 *
 * The account is already proven by the bearer token, so the link is the only
 * thing the new device needs — and therefore the only thing worth stealing.
 * It lives ten minutes, works once, and is stored as a hash.
 */
authRoutes.post("/invite", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) return unauthorized(c);
  const account = await accountForToken(c.env, token);
  if (!account) return unauthorized(c);

  if (!(await hitRateLimit(c.env, "invite", account.id, 20, 3_600_000)))
    return tooManyRequests(c);

  const invite = await createInvite(c.env, account.id);
  const origin = new URL(c.req.url).origin;
  return c.json({
    url: `${origin}/enroll#t=${invite.token}`,
    expiresAt: invite.expiresAt,
  });
});

/**
 * Registration options for a device holding an invite.
 *
 * The invite is checked but not spent: a page that is opened and abandoned must
 * leave the link usable. Existing keys go into `excludeCredentials` so the same
 * authenticator cannot be enrolled twice.
 */
authRoutes.post("/invite/options", async (c) => {
  const body = await readJson<{ token?: string }>(c);
  if (!body?.token) return badRequest(c, "Неполный запрос");

  if (!(await hitRateLimit(c.env, "enroll", clientIp(c), 30, 3_600_000)))
    return tooManyRequests(c);

  const account = await accountForInvite(c.env, body.token);
  if (!account) return fail(c, 400, "invite_invalid", "Ссылка недействительна или уже использована");

  const existing = await credentialsOfAccount(c.env, account.id);
  const options = await generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID: c.env.RP_ID,
    userID: utf8Bytes(account.id),
    userName: account.email,
    userDisplayName: account.display_name || account.email,
    attestationType: "none",
    excludeCredentials: existing.map((cred) => ({ id: cred.id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = await putChallenge(
    c.env,
    "register",
    options.challenge,
    account.email_lower,
    account.id,
  );
  return c.json({ challengeId, options });
});

/**
 * Finishes enrollment: the key joins the account and the invite is spent.
 *
 * Order matters — the invite is consumed only after the ceremony verifies, and
 * consuming it is what decides the race if the same link is opened twice.
 */
authRoutes.post("/invite/verify", async (c) => {
  const body = await readJson<{
    token?: string;
    challengeId?: string;
    response?: unknown;
    label?: string;
  }>(c);
  if (!body?.token || !body.challengeId || !body.response) return badRequest(c, "Неполный запрос");

  const challenge = await takeChallenge(c.env, body.challengeId);
  if (!challenge || challenge.kind !== "register" || !challenge.account_id)
    return fail(c, 400, "challenge_expired", "Попытка устарела, начните заново");

  const account = await accountForInvite(c.env, body.token);
  if (!account || account.id !== challenge.account_id)
    return fail(c, 400, "invite_invalid", "Ссылка недействительна или уже использована");

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: expectedOrigins(c.env),
      expectedRPID: c.env.RP_ID,
      requireUserVerification: false,
    });
  } catch (error) {
    return fail(c, 400, "verification_failed", (error as Error).message);
  }

  if (!verification.verified || !verification.registrationInfo)
    return fail(c, 400, "verification_failed", "Ключ не подтверждён");

  const spent = await consumeInvite(c.env, body.token);
  if (spent !== account.id)
    return fail(c, 400, "invite_invalid", "Ссылка недействительна или уже использована");

  const credential = verification.registrationInfo.credential;
  await insertCredential(c.env, {
    id: credential.id,
    account_id: account.id,
    public_key: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: (credential.transports ?? []).join(","),
    label: (body.label ?? "").slice(0, 60),
  });

  const session = await createSession(c.env, account.id);
  return c.json({
    verified: true,
    token: session.token,
    expiresAt: session.expiresAt,
    account: publicAccount(account),
  });
});
