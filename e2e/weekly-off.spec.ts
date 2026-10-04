import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, seedDemo, signIn, today, type Account } from "./support";

// A clinic closed every week (here: today's weekday) asks for no attendance on that day.

const todayWeekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

test.describe.serial("closed every week", () => {
  let acct: Account;
  let ids: Awaited<ReturnType<typeof seedDemo>>;
  test.beforeAll(async () => {
    acct = await createAccount();
    ids = await seedDemo(acct);
  });
  test.afterAll(async () => {
    await deleteAccount(acct);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page, acct);
  });

  test("set from Days off; Today and the patient page then ask for no attendance", async ({ page }) => {
    await page.goto("/profile/days-off");
    await page.locator(`label:has(input[name="closed_weekdays"][value="${todayWeekday}"])`).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Weekly closed days saved")).toBeVisible();

    await page.goto("/today");
    await expect(page.getByText("Clinic closed today · Weekly off")).toBeVisible();
    await expect(page.getByText("Expected today")).toHaveCount(0);
    await expect(page.locator('button[aria-label$="present"]:visible')).toHaveCount(0);

    await page.goto(`/patients/${ids.rahul}`);
    await expect(page.getByText("No session today")).toBeVisible();
    await expect(page.getByText("Clinic closed (weekly off)").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Present" })).toHaveCount(0);
  });

  test("someone who comes anyway can still be marked", async ({ page }) => {
    await page.goto("/today");
    await page.getByText(/Emergency or extra visit\?/).click();
    await page.getByRole("button", { name: "Mark Rahul Sharma present" }).click();
    await expect(page.getByText("Seen today")).toBeVisible();
    await expect(page.locator("li", { hasText: "Rahul Sharma" }).first()).toContainText("from package");
  });

  test("opening again brings the day back", async ({ page }) => {
    await page.goto("/profile/days-off");
    await page.locator(`label:has(input[name="closed_weekdays"][value="${todayWeekday}"])`).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Weekly closed days saved")).toBeVisible();
    await page.goto("/today");
    await expect(page.getByText("Clinic closed today")).toHaveCount(0);
    await expect(page.getByText("Expected today")).toBeVisible();
  });
});
