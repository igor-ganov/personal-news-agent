import { deleteProgram } from "@pna/app";
import { breadcrumbOf, lineageOf, programProgress, type LessonId, type ProgramId } from "@pna/core";
import { routeHref } from "@pna/ui";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { goBack, navigate } from "../router.js";
import "@pna/ui";

/** One program: its modules, its sessions, and what it is built on. */
export class PnaProgramScreen extends ConnectedElement {
  static override properties = {
    programId: { type: String },
  };

  declare programId: ProgramId;

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }

    .danger {
      margin-top: var(--pna-gap-lg);
    }
  `;

  override render() {
    const state = this.ctx.store.getState();
    const program = state.programs[this.programId];

    if (!program) {
      return html`
        <pna-app-bar heading="Программа" canGoBack @go-back=${() => goBack()}></pna-app-bar>
        <main><ui-notice tone="error" message="Программа не найдена"></ui-notice></main>
      `;
    }

    const bases = lineageOf(state.programs, program.id)
      .filter((p) => program.basedOn.includes(p.id))
      .map((p) => p.title);

    return html`
      <pna-app-bar
        heading=${program.title}
        subtitle=${breadcrumbOf(state.topics, program.topicId)}
        canGoBack
        @go-back=${() => goBack()}
      ></pna-app-bar>

      <main>
        <pna-program-view
          .program=${program}
          .progress=${programProgress(program)}
          .baseTitles=${bases}
          @lesson-open=${(e: CustomEvent<LessonId>) =>
            navigate(routeHref({ name: "lesson", lessonId: e.detail }))}
        ></pna-program-view>

        <div class="danger">
          <ui-button
            variant="danger"
            @click=${() => {
              deleteProgram(this.ctx, program.id);
              navigate(routeHref({ name: "topic", topicId: program.topicId, tab: "skills" }));
            }}
            >Удалить программу</ui-button
          >
        </div>
      </main>
    `;
  }
}

customElements.define("pna-program-screen", PnaProgramScreen);
