import type { PendingClaim } from "@pna/app";
import type { AuthError } from "@pna/auth";
import type { Account, ClaimStrategy, Instant, PasskeyRef, Result } from "@pna/core";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { goBack } from "../router.js";
import "@pna/ui";

/**
 * The account screen.
 *
 * Everything here is one request away from the network, so the screen owns the
 * in-flight flag and the last error rather than the components: they stay
 * presentational, and the flow — sign in, maybe answer the merge question,
 * then sync — reads top to bottom in one place.
 */
export class PnaAccountScreen extends ConnectedElement {
  static override properties = {
    _busy: { state: true },
    _error: { state: true },
    _account: { state: true },
    _passkeys: { state: true },
    _pending: { state: true },
    _syncedAt: { state: true },
  };

  private declare _busy: boolean;
  private declare _error: string;
  private declare _account: Account | null;
  private declare _passkeys: readonly PasskeyRef[];
  private declare _pending: PendingClaim | null;
  private declare _syncedAt: Instant | null;
  private declare _supported: boolean;

  constructor() {
    super();
    this._busy = false;
    this._error = "";
    this._account = null;
    this._passkeys = [];
    this._pending = null;
    this._syncedAt = null;
    this._supported = true;
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .claim {
      margin-bottom: var(--pna-gap-lg);
    }

    .note {
      margin-top: var(--pna-gap-lg);
      font-size: 0.85rem;
      color: var(--pna-text-dim);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
  }

  private get service() {
    return this.ctx.deps.account;
  }

  private async refresh(): Promise<void> {
    const service = this.service;
    if (!service) return;

    this._supported = await service.isPasskeySupported();
    const session = service.current();
    this._account = session?.account ?? null;
    if (session) await this.loadPasskeys(session.token);
  }

  private async loadPasskeys(token: string): Promise<void> {
    const details = await this.service?.details(token);
    if (details?.ok) this._passkeys = details.value.passkeys;
  }

  /** One place where every network call reports itself. */
  private async run<T>(action: () => Promise<Result<T, AuthError>>): Promise<Result<T, AuthError>> {
    this._busy = true;
    this._error = "";
    try {
      const result = await action();
      if (!result.ok) this._error = result.error.message;
      return result;
    } finally {
      this._busy = false;
    }
  }

  private async signIn(email: string, register: boolean): Promise<void> {
    const service = this.service;
    if (!service) return;

    const outcome = await this.run(() =>
      register ? service.register({ email, label: deviceLabel() }) : service.signIn({ email }),
    );
    if (!outcome.ok) return;

    if (outcome.value.kind === "needs-choice") {
      this._pending = outcome.value.pending;
      return;
    }

    this._pending = null;
    this._account = outcome.value.session.account;
    await this.loadPasskeys(outcome.value.session.token);
  }

  private async resolve(strategy: ClaimStrategy): Promise<void> {
    const pending = this._pending;
    const service = this.service;
    if (!pending || !service) return;

    const session = await this.run(() => service.resolveClaim(pending, strategy));
    if (!session.ok) return;

    this._pending = null;
    this._account = session.value.account;
    await this.loadPasskeys(session.value.token);
  }

  private async sync(): Promise<void> {
    const service = this.service;
    if (!service) return;
    const outcome = await this.run(() => service.sync());
    if (outcome.ok && outcome.value.kind === "synced") this._syncedAt = this.ctx.deps.clock.now();
  }

  private async signOut(): Promise<void> {
    this._busy = true;
    await this.service?.signOut();
    this._account = null;
    this._passkeys = [];
    this._syncedAt = null;
    this._busy = false;
  }

  private async removePasskey(credentialId: string): Promise<void> {
    const service = this.service;
    const token = service?.current()?.token;
    if (!service || !token) return;

    const removed = await this.run(() => service.removePasskey(token, credentialId));
    if (removed.ok) await this.loadPasskeys(token);
  }

  override render() {
    if (!this.service)
      return html`
        <div class="screen">
          <pna-app-bar heading="Аккаунт" canGoBack @go-back=${() => goBack()}></pna-app-bar>
          <main>
            <ui-notice
              tone="info"
              message="Эта сборка работает без сервера — данные остаются на устройстве."
            ></ui-notice>
          </main>
        </div>
      `;

    return html`
      <div class="screen">
        <pna-app-bar heading="Аккаунт" canGoBack @go-back=${() => goBack()}></pna-app-bar>

        <main>
          ${this._pending
            ? html`<div class="claim">
                <pna-claim-choice
                  .summary=${this._pending.summary}
                  ?busy=${this._busy}
                  @claim-choose=${(e: CustomEvent<ClaimStrategy>) => void this.resolve(e.detail)}
                ></pna-claim-choice>
              </div>`
            : null}

          <pna-account-view
            .account=${this._account}
            .passkeys=${this._passkeys}
            ?supported=${this._supported}
            ?busy=${this._busy}
            .error=${this._error}
            .syncedAt=${this._syncedAt}
            @account-register=${(e: CustomEvent<string>) => void this.signIn(e.detail, true)}
            @account-sign-in=${(e: CustomEvent<string>) => void this.signIn(e.detail, false)}
            @account-sync=${() => void this.sync()}
            @account-sign-out=${() => void this.signOut()}
            @passkey-remove=${(e: CustomEvent<string>) => void this.removePasskey(e.detail)}
          ></pna-account-view>

          <p class="note">
            На сервер уходит только документ с вашими темами и материалами. Ключ доступа
            остаётся на устройстве: сервер хранит его открытую часть, которой нельзя
            подписаться за вас.
          </p>
        </main>
      </div>
    `;
  }
}

/** Something recognisable in the list of keys — the browser, or the phone. */
const deviceLabel = (): string => {
  const ua = globalThis.navigator?.userAgent ?? "";
  if (/Android/i.test(ua)) return "Телефон Android";
  if (/iPhone|iPad/i.test(ua)) return "Устройство Apple";
  return "Этот браузер";
};

customElements.define("pna-account-screen", PnaAccountScreen);
