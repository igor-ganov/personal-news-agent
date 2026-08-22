import {
  addSourceByHand,
  addTopic,
  changeSourceStatus,
  commitProgram,
  deleteTopic,
  digestTaskKey,
  draftProgram,
  editTopic,
  ensureSourcesFresh,
  forgetSource,
  generateDigest,
  programTaskKey,
  refreshTopicSources,
  sourceTaskKey,
  type AppError,
} from "@pna/app";
import {
  ancestorsOf,
  applyPlanEdit,
  capacityReport,
  childrenOf,
  draftLessonMinutes,
  topicOverview,
  type DigestPeriod,
  type PlanEdit,
  type ProgramDraft,
  type ProgramId,
  type SourceId,
  type TopicId,
  type UserSourceDraft,
} from "@pna/core";
import { routeHref, type ProgramRequest, type SourceStatusChange, type TopicFormValue, type TopicTab } from "@pna/ui";
import { css, html, type TemplateResult } from "lit";
import { ConnectedElement } from "../context.js";
import { navigate } from "../router.js";
import "@pna/ui";

const TABS = [
  { id: "news", label: "Новости" },
  { id: "skills", label: "Скилы" },
  { id: "sources", label: "Источники" },
  { id: "about", label: "О теме" },
];

type SkillsMode = "list" | "wizard" | "plan";

/**
 * A topic: its digests, its programs, its sources and its own settings.
 *
 * The plan draft lives here rather than in the store on purpose — it is not
 * part of the user's data until they commit it.
 */
export class PnaTopicScreen extends ConnectedElement {
  static override properties = {
    topicId: { type: String },
    tab: { type: String },
    _mode: { state: true },
    _draft: { state: true },
    _request: { state: true },
    _planError: { state: true },
    _editing: { state: true },
    _formError: { state: true },
  };

  declare topicId: TopicId;
  declare tab: TopicTab;
  private declare _mode: SkillsMode;
  private declare _draft: ProgramDraft | null;
  private declare _request: ProgramRequest | null;
  private declare _planError: string;
  private declare _editing: boolean;
  private declare _formError: string;
  private refreshed = new Set<string>();

  constructor() {
    super();
    this.tab = "news";
    this._mode = "list";
    this._draft = null;
    this._request = null;
    this._planError = "";
    this._editing = false;
    this._formError = "";
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .section {
      margin-bottom: var(--pna-gap-lg);
    }

    h3 {
      margin: 0 0 var(--pna-gap-sm);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--pna-text-dim);
    }

