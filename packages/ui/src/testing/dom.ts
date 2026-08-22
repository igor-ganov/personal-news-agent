import type { LitElement } from "lit";

/** Attaches an element and waits for its first render. */
export const mount = async <T extends LitElement>(element: T): Promise<T> => {
  document.body.append(element);
  await element.updateComplete;
  return element;
};

export const unmountAll = (): void => {
  document.body.replaceChildren();
};

export const query = <E extends Element>(host: LitElement, selector: string): E | null =>
  (host.shadowRoot?.querySelector(selector) ?? null) as E | null;

export const queryAll = <E extends Element>(host: LitElement, selector: string): E[] =>
  [...(host.shadowRoot?.querySelectorAll(selector) ?? [])] as E[];

export const text = (host: LitElement): string =>
  (host.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Collects the details of every event of a type dispatched from the element. */
export const capture = <T>(host: HTMLElement, type: string): T[] => {
  const seen: T[] = [];
  host.addEventListener(type, (event) => seen.push((event as CustomEvent<T>).detail));
  return seen;
};

export const click = async (host: LitElement, element: Element | null): Promise<void> => {
  (element as HTMLElement | null)?.click();
  await host.updateComplete;
};
