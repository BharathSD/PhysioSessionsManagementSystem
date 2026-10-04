import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, seedDemo, signIn, type Account } from "./support";

// Hindi: the physio's app language, and a patient's WhatsApp messages in Hindi.

test.describe.serial("languages", () => {
  let acct: Account;
  let ids: Awaited<ReturnType<typeof seedDemo>>;
  test.beforeAll(async () => {
    acct = await createAccount();
    ids = await seedDemo(acct);
  });
  test.afterAll(async () => {
    await deleteAccount(acct);
  });

  test("switching the app to Hindi and back", async ({ page }) => {
    await signIn(page, acct);
    await page.goto("/profile");
    await page.getByRole("button", { name: "हिन्दी" }).click();
    await expect(page.getByRole("link", { name: "आज" }).last()).toBeVisible();
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "आज", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rahul Sharma को हाज़िर लगाएं" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");

    await page.goto("/profile");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("link", { name: "Today" }).last()).toBeVisible();
  });

  test("the language follows the physio to a new device", async ({ page, browser }) => {
    await signIn(page, acct);
    await page.goto("/profile");
    await page.getByRole("button", { name: "हिन्दी" }).click();
    await expect(page.getByRole("link", { name: "आज" }).last()).toBeVisible();

    const other = await browser.newContext();
    const phone = await other.newPage();
    await signIn(phone, acct);
    await expect(phone.getByRole("link", { name: "मरीज़" }).last()).toBeVisible();
    await other.close();

    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("link", { name: "Today" }).last()).toBeVisible();
  });

  test("a patient set to Hindi gets their receipt in Hindi, whatever the app language", async ({ page }) => {
    await signIn(page, acct);
    await page.goto(`/patients/${ids.rahul}/edit`);
    await page.locator('label:has(input[name="language"][value="hi"])').click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Details saved")).toBeVisible();

    await page.goto("/today");
    await page.getByRole("button", { name: "Mark Rahul Sharma present" }).click();
    const row = page.locator("li", { hasText: "Rahul Sharma" }).first();
    const receipt = decodeURIComponent((await row.getByRole("link", { name: "Send receipt" }).getAttribute("href")) ?? "");
    expect(receipt).toContain("नमस्ते Rahul Sharma,");
    expect(receipt).toContain("क्लिनिक सेशन हो गया");
  });
});
