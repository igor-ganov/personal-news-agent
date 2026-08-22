/**
 * Components never call use-cases; they announce what happened and let the
 * container decide. One helper keeps every dispatch identical: composed, so it
 * crosses shadow boundaries, and bubbling, so a screen can listen in one place.
 */
export const emit = <T>(element: HTMLElement, type: string, detail: T): void => {
  element.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
};

export const on = <T>(
  element: HTMLElement,
  type: string,
  handler: (detail: T, event: CustomEvent<T>) => void,
): (() => void) => {
  const listener = (event: Event): void => {
    const custom = event as CustomEvent<T>;
    handler(custom.detail, custom);
  };
  element.addEventListener(type, listener);
  return () => element.removeEventListener(type, listener);
};
