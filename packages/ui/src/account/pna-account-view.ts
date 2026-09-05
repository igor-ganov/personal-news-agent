import type { Account, Instant, PasskeyRef } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatDate, formatDateTime } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";
import "../components/ui-qr.js";

/**
 * The account screen: sign in, see which keys can open this account, sign out.
 *
 * It states plainly that there is no password, because a passwordless flow only
 * feels safe once the user understands what is standing in for the password.
 */
export class PnaAccountView extends LitElement {
  static override properties = {
    account: { type: Object },
    passkeys: { type: Array },
    supported: { type: Boolean },
    busy: { type: Boolean },
    error: { type: String },
    syncedAt: { type: String },
    invite: { type: Object },
    notice: { type: String },
    linkFor: { type: String },
    offerCreate: { type: String },
    _email: { state: true },
    _copied: { state: true },
    _showEmail: { state: true },
    _newEmail: { state: true },
  };

  declare account: Account | null;
  declare passkeys: readonly PasskeyRef[];
  declare supported: boolean;
  declare busy: boolean;
  declare error: string;
  declare syncedAt: string | null;
  /** A live link that adds another device, once one has been asked for. */
  declare invite: { readonly url: string; readonly expiresAt: Instant } | null;
  /** A sentence the last attempt earned — «введите почту», and the like. */
  declare notice: string;
  /** Set when the account exists but this device holds no key for it. */
  declare linkFor: string | null;
  /** Set when the key prompt was dismissed and an account could be made instead. */
  declare offerCreate: string | null;
  private declare _email: string;
  private declare _copied: boolean;
  private declare _showEmail: boolean;
  private declare _newEmail: string;

  constructor() {
    super();
    this.account = null;
    this.passkeys = [];
    this.supported = true;
    this.busy = false;
    this.error = "";
    this.syncedAt = null;
    this.invite = null;
    this.notice = "";
    this.linkFor = null;
    this.offerCreate = null;
    this._email = "";
    this._copied = false;
    this._showEmail = false;
    this._newEmail = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      section {
        margin-bottom: var(--pna-gap-lg);
      }

      .link {
        overflow-wrap: anywhere;
        font-size: 0.8rem;
        color: var(--pna-text-dim);
        margin: var(--pna-gap-sm) 0;
      }

      h3 {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pna-text-dim);
      }

      .hint {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .actions {
        display: flex;
        gap: var(--pna-gap-sm);
        margin-top: var(--pna-gap-sm);
        flex-wrap: wrap;
      }

      .key {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--pna-gap-sm);
        padding: var(--pna-gap-sm) 0;
        border-bottom: 1px solid var(--pna-border);
        min-height: var(--pna-tap);
      }

      .key:last-child {
        border-bottom: none;
      }

      .key-name {
        font-weight: 600;
      }

      .email {
        font-family: var(--pna-mono);
      }

      ul.hint {
        margin: 0 0 var(--pna-gap-sm);
        padding-left: 1.1rem;
      }

      ul.hint li {
        margin-bottom: 4px;
      }
    `,
  ];

  private renderSignedOut() {
    return html`
      <div class="signed-out">
        <section>
          <h3>Вход без пароля</h3>
          <p class="hint">
            Пароля здесь нет, и почта не нужна: аккаунт — это ключ доступа. Он остаётся на
            устройстве и подтверждается так же, как разблокировка экрана. Одна кнопка на всё:
            есть ключ — вход, нет — заводим аккаунт.
          </p>
          ${this.supported
            ? null
            : html`<ui-notice
                tone="error"
                message="На этом устройстве ключи доступа недоступны — войти не получится"
              ></ui-notice>`}
          <div class="actions">
            <ui-button
              variant="primary"
              ?disabled=${this.busy || !this.supported}
              @click=${() => emit<string>(this, "account-continue", this._email.trim())}
              >Продолжить</ui-button
            >
          </div>

