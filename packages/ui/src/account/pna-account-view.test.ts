import { accountId, instantOf, type Account, type PasskeyRef } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import { PnaAccountView } from "./pna-account-view.js";

const account: Account = {
  id: accountId("acc-1"),
  email: "reader@example.com",
  emailVerified: false,
  displayName: "reader@example.com",
  createdAt: instantOf("2026-08-01T10:00:00.000Z"),
};

const passkey = (over: Partial<PasskeyRef> = {}): PasskeyRef => ({
  credentialId: "cred-1",
  label: "Телефон",
  createdAt: instantOf("2026-08-01T10:00:00.000Z"),
  lastUsedAt: null,
  ...over,
});

const view = async (props: Partial<PnaAccountView> = {}): Promise<PnaAccountView> => {
  const element = new PnaAccountView();
  Object.assign(element, props);
  return mount(element);
};

afterEach(unmountAll);

describe("когда не вошли", () => {
  it("объясняет, что пароля нет", async () => {
    const element = await view();
    expect(text(element)).toContain("Пароля здесь нет");
  });

  it("сообщает адрес по запросу на регистрацию", async () => {
    const element = await view();
    const events = capture<string>(element, "account-register");

    query<HTMLElement>(element, "ui-field")?.dispatchEvent(
      new CustomEvent("field-input", { detail: " reader@example.com ", bubbles: true, composed: true }),
    );
    await element.updateComplete;
    await click(element, queryAll(element, "ui-button")[0] ?? null);

    expect(events).toEqual(["reader@example.com"]);
  });

  it("вход по ключу — отдельное событие", async () => {
    const element = await view();
    const events = capture<string>(element, "account-sign-in");

    await click(element, queryAll(element, "ui-button")[1] ?? null);

    expect(events).toHaveLength(1);
  });

  it("на устройстве без ключей предупреждает и не даёт нажать", async () => {
    const element = await view({ supported: false });

    expect(query<HTMLElement>(element, "ui-notice")?.getAttribute("message")).toContain("недоступны");
    for (const button of queryAll(element, "ui-button"))
      expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("во время запроса кнопки заблокированы", async () => {
    const element = await view({ busy: true });
    for (const button of queryAll(element, "ui-button"))
      expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("показывает ошибку входа", async () => {
    const element = await view({ error: "Вход отменён" });
    expect(query<HTMLElement>(element, "ui-notice")?.getAttribute("message")).toBe("Вход отменён");
  });
});

describe("когда вошли", () => {
  it("показывает адрес и то, что он не подтверждён", async () => {
    const element = await view({ account, passkeys: [passkey()] });

    expect(text(element)).toContain("reader@example.com");
    expect(text(element)).toContain("не подтверждён");
  });

  it("подтверждённый адрес описан иначе", async () => {
    const element = await view({ account: { ...account, emailVerified: true }, passkeys: [passkey()] });
    expect(text(element)).toContain("Адрес подтверждён");
  });

  it("перечисляет ключи", async () => {
    const element = await view({
      account,
      passkeys: [passkey(), passkey({ credentialId: "cred-2", label: "Ноутбук" })],
    });

    expect(queryAll(element, ".key")).toHaveLength(2);
    expect(text(element)).toContain("Ноутбук");
  });

  it("единственный ключ убрать нельзя", async () => {
    const element = await view({ account, passkeys: [passkey()] });
    const remove = query<HTMLElement>(element, ".key ui-button");
    expect(remove?.hasAttribute("disabled")).toBe(true);
  });

  it("удаление ключа сообщает его идентификатор", async () => {
    const element = await view({
      account,
      passkeys: [passkey(), passkey({ credentialId: "cred-2", label: "Ноутбук" })],
    });
    const events = capture<string>(element, "passkey-remove");

    await click(element, queryAll(element, ".key ui-button")[1] ?? null);

    expect(events).toEqual(["cred-2"]);
  });

  it("даёт синхронизировать и выйти", async () => {
    const element = await view({ account, passkeys: [passkey()] });
    const synced = capture<null>(element, "account-sync");
    const out = capture<null>(element, "account-sign-out");

    await click(element, queryAll(element, "ui-button")[0] ?? null);
    await click(element, queryAll(element, "ui-button")[1] ?? null);

    expect(synced).toHaveLength(1);
    expect(out).toHaveLength(1);
  });

  it("показывает время последней синхронизации, когда оно есть", async () => {
    const element = await view({
      account,
      passkeys: [passkey()],
      syncedAt: instantOf("2026-08-22T10:00:00.000Z"),
    });
    expect(text(element)).toContain("Последняя синхронизация");
  });

  it("пустой список ключей объяснён, а не пуст", async () => {
    const element = await view({ account, passkeys: [] });
    expect(query<HTMLElement>(element, "ui-notice")?.getAttribute("message")).toBe("Ключей пока нет");
  });
});
