import { Hono } from "hono";
import { toBase64Url } from "../crypto.js";
import type { Env } from "../env.js";

/**
 * The page a new device opens.
 *
 * It is served from the same domain the passkeys are bound to, which is the
 * whole trick: a key created here belongs to that domain, so the Android app —
 * verified against the same domain through `assetlinks.json` — can use it. No
 * typing, no copying keys between devices.
 *
 * The invite travels in the URL fragment, so it never reaches this server's
 * logs: the page reads it from `location.hash` and sends it in a request body.
 */
const SCRIPT = `
const dec = (s) => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), (c) => c.charCodeAt(0));
const enc = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const $ = (id) => document.getElementById(id);
const say = (text, tone) => { const el = $('status'); el.textContent = text; el.className = tone || ''; };
const post = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
};

const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
if (!token) {
  say('Ссылка неполная — откройте её целиком, вместе с частью после решётки.', 'bad');
  $('go').disabled = true;
}

const enroll = async () => {
  $('go').disabled = true;
  say('Ждём подтверждения на устройстве…');

  const started = await post('/auth/invite/options', { token });
  if (!started.ok) {
    // Ссылка могла и не подойти, а могла просто не долететь — вторая попытка
    // ничего не стоит, поэтому кнопка возвращается в строй.
    say(started.data.message || 'Ссылка не подошла', 'bad');
    $('go').disabled = false;
    return;
  }

  const options = started.data.options;
  options.challenge = dec(options.challenge);
  options.user.id = dec(options.user.id);
  (options.excludeCredentials || []).forEach((c) => { c.id = dec(c.id); });

  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey: options });
  } catch (error) {
    say('Не получилось создать ключ: ' + (error && error.message ? error.message : error), 'bad');
    $('go').disabled = false;
    return;
  }

  const response = {
    id: credential.id,
    rawId: enc(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: enc(credential.response.clientDataJSON),
      attestationObject: enc(credential.response.attestationObject),
      transports: credential.response.getTransports ? credential.response.getTransports() : [],
    },
  };

  const done = await post('/auth/invite/verify', {
    token,
    challengeId: started.data.challengeId,
    response,
    label: $('label').value,
  });

  if (!done.ok) {
    say(done.data.message || 'Не удалось привязать ключ', 'bad');
    $('go').disabled = false;
    return;
  }

  history.replaceState(null, '', location.pathname);
  say('Готово. Откройте приложение на этом устройстве и войдите — ключ уже здесь.', 'good');
};

$('go').addEventListener('click', () => { enroll(); });
`;

const STYLE = `
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, sans-serif; max-width: 34rem; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p { margin: 0 0 12px; }
  .dim { opacity: 0.7; font-size: 0.9rem; }
  label { display: block; margin-bottom: 16px; }
  input { width: 100%; box-sizing: border-box; padding: 10px; font: inherit;
    border: 1px solid rgba(128,128,128,0.5); border-radius: 8px; background: transparent; color: inherit; }
  button { min-height: 48px; padding: 0 20px; font: inherit; border: 0; border-radius: 8px;
    background: #2f6feb; color: #fff; }
  button[disabled] { opacity: 0.5; }
  .bad { color: #d33; }
  .good { color: #197f3d; }
`;

export const enrollRoutes = new Hono<{ Bindings: Env }>();

enrollRoutes.get("/", (c) => {
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Новое устройство — ${c.env.RP_NAME}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<h1>Добавить это устройство</h1>
<p>Создайте здесь ключ доступа — он попадёт в ваш аккаунт, и приложение на этом
устройстве сможет войти без пароля и без переноса данных руками.</p>
<label>Название устройства<br><input id="label" value="Телефон" maxlength="60"></label>
<p><button id="go" type="button">Создать ключ</button></p>
<p id="status" class="dim"></p>
<p class="dim">Ссылка работает один раз и живёт десять минут.</p>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;

  return c.html(html, 200, {
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'`,
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
});
