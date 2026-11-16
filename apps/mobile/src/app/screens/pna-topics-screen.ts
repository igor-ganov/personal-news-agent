import { addTopic, digestTaskKey, generateDigest, type AppError } from "@pna/app";
import { buildTree, dayNews, type DayNews, type TopicId } from "@pna/core";
import { routeHref, type TopicFormValue } from "@pna/ui";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { navigate } from "../router.js";
import { NO_SETUP, setupAsker, type SetupView } from "../setup-view.js";
import "@pna/ui";

/** The root screen: every topic the user follows, and the way to add one. */
export class PnaTopicsScreen extends ConnectedElement {
  static override properties = {
    _creating: { state: true },
    _parentId: { state: true },
    _error: { state: true },
    _setup: { state: true },
  };

  private declare _creating: boolean;
  private declare _parentId: TopicId | null;
  private declare _error: string;
  private declare _setup: SetupView;
  private readonly setupFor = setupAsker(this.ctx, (view) => {
    this._setup = view;
  });

  constructor() {
    super();
    this._creating = false;
    this._parentId = null;
    this._error = "";
    this._setup = NO_SETUP;
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

  `;

  private save(value: TopicFormValue): void {
    const result = addTopic(this.ctx, {
      parentId: this._parentId,
      title: value.title,
      brief: value.brief,
      level: value.level,
      excludes: value.excludes,
      focusAreas: value.focusAreas,
    });

    if (!result.ok) {
      this._error = (result.error as AppError).message;
      return;
    }
    this._error = "";
    this._creating = false;
    navigate(routeHref({ name: "topic", topicId: result.value.id, tab: "news" }));
  }

  private readonly toggleCreating = (): void => {
    this._creating = !this._creating;
    this._parentId = null;
    this.setupFor.reset();
  };

  /** Today for every topic, as the list and the day summary show it. */
  private today(): Readonly<Record<TopicId, DayNews>> {
    const state = this.ctx.store.getState();
    const now = this.ctx.deps.clock.now();
    return Object.fromEntries(
      Object.keys(state.topics).map((id) => [id, dayNews(state.digests, id as TopicId, now)]),
    ) as Record<TopicId, DayNews>;
  }

  private gathering(): readonly TopicId[] {
    return (Object.keys(this.ctx.store.getState().topics) as TopicId[]).filter((id) =>
      this.isBusy(digestTaskKey(id, "day")),
    );
  }

  /** Asks the server for the day of every topic that has none yet and is not already asked. */
  private collectToday(): void {
    const today = this.today();
    const busy = new Set(this.gathering());
    (Object.keys(today) as TopicId[])
      .filter((id) => today[id]?.kind === "missing" && !busy.has(id))
      .forEach((topicId) => void generateDigest(this.ctx, { topicId, period: "day" }));
  }

  override render() {
    const state = this.ctx.store.getState();
    const tree = buildTree(state.topics);
    const today = this.today();
    const ready = Object.values(today).filter((news) => news.kind === "ready").length;

    return html`
      <pna-app-bar
        heading=${this._creating ? "Новая тема" : "Мои темы"}
        ?canGoBack=${this._creating}
        @go-back=${this.toggleCreating}
      >
        ${this._creating
          ? null
          : html`<ui-pencil-button slot="actions" @click=${this.toggleCreating}>Новая</ui-pencil-button>
              <ui-icon-button
                slot="actions"
                icon="gear"
                label="Настройки"
                @click=${() => navigate(routeHref({ name: "settings" }))}
              ></ui-icon-button>`}
      </pna-app-bar>

      <main>
        ${this._creating
          ? html`<pna-topic-form
              .error=${this._error}
              .setup=${this._setup.setup}
              ?setupBusy=${this._setup.busy}
              .setupError=${this._setup.error}
              @setup-request=${(e: CustomEvent<string>) => void this.setupFor.ask({ kind: "topic", title: e.detail })}
              @topic-save=${(e: CustomEvent<TopicFormValue>) => this.save(e.detail)}
              @topic-cancel=${() => {
                this._creating = false;
              }}
            ></pna-topic-form>`
          : html`<div>
              ${tree.length > 0
                ? html`<pna-today
                    .total=${Object.keys(today).length}
                    .ready=${ready}
                    .running=${this.gathering().length}
                    @today-collect=${() => this.collectToday()}
                  ></pna-today>`
                : null}
              <pna-topic-tree
                .nodes=${tree}
                .today=${today}
                @topic-open=${(e: CustomEvent<TopicId>) =>
                  navigate(routeHref({ name: "topic", topicId: e.detail, tab: "news" }))}
                @topic-create=${() => {
                  this._creating = true;
                  this.setupFor.reset();
                }}
              ></pna-topic-tree>
            </div>`}
      </main>
    `;
  }
}

customElements.define("pna-topics-screen", PnaTopicsScreen);
