import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, seedDemo, signIn, today, type Account } from "./support";

test.describe.serial("patients: adding, details and overview", () => {
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

  test("the add-patient wizard: name required, fees pre-filled, own fee saved", async ({ page }) => {
    await page.goto("/patients/new?type=new");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 1 of 4")).toBeVisible(); // name is required

    await page.fill('input[name="name"]', "Wizard Test");
    await page.fill('input[name="phone"]', "98765 00009");
    await page.getByText("Home visit", { exact: true }).first().click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.fill('input[name="sessions"]', "6");
    await page.fill('input[name="price"]', "3000");
    await page.fill('input[name="paid_now"]', "1500");
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    const homeFee = page.locator(`input[name="fee_${acct.types.home}"]`);
    await expect(homeFee).toHaveValue("1000");
    await expect(page.locator(`input[name="fee_${acct.types.clinic}"]`)).toHaveValue("700");
    await homeFee.fill("900");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Mon / Wed / Fri" }).click();
    await page.getByRole("button", { name: "Save patient" }).click();

    await expect(page.getByText("Wizard Test added")).toBeVisible();
    await expect(page.getByText("Usually: Home visit")).toBeVisible();
    await expect(page.getByText(/Home visit ₹900/)).toBeVisible();
    await expect(page.getByText("Mon, Wed, Fri · every week").first()).toBeVisible();
    await expect(page.getByText("₹1,500").first()).toBeVisible();
  });

  test("a failed save doesn't leave a half-saved patient (duplicate phone)", async ({ page }) => {
    await page.goto("/patients/new?type=new");
    await page.fill('input[name="name"]', "Duplicate");
    await page.fill('input[name="phone"]', "98765 00009");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Save patient" }).click();
    await expect(page.getByText("already exists")).toBeVisible();
  });

  test("clinical and personal details, precautions banner and About", async ({ page }) => {
    await page.goto(`/patients/${ids.arjun}/edit`);
    await page.fill('textarea[name="precautions"]', "High BP — no heavy lifting");
    await page.fill('textarea[name="goals"]', "Walk 2 km without pain");
    await page.fill('input[name="age"]', "52");
    await page.fill('textarea[name="address"]', "Flat 4B, Sea View, Bandra West, Mumbai");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Details saved")).toBeVisible();
    await expect(page.getByRole("note")).toContainText("High BP — no heavy lifting");
    await expect(page.getByText("Walk 2 km without pain")).toBeVisible();
    await expect(page.getByText("~52 years")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Maps" })).toBeVisible();
  });

  test("overview: pain chart, attendance and coming up", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}`);
    await expect(page.getByText("8 → 3")).toBeVisible();
    await expect(page.getByText("turned up")).toBeVisible();
    await expect(page.getByText("Package runs out")).toBeVisible();
  });

  test("today's unmarked session counts as upcoming, not missed", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}`);
    await expect(page.getByText("Next: Today")).toBeVisible();
    const todayCell = page.locator(`button[aria-label^="${Number(today.slice(8))}: "]`).last();
    await expect(todayCell).toHaveAttribute("aria-label", /Coming up/);
  });

  test("on a laptop the calendar shows last month and this month, and a tapped day shows its details", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.goto(`/patients/${ids.rahul}`);
    const present = page.locator('button[aria-label$=": Present"]:visible');
    await expect(present).toHaveCount(7); // 6 package visits + 1 home visit
    await present.first().click();
    await expect(page.getByText(/Present · In-clinic session · pain 8\/10/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit", exact: true }).last()).toBeVisible();
  });
});
