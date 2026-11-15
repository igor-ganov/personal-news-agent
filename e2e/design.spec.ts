import { expect, test, type Page } from "@playwright/test";
import { LABELS, SEEDED_TOPICS } from "./locators.js";

/** A browser authenticator that creates and answers keys on its own, like a phone's keystore. */
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

test.use({ colorScheme: "light" });

test("a topic reads as ink on paper: book type, hand-drawn tab mark, a real pencil to add with", async ({ page }) => {
  await withAuthenticator(page);
  await page.goto("/");
  await page.getByRole("button", { name: LABELS.newAccount }).click();
  // Adding a topic is the same pencil as adding anything else.
  await expect(
    page.getByRole("button", { name: LABELS.newTopic, exact: true }).locator("svg[data-object='pencil']"),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${SEEDED_TOPICS[0]}`) }).click();

  // Buttons are boxes drawn by hand; the chosen period is circled, not filled.
  await expect(page.getByRole("button", { name: LABELS.digestDay }).locator("svg.frame path")).toHaveAttribute(
    "d",
    /^M[\d.]+ [\d.]+ C/,
  );
  await expect(page.getByRole("button", { name: LABELS.periodDay, pressed: true }).locator("svg.oval path")).toHaveAttribute(
    "d",
    /^M[\d.]+ [\d.]+ C/,
  );

  const paper = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { background: body.backgroundColor, font: body.fontFamily };
  });
  expect(paper.background).toBe("rgb(246, 244, 239)");
  expect(paper.font).toMatch(/^"?Literata Variable"?,/);
  // The type ships with the app: a phone offline still reads in it.
  const faces = await page.evaluate(() => document.fonts.load('16px "Literata Variable"', "Ж").then((found) => found.length));
  expect(faces).toBeGreaterThan(0);

  const selected = page.getByRole("tab", { selected: true });
  await expect(selected.locator("svg.mark path")).toHaveAttribute("d", /^M[\d.]+ [\d.]+ C/);

  await page.getByRole("tab", { name: LABELS.aboutTab }).click();
  const add = page.getByRole("button", { name: LABELS.addSubtopic });
  await expect(add.locator("svg[data-object='pencil']")).toBeVisible();
});
