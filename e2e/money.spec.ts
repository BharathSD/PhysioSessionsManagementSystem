import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, fillDate, day, seedDemo, signIn, type Account } from "./support";

test.describe.serial("money: payments, discounts and fees", () => {
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

  test("the balance adds packages and visit fees, minus payments", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}?tab=account`);
    // ₹5,000 package + ₹1,000 home visit − ₹3,000 paid
    await expect(page.getByText("₹3,000 due").first()).toBeVisible();
    await expect(page.getByText("Package: Knee rehab")).toBeVisible();
  });

  test("a discount reduces what's owed and shows as − ₹", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}/charge`);
    await page.locator("label", { hasText: "Reduces what they owe" }).click();
    await page.fill('input[name="description"]', "Loyalty discount");
    await page.fill('input[name="amount"]', "500");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Discount added")).toBeVisible();
    await expect(page.locator("li", { hasText: "Loyalty discount" })).toContainText("− ₹500");
    await expect(page.getByText("₹2,500 due").first()).toBeVisible();
  });

  test("overpaying shows as an advance", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}/payment`);
    await page.fill('input[name="amount"]', "3000");
    await page.getByText("Cash", { exact: true }).click();
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment recorded")).toBeVisible();
    await expect(page.getByText("₹500 advance").first()).toBeVisible();
  });

  test("a clinic fee change can be scheduled and keeps its history", async ({ page }) => {
    await page.goto(`/profile/fees/edit?kind=visit&type=${acct.types.clinic}`);
    await page.fill('input[name="amount"]', "800");
    await fillDate(page, "Applies from", day(1));
    await page.getByRole("button", { name: "Save fee" }).click();
    await expect(page.getByText("Fee saved")).toBeVisible();
    await expect(page.getByText(/₹800 from/)).toBeVisible();
    await page.goto(`/profile/fees/edit?kind=visit&type=${acct.types.clinic}`);
    await expect(page.getByText("(upcoming)")).toBeVisible();
    await expect(page.getByText("₹600", { exact: true })).toBeVisible();
  });

  test("a patient's own fees: unchanged saves nothing, past visits keep their price", async ({ page }) => {
    await page.goto(`/patients/${ids.arjun}/fees`);
    await page.getByRole("button", { name: "Save fees" }).click();
    await expect(page.getByText("Nothing changed")).toBeVisible();

    await page.locator(`input[name="fee_${acct.types.home}"]`).fill("1100");
    await page.getByRole("button", { name: "Save fees" }).click();
    await expect(page.getByText("Fees saved (1 changed)")).toBeVisible();
    await expect(page.getByText(/Home visit ₹1,100/)).toBeVisible();

    await page.goto(`/patients/${ids.arjun}/fees`);
    const charged = page.locator("li", { hasText: "Home visit" }).filter({ hasText: "₹900" });
    await expect(charged).toHaveCount(2); // the two earlier home visits
  });
});
