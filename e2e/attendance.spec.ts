import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, fillDate, day, seedDemo, signIn, type Account } from "./support";

test.describe.serial("marking attendance", () => {
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

  test("Today lists expected patients with their visit type", async ({ page }) => {
    await page.goto("/today");
    await expect(page.locator("li", { hasText: "Rahul Sharma" }).first()).toContainText("In-clinic session");
    await expect(page.locator("li", { hasText: "Suresh Patel" }).first()).toContainText("Assessment");
  });

  test("Present uses the package, records pain in one tap, and the receipt says so", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("button", { name: "Mark Rahul Sharma present" }).click();
    const row = page.locator("li", { hasText: "Rahul Sharma" }).first();
    await expect(row).toContainText("from package");
    const receipt = decodeURIComponent((await row.getByRole("link", { name: "Send receipt" }).getAttribute("href")) ?? "");
    expect(receipt).toContain("In-clinic session done");
    expect(receipt).toContain("from package (7 of 10 used)");

    await row.getByRole("button", { name: "Pain 3 out of 10" }).click();
    await expect(row.getByText("3/10")).toBeVisible();
  });

  test("an absence is free until you choose to charge it", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("button", { name: "Mark Suresh Patel absent" }).click();
    const row = page.locator("li", { hasText: "Suresh Patel" }).first();
    await expect(row).toContainText("not charged");
    await row.getByRole("button", { name: "Charge fee" }).click();
    await expect(row).toContainText("₹300"); // no package → no-show fee
    await row.getByRole("button", { name: "Don't charge" }).click();
    await expect(row).toContainText("not charged");
  });

  test("a home visit uses the patient's own fee", async ({ page }) => {
    await page.goto(`/patients/${ids.arjun}/attendance`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/tab=visits/);
    await expect(page.getByText("Home visit · ₹900").first()).toBeVisible();
  });

  test("a patient cancellation can be charged and rescheduled in one step", async ({ page }) => {
    await page.goto(`/patients/${ids.meena}/attendance`);
    await page.getByText("Cancelled by patient", { exact: true }).click();
    await page.locator('input[name="charge"]').check();
    await fillDate(page, "Reschedule to", day(1));
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved and rescheduled")).toBeVisible();
    await expect(page.getByText("Online session · ₹200").first()).toBeVisible();
  });

  test("the same day can't be marked twice", async ({ page }) => {
    await page.goto(`/patients/${ids.arjun}/attendance`);
    await expect(page.getByText("Already marked")).toBeVisible();
  });

  test("a past day that was never marked can be marked from the calendar", async ({ page }) => {
    await page.goto(`/patients/${ids.fatima}`);
    const unmarked = page.locator('button[aria-label$=": Not marked"]:visible');
    if ((await unmarked.count()) === 0) await page.getByRole("button", { name: "Previous month" }).click();
    await unmarked.last().click();
    await page.getByRole("link", { name: "Mark it" }).click();
    await expect(page).toHaveURL(/attendance\?date=/);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Attendance saved")).toBeVisible();
  });
});
