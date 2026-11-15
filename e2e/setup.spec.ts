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

const textbox = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

test("a typed name brings proposed settings, and what the user wrote stays theirs", async ({ page }) => {
  await withAuthenticator(page);
  await page.goto("/");
  // The app is called the same in every language.
  await expect(page).toHaveTitle(LABELS.appName);
  await expect(page.getByRole("heading", { name: LABELS.appName, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: LABELS.newAccount }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${SEEDED_TOPICS[0]}`) })).toBeVisible();

  // A new topic: the name is typed, and leaving the field proposes the rest.
  await page.getByRole("button", { name: LABELS.newTopic, exact: true }).click();
  const title = textbox(page, LABELS.titleField);
  await title.fill("Rust async");
  await title.blur();
  await expect(page.getByRole("status").filter({ hasText: LABELS.setupReady })).toBeVisible();
  const brief = textbox(page, LABELS.briefField);
  await expect(brief).toHaveValue(/«Rust async»/);
  await expect(textbox(page, LABELS.focusField).first()).toHaveValue("Rust async: релизы");
  await expect(page.getByRole("button", { name: LABELS.advancedLevel })).toHaveAttribute("aria-pressed", "true");

  // The description is rewritten by hand; a new name refreshes only what was proposed.
  await brief.fill("Only my own words");
  await title.fill("Rust embedded");
  await title.blur();
  await expect(textbox(page, LABELS.focusField).first()).toHaveValue("Rust embedded: релизы");
  await expect(brief).toHaveValue("Only my own words");

  await page.getByRole("button", { name: LABELS.create, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rust embedded" })).toBeVisible();

  // A skill: the goal is typed, and leaving the field proposes the time budget.
  await page.getByRole("tab", { name: LABELS.skillsTab }).click();
  await page.getByRole("button", { name: LABELS.newProgram }).click();
  const goal = textbox(page, LABELS.goalField);
  await goal.fill("Write drivers without unsafe");
  await goal.blur();
  await expect(page.getByRole("status").filter({ hasText: "6 недель" })).toBeVisible();
  await expect(page.getByRole("slider", { name: LABELS.weeksSlider })).toHaveValue("6");
  await expect(page.getByRole("slider", { name: LABELS.sessionsSlider })).toHaveValue("2");
  await expect(page.getByRole("slider", { name: LABELS.minutesSlider })).toHaveValue("60");
});
