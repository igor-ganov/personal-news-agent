import type { Account, PasskeyRef } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatDate, formatDateTime } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";

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
    _email: { state: true },
  };

  declare account: Account | null;
  declare passkeys: readonly PasskeyRef[];
  declare supported: boolean;
  declare busy: boolean;
  declare error: string;
  declare syncedAt: string | null;
  private declare _email: string;

  constructor() {
    super();
    this.account = null;
    this.passkeys = [];
    this.supported = true;
    this.busy = false;
    this.error = "";
    this.syncedAt = null;
    this._email = "";
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
    `,
  ];

  private renderSignedOut() {
    return html`
      <div class="signed-out">
        <section>
          <h3>Вход без пароля</h3>
          <p class="hint">
            Пароля здесь нет. Вместо него — ключ доступа: он остаётся на устройстве и
            подтверждается тем же способом, что и разблокировка экрана. Почта нужна только
            чтобы узнать аккаунт на другом устройстве.
          </p>
          ${this.supported
            ? null
            : html`<ui-notice
                tone="error"
                message="На этом устройстве ключи доступа недоступны — войти не получится"
              ></ui-notice>`}
          <ui-field
            label="Почта"
            input-type="email"
            placeholder="you@example.com"
            .value=${this._email}
            @field-input=${(e: CustomEvent<string>) => (this._email = e.detail)}
          ></ui-field>
          <div class="actions">
            <ui-button
              variant="primary"
              ?disabled=${this.busy || !this.supported}
              @click=${() => emit<string>(this, "account-register", this._email.trim())}
              >Создать аккаунт</ui-button
            >
            <ui-button
              ?disabled=${this.busy || !this.supported}
              @click=${() => emit<string>(this, "account-sign-in", this._email.trim())}
              >Войти по ключу</ui-button
            >
          </div>
          ${this.error ? html`<ui-notice tone="error" message=${this.error}></ui-notice>` : null}
        </section>
      </div>
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

  private renderSignedIn(account: Account) {
    return html`
      <div class="signed-in">
        <section>
          <h3>Аккаунт</h3>
          <p class="email">${account.email}</p>
          <p class="hint">
            ${account.emailVerified
              ? "Адрес подтверждён"
              : "Адрес пока не подтверждён — он служит меткой аккаунта, вход даёт ключ"}
          </p>
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
