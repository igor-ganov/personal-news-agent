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

  it("одна кнопка на вход и на регистрацию", async () => {
    const element = await view();
    const events = capture<string>(element, "account-continue");

    query<HTMLElement>(element, "ui-field")?.dispatchEvent(
      new CustomEvent("field-input", { detail: " reader@example.com ", bubbles: true, composed: true }),
    );
    await element.updateComplete;

    const buttons = queryAll<HTMLElement>(element, "ui-button");
    expect(buttons).toHaveLength(1);

    await click(element, buttons[0] ?? null);
    expect(events).toEqual(["reader@example.com"]);
  });

  it("работает и без адреса — ключ на устройстве сам скажет, кто это", async () => {
    const element = await view();
    const events = capture<string>(element, "account-continue");

    await click(element, queryAll(element, "ui-button")[0] ?? null);

    expect(events).toEqual([""]);
  });

  it("после закрытого окна предлагает завести аккаунт, а не молчит", async () => {
    const element = await view({ offerCreate: "reader@example.com" });
    const events = capture<string>(element, "account-create");

    const buttons = queryAll<HTMLElement>(element, "ui-button");
    const create = buttons.find((button) => (button.textContent ?? "").includes("Завести аккаунт"));
    await click(element, create ?? null);

    expect(events).toEqual(["reader@example.com"]);
  });

  it("объясняет, что делать, если аккаунт есть, а ключа тут нет", async () => {
    const element = await view({ linkFor: "reader@example.com" });

    // Адрес живёт в сообщении заметки, а способы подключения — в самом тексте.
    expect(query<HTMLElement>(element, "ui-notice")?.getAttribute("message")).toContain(
      "reader@example.com",
    );
    expect(text(element)).toContain("Добавить устройство");
    expect(text(element)).toContain("Ключ с другого устройства");
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

  it("просит ссылку для второго устройства", async () => {
    const element = await view({ account, passkeys: [passkey()] });
    const asked = capture<null>(element, "device-invite");

    const buttons = queryAll<HTMLElement>(element, "ui-button");
    const add = buttons.find((button) => (button.textContent ?? "").includes("Добавить устройство"));
    await click(element, add ?? null);

    expect(asked).toHaveLength(1);
  });

  it("показывает ссылку целиком и её же кодом", async () => {
    const element = await view({
      account,
      passkeys: [passkey()],
      invite: {
        url: "https://api.test/enroll#t=secret-token",
        expiresAt: instantOf("2026-08-22T10:10:00.000Z"),
      },
    });

    // Ссылка одноразовая: её показывают и текстом, и кодом — иначе на второе
    // устройство её не перенести.
    expect(text(element)).toContain("https://api.test/enroll#t=secret-token");
    expect(query<HTMLElement>(element, "ui-qr")).not.toBeNull();
  });

  it("пустой список ключей объяснён, а не пуст", async () => {
    const element = await view({ account, passkeys: [] });
    expect(query<HTMLElement>(element, "ui-notice")?.getAttribute("message")).toBe("Ключей пока нет");
  });
});
