import { expect, test, type Page } from "@playwright/test";
import { LABELS, SEEDED_TOPICS } from "./locators.js";

/**
 * A browser authenticator that answers like a phone's keystore: it holds
 * discoverable credentials and approves every prompt on its own.
 */
const withAuthenticator = async (page: Page): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
};

const topicButton = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^${title}`) });

test("the app opens on a passkey prompt, and the account's topics survive a restart", async ({ page }) => {
  await withAuthenticator(page);

  // Opening the app is the sign-in. A browser cannot tell "no key" from
  // "dismissed", so on a blank device it offers a new account in one press.
  await page.goto("/");
  await page.getByRole("button", { name: LABELS.newAccount }).click();
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

  // A device that knows nothing but the key: opening the app signs straight in
  // with it, and the account's copy is the truth.
  await page.evaluate(() => {
    globalThis.localStorage.clear();
    globalThis.location.hash = "#/";
  });
  await page.reload();
  for (const title of SEEDED_TOPICS.slice(0, 5)) await expect(topicButton(page, title)).toBeVisible();
  await expect(topicButton(page, doomed)).toHaveCount(0);
});