          ${this._showEmail
            ? html`<ui-field
                label="Почта (необязательно)"
                input-type="email"
                placeholder="you@example.com"
                .value=${this._email}
                @field-input=${(e: CustomEvent<string>) => (this._email = e.detail)}
              ></ui-field>`
            : html`<ui-button
                variant="ghost"
                ?disabled=${this.busy || !this.supported}
                @click=${() => {
                  this._showEmail = true;
                }}
                >Указать почту</ui-button
              >`}
          <p class="hint">
            Почта ничего не открывает и не подтверждает — по ней просто удобнее найти аккаунт
            на другом устройстве. Её можно добавить когда угодно потом.
          </p>
          ${this.notice ? html`<ui-notice tone="info" message=${this.notice}></ui-notice>` : null}
          ${this.offerCreate ? this.renderOffer(this.offerCreate) : null}
          ${this.linkFor ? this.renderDeviceLink(this.linkFor) : null}
          ${this.error ? html`<ui-notice tone="error" message=${this.error}></ui-notice>` : null}
        </section>
      </div>
    `;
  }

  /**
   * Asking instead of guessing after a dismissed prompt: the address is right
   * there, so one tap either creates the account or lets it be.
   */
  private renderOffer(email: string) {
    return html`
      <ui-notice
        tone="info"
        message="Ключ не подошёл или окно закрыли. Если аккаунта ещё нет — заведём."
      ></ui-notice>
      <div class="actions">
        <ui-button
          variant="primary"
          ?disabled=${this.busy}
          @click=${() => emit<string>(this, "account-create", email)}
          >Завести аккаунт на ${email}</ui-button
        >
      </div>
    `;
  }

  /**
   * The one case a single button cannot resolve on its own: the address belongs
   * to an account, and this device has no key for it. Both ways out need the
   * device that does have one, so both are spelled out rather than hinted at.
   */
  private renderDeviceLink(email: string) {
    return html`
      <ui-notice
        tone="info"
        message=${`Аккаунт ${email} уже есть, но ключа от него на этом устройстве нет.`}
      ></ui-notice>
      <p class="hint">
        Подключить это устройство можно двумя способами:
      </p>
      <ul class="hint">
        <li>
          на устройстве, где вход уже работает, откройте «Аккаунт» → «Добавить устройство»
          и отсканируйте отсюда QR-код;
        </li>
        <li>
          либо нажмите «Продолжить» ещё раз и выберите в системном окне «Ключ с другого
          устройства» — телефон с ключом подтвердит вход по QR-коду.
        </li>
      </ul>
    `;
  }

  private renderKeys() {
    if (this.passkeys.length === 0)
      return html`<ui-notice tone="empty" message="Ключей пока нет"></ui-notice>`;

    return html`
      <div class="keys">
        ${this.passkeys.map(
          (key) => html`
            <div class="key">
              <span>
                <span class="key-name">${key.label || "Без названия"}</span>
                <span class="hint">
                  ${key.lastUsedAt
                    ? `последний вход ${formatDateTime(key.lastUsedAt)}`
                    : `добавлен ${formatDate(key.createdAt)}`}
                </span>
              </span>
              <ui-button
                variant="danger"
                ?disabled=${this.busy || this.passkeys.length <= 1}
                @click=${() => emit<string>(this, "passkey-remove", key.credentialId)}
                >Убрать</ui-button
              >
            </div>
          `,
        )}
      </div>
    `;
  }

  /**
   * Adding a device: a link, and the same link as a QR code.
   *
   * The other device opens it, creates its own passkey, and from then on signs
   * into the same account. The link works once, so it is shown in full: it has
   * to be either scanned or sent to yourself.
   */
  private renderInvite() {
    return html`
      <section>
        <h3>Другое устройство</h3>
        ${this.invite
          ? html`
              <ui-qr .value=${this.invite.url} label="Ссылка для нового устройства"></ui-qr>
              <p class="link">${this.invite.url}</p>
              <div class="actions">
                <ui-button
                  @click=${() => {
                    void navigator.clipboard?.writeText(this.invite?.url ?? "");
                    this._copied = true;
                  }}
                  >${this._copied ? "Скопировано" : "Скопировать ссылку"}</ui-button
                >
                <ui-button variant="ghost" ?disabled=${this.busy} @click=${() =>
                  emit(this, "device-invite", null)}
                  >Другая ссылка</ui-button
                >
              </div>
              <p class="hint">
                Ссылка работает один раз и живёт десять минут — до
                ${formatDateTime(this.invite.expiresAt)}.
              </p>
            `
          : html`
              <p class="hint">
                Откройте ссылку на втором устройстве и создайте там ключ доступа — темы,
                программы и настройки приедут из аккаунта сами.
              </p>
              <ui-button ?disabled=${this.busy} @click=${() => emit(this, "device-invite", null)}
                >Добавить устройство</ui-button
              >
            `}
      </section>
    `;
  }

  private renderSignedIn(account: Account) {
    return html`
      <div class="signed-in">
        <section>
          <h3>Аккаунт</h3>
          ${account.email
            ? html`<p class="email">${account.email}</p>
                <p class="hint">Адрес — метка аккаунта; вход всё равно даёт ключ</p>`
            : html`<div class="email-block">${this._showEmail
                  ? html`<ui-field
                        label="Почта (необязательно)"
                        input-type="email"
                        placeholder="you@example.com"
                        .value=${this._newEmail}
                        @field-input=${(e: CustomEvent<string>) => (this._newEmail = e.detail)}
                      ></ui-field>
                      <ui-button
                        ?disabled=${this.busy || this._newEmail.trim().length === 0}
                        @click=${() =>
                          emit<string>(this, "account-email", this._newEmail.trim())}
                        >Сохранить почту</ui-button
                      >`
                  : html`<p class="hint">
                        Почты у аккаунта нет — и не нужно. Добавьте, если хотите узнавать его
                        по адресу на другом устройстве.
                      </p>
                      <ui-button
                        variant="ghost"
                        @click=${() => {
                          this._showEmail = true;
                        }}
                        >Добавить почту</ui-button
                      >`}</div>`}
          <div class="actions">
            <ui-button ?disabled=${this.busy} @click=${() => emit(this, "account-sync", null)}
              >Синхронизировать</ui-button
            >
            <ui-button variant="danger" ?disabled=${this.busy} @click=${() => emit(this, "account-sign-out", null)}
              >Выйти</ui-button
            >
          </div>
          ${this.syncedAt
            ? html`<p class="hint">Последняя синхронизация: ${formatDateTime(this.syncedAt)}</p>`
            : null}
          ${this.error ? html`<ui-notice tone="error" message=${this.error}></ui-notice>` : null}
        </section>

        <section>
          <h3>Ключи доступа</h3>
          ${this.renderKeys()}
          <p class="hint">
            Последний ключ убрать нельзя: без него в аккаунт будет не войти.
          </p>
        </section>

        ${this.renderInvite()}
      </div>
    `;
  }

  override render() {
    return this.account ? this.renderSignedIn(this.account) : this.renderSignedOut();
  }
}

customElements.define("pna-account-view", PnaAccountView);

declare global {
  interface HTMLElementTagNameMap {
    "pna-account-view": PnaAccountView;
  }
}
