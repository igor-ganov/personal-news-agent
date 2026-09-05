import type { PendingClaim } from "@pna/app";
import type { AuthError, DeviceInvite } from "@pna/auth";
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
    _invite: { state: true },
    _notice: { state: true },
    _linkFor: { state: true },
    _offerCreate: { state: true },
    _syncedAt: { state: true },
  };

  private declare _busy: boolean;
  private declare _error: string;
  private declare _account: Account | null;
  private declare _passkeys: readonly PasskeyRef[];
  private declare _pending: PendingClaim | null;
  private declare _syncedAt: Instant | null;
  private declare _supported: boolean;
  private declare _invite: DeviceInvite | null;
  private declare _notice: string;
  private declare _linkFor: string | null;
  private declare _offerCreate: string | null;

  constructor() {
    super();
    this._busy = false;
    this._error = "";
    this._account = null;
    this._passkeys = [];
    this._pending = null;
    this._syncedAt = null;
    this._supported = true;
    this._invite = null;
    this._notice = "";
    this._linkFor = null;
    this._offerCreate = null;
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

  /**
   * The single door.
   *
   * Everything the user does here is one press; which of the four things it
   * turns into — a sign-in, a fresh account, a request for an address, or an
   * explanation that this device has to be linked — is decided below, not by
   * making them pick a button first.
   */
  private async signIn(email: string, create = false): Promise<void> {
    const service = this.service;
    if (!service) return;

    this._notice = "";
    this._linkFor = null;
    this._offerCreate = null;

    const outcome = await this.run(() =>
      service.continueWith({ email, label: deviceLabel(), create }),
    );
    if (!outcome.ok) return;

    if (outcome.value.kind === "needs-email") {
      this._notice = "Укажите почту — по ней узнаем аккаунт или заведём новый";
      return;
    }

    if (outcome.value.kind === "needs-device-link") {
      this._linkFor = outcome.value.email;
      return;
    }

    if (outcome.value.kind === "offer-create") {
      this._offerCreate = outcome.value.email;
      return;
    }

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

  /**
   * Asks for a one-time link that enrolls another device.
   *
   * The link is not stored anywhere: it is shown, scanned or copied, and dies
   * with the screen — which is what a single-use credential deserves.
   */
  private async invite(): Promise<void> {
    const token = this.service?.current()?.token;
    if (!token) return;

    const service = this.service;
    if (!service) return;

    const created = await this.run(() => service.deviceInvite(token));
    this._invite = created.ok ? created.value : null;
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
            .invite=${this._invite}
            .notice=${this._notice}
            .linkFor=${this._linkFor}
            .offerCreate=${this._offerCreate}
            @account-continue=${(e: CustomEvent<string>) => void this.signIn(e.detail)}
            @account-create=${(e: CustomEvent<string>) => void this.signIn(e.detail, true)}
            @account-sync=${() => void this.sync()}
            @account-sign-out=${() => void this.signOut()}
            @passkey-remove=${(e: CustomEvent<string>) => void this.removePasskey(e.detail)}
            @device-invite=${() => void this.invite()}
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
