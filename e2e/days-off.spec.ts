import { expect, test } from "@playwright/test";
import { createAccount, deleteAccount, fillDate, day, seedDemo, signIn, today, type Account } from "./support";

test.describe.serial("days off and cancelling in advance", () => {
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

  test("closing the clinic lists who's affected and ticks them as told", async ({ page, context }) => {
    await page.goto("/profile/days-off");
    await fillDate(page, "First day off", day(3));
    await fillDate(page, "Last day off", day(7));
    await page.fill('input[name="reason"]', "Conference");
    await page.getByRole("button", { name: "Save and notify patients" }).click();
    await expect(page).toHaveURL(/\/notify$/);

    const rahul = page.locator("li", { hasText: "Rahul Sharma" });
    await expect(rahul).toContainText("Cancelled:");
    await expect(page.locator("li", { hasText: "Meena Iyer" })).toContainText("Comes on days they choose");
    const send = rahul.getByRole("link", { name: "Send" });
    const message = decodeURIComponent((await send.getAttribute("href")) ?? "");
    expect(message).toContain("(Conference)");
    expect(message).toContain("no charge");

    const [whatsapp] = await Promise.all([context.waitForEvent("page"), send.click()]);
    await whatsapp.close();
    await expect(rahul.getByText("Told")).toBeVisible();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(rahul.getByText("Told")).toBeVisible();
  });

  test("the closure shows on Home and in the patient's Coming up", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Clinic closed/).first()).toBeVisible();
    await page.goto(`/patients/${ids.rahul}`);
    await expect(page.getByText("Clinic closed · Conference").first()).toBeVisible();
  });

  test("one day: cancel with a make-up session, message the patient, then restore", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}`);
    await page.getByRole("link", { name: /^Cancel / }).first().click();
    await expect(page.getByRole("heading", { name: "Cancel this day" })).toBeVisible();
    await fillDate(page, "Book a make-up session", day(9));
    await page.getByRole("button", { name: "Cancel sessions" }).click();
    await expect(page.getByText("1 day cancelled · make-up booked")).toBeVisible();
    const msg = decodeURIComponent((await page.getByRole("link", { name: /Let Rahul know/ }).getAttribute("href")) ?? "");
    expect(msg).toContain("Make-up session booked");

    await page.getByRole("button", { name: "Restore" }).first().click();
    await expect(page.getByText("Day restored")).toBeVisible();
  });

  test("several days at once from the calendar", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}`);
    await page.getByRole("button", { name: "Cancel days…" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    const upcoming = page.locator('button[aria-label$=": Coming up"]:visible');
    await upcoming.nth(0).click();
    await upcoming.nth(1).click();
    await page.getByRole("link", { name: "Cancel 2 days" }).click();
    await page.getByText("Me / the clinic").click();
    await page.getByRole("button", { name: "Cancel sessions" }).click();
    await expect(page.getByText("2 days cancelled")).toBeVisible();
    const msg = decodeURIComponent((await page.getByRole("link", { name: /Let Rahul know/ }).getAttribute("href")) ?? "");
    expect(msg).toContain("I won't be available");
  });

  test("a break between two dates shows on the Schedule tab", async ({ page }) => {
    await page.goto(`/patients/${ids.arjun}/cancel-days`);
    await fillDate(page, "From", day(10));
    await fillDate(page, "Until", day(20));
    await page.fill('input[name="reason"]', "Travelling");
    await page.getByRole("button", { name: "Save break" }).click();
    await expect(page.getByText("11 days cancelled")).toBeVisible();
    await page.goto(`/patients/${ids.arjun}?tab=schedule`);
    await expect(page.getByText("Cancelled by patient · Travelling")).toBeVisible();
  });

  test("Today: a day cancelled in advance moves to 'Off today'; a closed clinic still allows walk-ins", async ({ page }) => {
    await page.goto(`/patients/${ids.suresh}/cancel-days?dates=${today}`);
    await page.getByRole("button", { name: "Cancel sessions" }).click();
    await expect(page.getByText("1 day cancelled")).toBeVisible(); // wait for the save before leaving
    await page.goto("/today");
    await expect(page.getByText("Off today (cancelled in advance)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Suresh Patel present" })).toHaveCount(0);

    await page.goto("/profile/days-off");
    await fillDate(page, "First day off", today);
    await page.getByRole("button", { name: "Save and notify patients" }).click();
    await expect(page).toHaveURL(/\/notify$/);
    await page.goto("/today");
    await expect(page.getByText("Clinic closed today")).toBeVisible();
    // The walk-ins list starts open when nobody is expected; only open it if it's closed.
    const walkIns = page.locator("details", { has: page.locator("summary", { hasText: "Walk-ins" }) });
    if ((await walkIns.count()) && (await walkIns.getAttribute("open")) === null) await walkIns.locator("summary").click();
    await expect(page.locator('button[aria-label$="present"]').first()).toBeVisible();
  });
});
