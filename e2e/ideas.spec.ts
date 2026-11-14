import { expect, test, type Page } from "@playwright/test";
import { LABELS, SEEDED_TOPICS } from "./locators.js";

const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "18787"}`;

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

/** Fires the Worker's cron now — the minute tick that picks up queued generation. */
const runCron = async (page: Page): Promise<void> => {
  const response = await page.request.get(`${API}/__scheduled?cron=*+*+*+*+*`);
  expect(response.ok()).toBe(true);
};

const topicButton = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^${title}`) });

const ideaButton = (page: Page, list: string, title: string) =>
  page.getByRole("list", { name: list }).getByRole("button", { name: new RegExp(`^${title}`) });

test("a subtopic and a skill start from picked ideas, and a queued search says what it is doing", async ({ page }) => {
  await withAuthenticator(page);
  await page.goto("/");
  // A browser with no key reports the prompt as dismissed rather than empty, so
  // the account is started the way a person would start it here.
  await page.getByRole("button", { name: LABELS.newAccount }).click();
  const parent = SEEDED_TOPICS[0];
  await topicButton(page, parent).click();

  // A subtopic: ask for ideas, ask for ten more, pick one, then make it yours.
  await page.getByRole("tab", { name: LABELS.aboutTab }).click();
  await page.getByRole("button", { name: LABELS.addSubtopic }).click();
  await page.getByRole("button", { name: LABELS.askIdeas }).click();
  const subtopics = page.getByRole("list", { name: LABELS.subtopicIdeas }).getByRole("listitem");
  await expect(subtopics).toHaveCount(10);
  await page.getByRole("button", { name: LABELS.moreIdeas }).click();
  await expect(subtopics).toHaveCount(20);

  const idea = `Подтема 3: ${parent}`;
  await ideaButton(page, LABELS.subtopicIdeas, idea).click();
  const title = page.getByRole("textbox", { name: LABELS.titleField });
  await expect(title).toHaveValue(idea);
  const mine = "Подтема 3 — мой вариант";
  await title.fill(mine);
  await page.getByRole("button", { name: LABELS.create, exact: true }).click();
  await expect(page.getByRole("heading", { name: mine })).toBeVisible();

  // The new subtopic has no sources, so the app asks the server for them at
  // once; until the cron picks the job up, the status says it is queued.
  await page.getByRole("tab", { name: LABELS.sourcesTab }).click();
  await expect(page.getByRole("status").filter({ hasText: LABELS.queued })).toBeVisible();
  await runCron(page);
  // The idea's focus areas became the subtopic's, and the search found a source for each.
  await expect(page.getByText("Фокус 3.1 — дайджест")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: LABELS.queued })).toHaveCount(0);

  // A skill: the picked idea becomes the goal, still editable before the plan is asked for.
  await page.getByRole("tab", { name: LABELS.skillsTab }).click();
  await page.getByRole("button", { name: LABELS.newProgram }).click();
  await page.getByRole("button", { name: LABELS.askIdeas }).click();
  await ideaButton(page, LABELS.skillIdeas, `Навык 1: ${mine}`).click();
  await expect(page.locator("pna-program-wizard").getByRole("textbox")).toHaveValue(
    new RegExp(`^Навык 1: ${mine}: `),
  );
});