    .subtopic {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pna-gap-sm);
      min-height: var(--pna-tap);
      padding: var(--pna-gap-sm);
      margin-bottom: 6px;
      border: 1px solid var(--pna-border);
      border-radius: var(--pna-radius-sm);
      background: var(--pna-surface);
      color: inherit;
      font: inherit;
      width: 100%;
      text-align: left;
      cursor: pointer;
    }

    .danger {
      margin-top: var(--pna-gap-lg);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.autoRefreshSources();
  }

  override updated(): void {
    this.autoRefreshSources();
  }

  /** Runs discovery once per topic per session, and only if the list is stale. */
  private autoRefreshSources(): void {
    if (!this.topicId || this.refreshed.has(this.topicId)) return;
    this.refreshed.add(this.topicId);
    const key = sourceTaskKey(this.topicId);
    void this.ctx.deps.tasks
      .run(key, async () => {
        const result = await ensureSourcesFresh(this.ctx, this.topicId);
        if (!result.ok) throw new Error(result.error.message);
      })
      .catch(() => {});
  }

  private run(key: string, work: () => Promise<{ ok: boolean; error?: AppError }>): void {
    void this.ctx.deps.tasks
      .run(key, async () => {
        const result = await work();
        if (!result.ok) throw new Error(result.error?.message ?? "Не получилось");
      })
      .catch(() => {});
  }

  private goTab(tab: string): void {
    navigate(routeHref({ name: "topic", topicId: this.topicId, tab: tab as TopicTab }));
  }

  /* ------------------------------------------------------------- skills -- */

  private requestPlan(request: ProgramRequest): void {
    this._request = request;
    this._planError = "";
    const key = programTaskKey(this.topicId);

    void this.ctx.deps.tasks
      .run(key, async () => {
        const result = await draftProgram(this.ctx, {
          topicId: this.topicId,
          intent: request.intent,
          schedule: request.schedule,
          basedOn: request.basedOn,
          continuation: request.continuation,
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.value;
      })
      .then((draft) => {
        this._draft = draft;
        this._mode = "plan";
      })
      .catch(() => {});
  }

  private applyEdit(edit: PlanEdit): void {
    if (!this._draft) return;
    const next = applyPlanEdit(this._draft, edit);
    if (!next.ok) {
      this._planError = next.error;
      return;
    }
    this._planError = "";
    this._draft = next.value;
  }

  private commit(): void {
    if (!this._draft || !this._request) return;
    const result = commitProgram(this.ctx, {
      topicId: this.topicId,
      draft: this._draft,
      schedule: this._request.schedule,
      basedOn: this._request.basedOn,
      continuation: this._request.continuation,
    });
    if (!result.ok) {
      this._planError = result.error.message;
      return;
    }
    this._draft = null;
    this._request = null;
    this._mode = "list";
    navigate(routeHref({ name: "program", programId: result.value.id }));
  }

  private renderSkills(): TemplateResult {
    const state = this.ctx.store.getState();
    const overview = topicOverview(state, this.topicId);
    const key = programTaskKey(this.topicId);

    if (this._mode === "wizard") {
      return html`<pna-program-wizard
        .availableBases=${(overview?.programs ?? []).map((p) => p.program)}
        .startDay=${this.ctx.deps.clock.now().slice(0, 10)}
        ?busy=${this.isBusy(key)}
        .error=${this.taskError(key)}
        @program-request=${(e: CustomEvent<ProgramRequest>) => this.requestPlan(e.detail)}
      ></pna-program-wizard>`;
    }

    if (this._mode === "plan" && this._draft) {
      return html`<pna-plan-editor
        .draft=${this._draft}
        .capacity=${this._request
          ? capacityReport(this._request.schedule.intensity, draftLessonMinutes(this._draft))
          : null}
        .error=${this._planError}
        @plan-edit=${(e: CustomEvent<PlanEdit>) => this.applyEdit(e.detail)}
        @plan-commit=${() => this.commit()}
        @plan-discard=${() => {
          this._draft = null;
          this._mode = "list";
        }}
      ></pna-plan-editor>`;
    }

    return html`<pna-program-list
      .programs=${overview?.programs ?? []}
      @program-open=${(e: CustomEvent<ProgramId>) =>
        navigate(routeHref({ name: "program", programId: e.detail }))}
      @program-new=${() => {
        this._mode = "wizard";
        this.ctx.deps.tasks.reset(key);
      }}
    ></pna-program-list>`;
  }

  /* --------------------------------------------------------------- about -- */

  private renderAbout(): TemplateResult {
    const state = this.ctx.store.getState();
    const topic = state.topics[this.topicId];
    if (!topic) return html`<ui-notice tone="error" message="Тема не найдена"></ui-notice>`;
    const children = childrenOf(state.topics, this.topicId);

    return html`<div>
      ${this._editing
        ? html`<pna-topic-form
            .topic=${topic}
            .error=${this._formError}
            @topic-save=${(e: CustomEvent<TopicFormValue>) => {
              const result = editTopic(this.ctx, this.topicId, {
                title: e.detail.title,
                brief: e.detail.brief,
                level: e.detail.level,
                excludes: e.detail.excludes,
              });
              if (!result.ok) {
                this._formError = result.error.message;
                return;
              }
              this._formError = "";
              this._editing = false;
            }}
            @topic-cancel=${() => {
              this._editing = false;
            }}
          ></pna-topic-form>`
        : html`<div class="section">
            <h3>Что интересно</h3>
            <p>${topic.brief || "Описание не заполнено"}</p>
            <ui-button size="sm" @click=${() => {
              this._editing = true;
            }}
              >Редактировать тему</ui-button
            >
          </div>`}

      <div class="section">
        <h3>Подтемы</h3>
        ${children.map(
          (child) => html`
            <button
              class="subtopic"
              @click=${() => navigate(routeHref({ name: "topic", topicId: child.id, tab: "news" }))}
            >
              <span>${child.title}</span>
              <span class="dim">›</span>
            </button>
          `,
        )}
        <ui-button
          size="sm"
          @click=${() => {
            const result = addTopic(this.ctx, { parentId: this.topicId, title: "Новая подтема" });
            if (result.ok)
              navigate(routeHref({ name: "topic", topicId: result.value.id, tab: "about" }));
          }}
          >Добавить подтему</ui-button
        >
      </div>

      <div class="danger">
        <ui-button
          variant="danger"
          @click=${() => {
            deleteTopic(this.ctx, this.topicId);
            navigate("#/");
          }}
          >Удалить тему со всем содержимым</ui-button
        >
      </div>
    </div>`;
  }

  /* -------------------------------------------------------------- render -- */

  private renderTab(): TemplateResult {
    const state = this.ctx.store.getState();
    const overview = topicOverview(state, this.topicId);
    if (!overview) return html`<ui-notice tone="error" message="Тема не найдена"></ui-notice>`;

    switch (this.tab) {
      case "news": {
        const busy = (["day", "week", "month", "year"] as DigestPeriod[]).filter((period) =>
          this.isBusy(digestTaskKey(this.topicId, period)),
        );
        const errors = (["day", "week", "month", "year"] as DigestPeriod[])
          .map((period) => this.taskError(digestTaskKey(this.topicId, period)))
          .filter((message) => message.length > 0);

        return html`<pna-digest-panel
          .digests=${overview.digests}
          .busyPeriods=${busy}
          .error=${errors[0] ?? ""}
          @digest-request=${(e: CustomEvent<DigestPeriod>) =>
            this.run(digestTaskKey(this.topicId, e.detail), () =>
              generateDigest(this.ctx, { topicId: this.topicId, period: e.detail }),
            )}
        ></pna-digest-panel>`;
      }

      case "sources": {
        const key = sourceTaskKey(this.topicId);
        return html`<pna-source-list
          .sources=${overview.sources}
          ?busy=${this.isBusy(key)}
          .error=${this.taskError(key)}
          @source-refresh=${() =>
            this.run(key, () => refreshTopicSources(this.ctx, this.topicId, { force: true }))}
          @source-add=${(e: CustomEvent<UserSourceDraft>) => {
            const result = addSourceByHand(this.ctx, this.topicId, e.detail);
            if (!result.ok) this.reportSourceError(key, result.error.message);
          }}
          @source-status=${(e: CustomEvent<SourceStatusChange>) =>
            changeSourceStatus(this.ctx, e.detail.id, e.detail.status)}
          @source-forget=${(e: CustomEvent<SourceId>) => forgetSource(this.ctx, e.detail)}
        ></pna-source-list>`;
      }

      case "skills":
        return this.renderSkills();

      case "about":
        return this.renderAbout();
    }
  }

  private reportSourceError(key: string, message: string): void {
    void this.ctx.deps.tasks
      .run(key, async () => {
        throw new Error(message);
      })
      .catch(() => {});
  }

  override render() {
    const state = this.ctx.store.getState();
    const topic = state.topics[this.topicId];

    return html`
      <pna-app-bar
        heading=${topic?.title ?? "Тема"}
        subtitle=${ancestorsOf(state.topics, this.topicId)
          .map((t) => t.title)
          .join(" / ")}
        canGoBack
      >
        <pna-tabs
          slot="tabs"
          .tabs=${TABS}
          .active=${this.tab}
          @tab-select=${(e: CustomEvent<string>) => this.goTab(e.detail)}
        ></pna-tabs>
      </pna-app-bar>

      <main>${this.renderTab()}</main>
    `;
  }
}

customElements.define("pna-topic-screen", PnaTopicScreen);
