import { generateKeyPairSync, randomBytes } from "node:crypto";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { LABELS, SEEDED_TOPICS } from "./locators.js";

interface Authenticator {
  readonly cdp: CDPSession;
  readonly id: string;
}

/**
 * A browser authenticator that answers like a phone's keystore: it holds
 * discoverable credentials and approves every prompt on its own.
 */
const withAuthenticator = async (page: Page): Promise<Authenticator> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, id: authenticatorId };
};

/**
 * A key the phone still holds for an account the server has forgotten — what
 * the old «агент-…» keys were after the accounts were wiped.
 *
 * Its id is all zeros so it sorts first: Chrome's test authenticator answers an
 * open prompt with the lowest id, which makes the leftover the key it picks, as
 * a person on the phone might.
 */
const addLeftoverKey = async (authenticator: Authenticator): Promise<string> => {
  const credentialId = Buffer.alloc(16).toString("base64");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  await authenticator.cdp.send("WebAuthn.addCredential", {
    authenticatorId: authenticator.id,
    credential: {
      credentialId,
      isResidentCredential: true,
      rpId: "localhost",
      privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
      userHandle: randomBytes(16).toString("base64"),
      signCount: 0,
    },
  });
  return credentialId;
};

const topicButton = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^${title}`) });

test("the app opens on a passkey prompt, and a leftover key never leads to a second account", async ({ page }) => {
  const authenticator = await withAuthenticator(page);
  const leftover = await addLeftoverKey(authenticator);

  // Opening the app is the sign-in. The phone offers the only key it has, a
  // leftover the server does not know, and the app starts the account itself.
  await page.goto("/");
  for (const title of SEEDED_TOPICS) await expect(topicButton(page, title)).toBeVisible();

  // Closing and reopening the app must not ask again or empty the list.
  await page.reload();
  for (const title of SEEDED_TOPICS) await expect(topicButton(page, title)).toBeVisible();

  // Delete one topic and send it to the account without waiting for autosync.
  const doomed = SEEDED_TOPICS[5];
  await topicButton(page, doomed).click();
  await page.getByRole("tab", { name: LABELS.aboutTab }).click();
  await page.getByRole("button", { name: LABELS.deleteTopic }).click();
  await expect(topicButton(page, doomed)).toHaveCount(0);
  await page.goto("/#/account");
  const synced = page.waitForResponse((r) => r.url().endsWith("/state") && r.request().method() === "PUT" && r.ok());
  await page.getByRole("button", { name: LABELS.sync }).click();
  await synced;

  // Signing out and back in lands in the same account: the prompt offers the
  // account's key only, not the leftover that would start an empty one.
  await page.getByRole("button", { name: LABELS.signOut }).click();
  for (const title of SEEDED_TOPICS.slice(0, 5)) await expect(topicButton(page, title)).toBeVisible();
  await expect(topicButton(page, doomed)).toHaveCount(0);

  // With the leftover deleted, a device that knows nothing but the key finds
  // the account by it, and the account's copy is the truth.
  await authenticator.cdp.send("WebAuthn.removeCredential", {
    authenticatorId: authenticator.id,
    credentialId: leftover,
  });
  await page.evaluate(() => {
    globalThis.localStorage.clear();
    globalThis.location.hash = "#/";
  });
  await page.reload();
  for (const title of SEEDED_TOPICS.slice(0, 5)) await expect(topicButton(page, title)).toBeVisible();
  await expect(topicButton(page, doomed)).toHaveCount(0);
});
