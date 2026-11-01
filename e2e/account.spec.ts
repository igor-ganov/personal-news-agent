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

const openAccount = async (page: Page): Promise<void> => {
  await page.goto("/#/account");
};

test("one account, its topics survive a restart, and a deletion reaches the server", async ({ page }) => {
  await withAuthenticator(page);

  // A phone with nothing on it: the single door creates the account.
  await openAccount(page);
  await page.getByRole("button", { name: LABELS.continue }).click();
  await page.getByRole("button", { name: LABELS.createAccount, exact: true }).click();
  await expect(page.getByRole("button", { name: LABELS.signOut })).toBeVisible();

  // The account opens on the prepared profile.
  await page.goto("/#/");
  for (const title of SEEDED_TOPICS) await expect(topicButton(page, title)).toBeVisible();

  // Closing and reopening the app must not sign out or empty the list.
  await page.reload();
  for (const title of SEEDED_TOPICS) await expect(topicButton(page, title)).toBeVisible();
  await openAccount(page);
  await expect(page.getByRole("button", { name: LABELS.signOut })).toBeVisible();

  // Delete one topic and push it to the account.
  const doomed = SEEDED_TOPICS[5];
  await page.goto("/#/");
  await topicButton(page, doomed).click();
  await page.getByRole("tab", { name: LABELS.aboutTab }).click();
  await page.getByRole("button", { name: LABELS.deleteTopic }).click();
  await expect(topicButton(page, doomed)).toHaveCount(0);
  await openAccount(page);
  const synced = page.waitForResponse((r) => r.url().endsWith("/state") && r.request().method() === "PUT" && r.ok());
  await page.getByRole("button", { name: LABELS.sync }).click();
  await synced;

  // A device that knows nothing but the key: the account's copy is the truth.
  await page.evaluate(() => globalThis.localStorage.clear());
  await page.reload();
  await openAccount(page);
  await page.getByRole("button", { name: LABELS.continue }).click();
  await expect(page.getByRole("button", { name: LABELS.signOut })).toBeVisible();
  await page.goto("/#/");
  for (const title of SEEDED_TOPICS.slice(0, 5)) await expect(topicButton(page, title)).toBeVisible();
  await expect(topicButton(page, doomed)).toHaveCount(0);
});
