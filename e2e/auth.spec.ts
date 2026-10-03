import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, signIn, type Account } from "./support";

test.describe.serial("signing in and passwords", () => {
  let acct: Account;
  test.beforeAll(async () => {
    acct = await createAccount();
  });
  test.afterAll(async () => {
    await deleteAccount(acct);
  });

  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/patients");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("password can be shown and hidden", async ({ page }) => {
    await page.goto("/login");
    const pw = page.locator('input[name="password"]');
    await pw.fill("secret-123");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(pw).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(pw).toHaveAttribute("type", "password");
  });

  test("a wrong password shows an error and keeps the email", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', acct.email);
    await page.fill('input[name="password"]', "not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
    await expect(page.getByText(/invalid/i)).toBeVisible();
    await expect(page.locator('input[name="email"]')).toHaveValue(acct.email);
  });

  test("forgot password opens without signing in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  });

  test("an expired reset link explains what to do", async ({ page }) => {
    await page.goto("/login?error=reset");
    await expect(page.getByText(/reset link has expired/)).toBeVisible();
  });

  test("changing the password: mismatch is caught, input kept, new password works", async ({ page }) => {
    await signIn(page, acct);
    await page.goto("/profile");
    await page.getByRole("link", { name: /Change password/ }).click();
    const newPassword = `N3w-${Math.random().toString(36).slice(2)}!`;
    await page.fill('input[name="password"]', newPassword);
    await page.fill('input[name="confirm"]', "something-else");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("don't match")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveValue(newPassword);

    await page.fill('input[name="confirm"]', newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Password updated")).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, { email: acct.email, password: newPassword });
    acct.password = newPassword;
  });
});
