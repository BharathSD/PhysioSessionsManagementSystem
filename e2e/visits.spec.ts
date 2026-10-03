import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, dmy, day, seedDemo, signIn, type Account } from "./support";

test.describe.serial("past sessions and editing visits", () => {
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

  test("a date range ticks matching weekdays, skips recorded days, and saves at a fixed amount", async ({ page }) => {
    await page.goto(`/patients/${ids.meena}/past-sessions`);
    const range = page.locator("details", { hasText: "Fill a date range" });
    const dates = range.locator('input[placeholder="DD/MM/YYYY"]');
    await dates.nth(0).fill(dmy(day(-14)));
    await dates.nth(1).fill(dmy(day(-1)));
    // every day of the week, so the count is predictable: 14 days minus Meena's 2 recorded visits
    for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
      const b = range.getByRole("button", { name: d, exact: true });
      if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
    }
    await range.getByRole("button", { name: "Tick these days on the calendar" }).click();
    await expect(page.getByText("Ticked 12 days")).toBeVisible();

    await page.getByText("Same amount for each session").click();
    await page.fill('input[name="fixed_amount"]', "450");
    await page.getByRole("button", { name: "Save sessions" }).click();
    await expect(page.getByText("12 sessions added")).toBeVisible();
    await expect(page.getByText("· ₹450")).toHaveCount(12);
  });

  test("a visit can be edited: outcome, price and date — with clear errors", async ({ page }) => {
    await page.goto(`/patients/${ids.meena}?tab=visits`);
    // the Edit on a visit in the list (not the patient's own Edit in the header)
    await page.locator("li").getByRole("link", { name: "Edit" }).first().click();
    await expect(page).toHaveURL(/\/visits\//);

    await page.getByText("From package").click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("No package sessions left")).toBeVisible();

    await page.locator('input[placeholder="DD/MM/YYYY"]').first().fill(dmy(day(-2)));
    await page.getByText("No charge", { exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("already a visit on that date")).toBeVisible();

    await page.locator('input[placeholder="DD/MM/YYYY"]').first().fill(dmy(day(-40)));
    await page.locator("label", { hasText: /^Absent$/ }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Visit updated")).toBeVisible();
    await expect(page.getByText("not charged").first()).toBeVisible();
  });

  test("a visit can be removed from its edit screen (with confirmation)", async ({ page }) => {
    await page.goto(`/patients/${ids.meena}?tab=visits`);
    // the Edit on a visit in the list (not the patient's own Edit in the header)
    await page.locator("li").getByRole("link", { name: "Edit" }).first().click();
    await page.getByRole("button", { name: "Remove this visit" }).click();
    await page.getByRole("button", { name: "Tap again to remove this visit" }).click();
    await expect(page.getByText("Visit removed")).toBeVisible();
  });
});
