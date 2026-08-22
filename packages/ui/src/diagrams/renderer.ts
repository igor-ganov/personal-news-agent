/**
 * Diagram rendering is injected rather than imported.
 *
 * A Mermaid bundle is large and only lesson screens need it, so the UI package
 * stays free of that dependency: the host app registers a renderer that
 * lazy-loads Mermaid on first use. With no renderer registered, diagrams fall
 * back to showing their source, which is still readable.
 */
export type DiagramRenderer = (id: string, source: string) => Promise<string>;

let renderer: DiagramRenderer | null = null;

export const setDiagramRenderer = (next: DiagramRenderer | null): void => {
  renderer = next;
};

export const getDiagramRenderer = (): DiagramRenderer | null => renderer;

export const hasDiagramRenderer = (): boolean => renderer !== null;
