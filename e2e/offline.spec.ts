import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, seedDemo, signIn, today, type Account } from "./support";

// Patchy signal: a save made offline waits, then goes through once — and help is a tap away.

test.describe.serial("weak signal and feedback", () => {
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

  test("marking Present with no signal waits, then saves exactly once when the signal is back", async ({ page, context }) => {
    await page.goto("/today");
    await context.setOffline(true);
    await page.getByRole("button", { name: "Mark Rahul Sharma present" }).click();
    await expect(page.getByText("No internet.")).toBeVisible();
    await expect(page.getByText("Waiting for signal…")).toBeVisible();

    await context.setOffline(false);
    await expect(page.locator("li", { hasText: "Rahul Sharma" }).first()).toContainText("from package");
    await expect(page.getByText("No internet.")).toHaveCount(0);
    const { data } = await acct.sb.from("sessions").select("id").eq("patient_id", ids.rahul).eq("session_date", today);
    expect(data).toHaveLength(1);
  });

  test("sending feedback", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("link", { name: /Help & feedback/ }).click();
    await page.locator("label", { hasText: "An idea" }).click();
    await page.fill('textarea[name="message"]', "Reminders the day before a session would help.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Thank you! We read every message.")).toBeVisible();
    await expect(page.getByText("Reminders the day before a session would help.")).toBeVisible();
  });
});
