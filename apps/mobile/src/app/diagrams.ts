import { setDiagramRenderer } from "@pna/ui";

/**
 * Diagram rendering, and the one place where bundle size is a real trade-off.
 *
 * Mermaid is by far the heaviest thing the app can ship — around 3 MB across
 * its diagram chunks, against roughly 600 KB for everything else. It is loaded
 * through a dynamic import, so it never touches startup, but it still occupies
 * space inside the installed package.
 *
 * Building with `PUBLIC_PNA_DIAGRAMS=off` folds the condition below to `false`
 * at build time, which lets the bundler drop Mermaid entirely; lectures then
 * show diagram source instead of a picture, which `ui-diagram` handles on its own.
 */
const DIAGRAMS_ENABLED =
  (import.meta.env as Record<string, string | undefined>)["PUBLIC_PNA_DIAGRAMS"] !== "off";

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

let api: MermaidApi | null = null;
let loading: Promise<void> | null = null;

const prefersDark = (): boolean =>
  globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

const load = async (): Promise<MermaidApi> => {
  if (api) return api;
  loading ??= (async () => {
    const module = (await import("mermaid")) as unknown as { default: MermaidApi };
    module.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: prefersDark() ? "dark" : "default",
      fontFamily: "inherit",
    });
    api = module.default;
  })();
  await loading;
  if (!api) throw new Error("mermaid unavailable");
  return api;
};

export const registerDiagramRenderer = (): void => {
  if (!DIAGRAMS_ENABLED) return;
  setDiagramRenderer(async (id, source) => {
    const mermaid = await load();
    const { svg } = await mermaid.render(id, source);
    return svg;
  });
};
