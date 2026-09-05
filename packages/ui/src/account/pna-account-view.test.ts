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

  it("одна кнопка, и почта для неё не нужна", async () => {
    const element = await view();
    const events = capture<string>(element, "account-continue");

    // Поля почты на экране нет: аккаунт — это ключ доступа.
    expect(query<HTMLElement>(element, "ui-field")).toBeNull();

    await click(element, queryAll(element, "ui-button")[0] ?? null);
    expect(events).toEqual([""]);
  });

  it("почту можно указать, если хочется", async () => {
    const element = await view();
    const events = capture<string>(element, "account-continue");

    const buttons = queryAll<HTMLElement>(element, "ui-button");
    const reveal = buttons.find((button) => (button.textContent ?? "").includes("Указать почту"));
    await click(element, reveal ?? null);

    query<HTMLElement>(element, "ui-field")?.dispatchEvent(
      new CustomEvent("field-input", { detail: " reader@example.com ", bubbles: true, composed: true }),
    );
    await element.updateComplete;
    await click(element, queryAll<HTMLElement>(element, "ui-button")[0] ?? null);

    expect(events).toEqual(["reader@example.com"]);
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
  it("показывает адрес, когда он есть", async () => {
    const element = await view({ account, passkeys: [passkey()] });

    expect(text(element)).toContain("reader@example.com");
    expect(text(element)).toContain("метка аккаунта");
  });

  it("без адреса предлагает его добавить, а не требует", async () => {
    const element = await view({ account: { ...account, email: "" }, passkeys: [passkey()] });
    const events = capture<string>(element, "account-email");

    const add = queryAll<HTMLElement>(element, "ui-button").find((button) =>
      (button.textContent ?? "").includes("Добавить почту"),
    );
    await click(element, add ?? null);

    query<HTMLElement>(element, "ui-field")?.dispatchEvent(
      new CustomEvent("field-input", { detail: "later@example.com", bubbles: true, composed: true }),
    );
    await element.updateComplete;

    const save = queryAll<HTMLElement>(element, "ui-button").find((button) =>
      (button.textContent ?? "").includes("Сохранить почту"),
    );
    await click(element, save ?? null);

    expect(events).toEqual(["later@example.com"]);
  });

  it("адрес показывается как метка, а не как пропуск", async () => {
    const element = await view({ account: { ...account, emailVerified: true }, passkeys: [passkey()] });

    // Подтверждать здесь нечего: вход даёт ключ, адрес только помогает узнать
    // аккаунт на другом устройстве.
    expect(text(element)).toContain("метка аккаунта");
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
