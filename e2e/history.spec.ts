import { expect, test } from "@playwright/test";
import { createAccount, day, deleteAccount, dmy, fillDate, seedDemo, signIn, type Account } from "./support";

test.describe.serial("case history: assessment, pain, measurements, session records, discharge", () => {
  let acct: Account;
  let ids: Awaited<ReturnType<typeof seedDemo>>;
  let caseUrl = "";
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

  test("open a case and record the initial pain assessment with the body chart", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}?tab=history`);
    await expect(page.getByText("No case history yet")).toBeVisible();
    await page.getByRole("link", { name: "New case" }).click();

    await page.fill('input[name="title"]', "Right knee — ACL reconstruction");
    await fillDate(page, "Started on", day(-21));
    await page.fill('textarea[name="chief_complaint"]', "Pain climbing stairs");
    await page.fill('textarea[name="diagnosis"]', "Post-op ACL reconstruction, R knee");
    await page.getByRole("button", { name: "Open case and assess pain" }).click();

    await expect(page.getByRole("heading", { name: "Initial assessment" })).toBeVisible();
    await page.getByRole("button", { name: "Right knee", exact: true }).click(); // pain
    const calf = page.getByRole("button", { name: /^Right calf/ });
    await calf.click();
    await calf.click(); // second tap = radiating
    await expect(page.getByText("↝ Right calf")).toBeVisible();
    await page.locator("label", { has: page.getByLabel("At rest: 6 out of 10") }).click();
    await page.locator("label", { has: page.getByLabel("On activity / movement: 8 out of 10") }).click();
    await page.locator("label", { hasText: /^Sharp$/ }).click();
    await page.locator("label", { hasText: /^Stairs$/ }).click();
    await page.locator("label", { hasText: "Night pain not eased by rest or position" }).click();
    await page.getByLabel("Activity", { exact: true }).first().fill("Climbing stairs");
    await page.getByLabel("Score out of 10", { exact: true }).first().selectOption("3");
    await page.getByRole("button", { name: "Save assessment" }).click();

    await expect(page.getByText("Pain assessment saved")).toBeVisible();
    caseUrl = page.url().split("?")[0];
    await expect(page.getByRole("heading", { name: "Right knee — ACL reconstruction" })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "Night pain not eased" })).toBeVisible(); // red flag
    // Earlier visits since the case started are filed under it.
    await expect(page.getByText(/\d+ visits/)).toBeVisible();
  });

  test("the red flag also shows on the patient page", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}`);
    await expect(page.getByRole("note").filter({ hasText: "Red flags" })).toBeVisible();
  });

  test("a reassessment starts from the last one and shows progress", async ({ page }) => {
    await page.goto(caseUrl);
    await page.getByRole("link", { name: "Reassess pain" }).click();
    await expect(page.getByRole("heading", { name: "Reassessment" })).toBeVisible();
    await expect(page.getByText("● Right knee")).toBeVisible(); // body chart pre-filled
    await expect(page.getByLabel("Activity", { exact: true }).first()).toHaveValue("Climbing stairs");
    await page.locator("label", { has: page.getByLabel("At rest: 2 out of 10") }).click();
    await page.locator("label", { has: page.getByLabel("On activity / movement: 4 out of 10") }).click();
    await page.locator("label", { hasText: "Night pain not eased by rest or position" }).click(); // no longer present
    await page.getByLabel("Score out of 10", { exact: true }).first().selectOption("7");
    await page.getByRole("button", { name: "Save assessment" }).click();

    await expect(page.getByText("Pain assessment saved")).toBeVisible();
    await expect(page.getByText("6 → 2")).toBeVisible();
    await expect(page.getByText("8 → 4")).toBeVisible();
    await expect(page.locator("li", { hasText: "Climbing stairs" })).toContainText("3 → 7");
    await expect(page.getByRole("note").filter({ hasText: "Red flags" })).toHaveCount(0);
    await expect(page.getByText("2 recorded")).toBeVisible(); // both assessments kept
  });

  test("measurements show progress", async ({ page }) => {
    await page.goto(caseUrl);
    for (const [value, date] of [
      ["60", day(-14)],
      ["95", day(0)],
    ]) {
      await page.fill('input[name="name"]', "Knee flexion (R)");
      await page.fill('input[name="value"]', value);
      await page.fill('input[name="unit"]', "°");
      await page.locator("#measure").locator('input[placeholder="DD/MM/YYYY"]').fill(dmy(date));
      await page.getByRole("button", { name: "Save measurement" }).click();
      await expect(page.getByText("Knee flexion (R) saved")).toBeVisible();
    }
    await expect(page.getByText("60° → 95°")).toBeVisible();
  });

  test("a session record: exercises and treatments (added to the list), notes and a pain check", async ({ page }) => {
    // Record an earlier visit (9 days ago).
    const { data } = await acct.sb.from("sessions").select("id").eq("patient_id", ids.rahul).eq("session_date", day(-9)).single();
    await page.goto(`/patients/${ids.rahul}/visits/${data!.id}/record`);
    await expect(page.getByRole("heading", { name: "Session record" })).toBeVisible();

    await page.getByRole("button", { name: "+ Add an exercise" }).click();
    await page.getByLabel("Exercises name").fill("Straight leg raise");
    await page.getByLabel("Dosage").first().fill("3 × 10");
    await page.getByRole("button", { name: "+ Add a treatment" }).click();
    await page.getByLabel("Treatments name").fill("IFT");
    await page.getByLabel("Dosage").nth(1).fill("10 min");
    await page.fill('textarea[name="notes"]', "Good quad activation");
    await page.getByText("Pain check (optional)").click();
    await page.locator("label", { has: page.getByLabel("Before the session: 6 out of 10") }).click();
    await page.locator("label", { has: page.getByLabel("After the session: 3 out of 10") }).click();
    await page.getByRole("button", { name: "Save session record" }).click();

    await expect(page.getByText("Session record saved")).toBeVisible();
    await expect(page.getByText("Straight leg raise · IFT")).toBeVisible();

    await page.goto("/profile/exercises");
    await expect(page.getByText("Straight leg raise")).toBeVisible();
    await expect(page.getByText("IFT", { exact: true })).toBeVisible();

    await page.goto(caseUrl);
    await expect(page.getByText("“Good quad activation”")).toBeVisible(); // in the timeline
    await expect(page.getByText("Before session 6 · After session 3")).toBeVisible(); // the session's pain check, in the timeline
  });

  test("today's record can copy the last one with 'Same as last time'", async ({ page }) => {
    await page.goto(`/patients/${ids.rahul}`);
    await page.getByRole("button", { name: "Present" }).first().click();
    await page.getByRole("link", { name: "Add exercises & notes" }).click();
    await page.getByRole("button", { name: /Same as last time \(2 items\)/ }).click();
    await expect(page.getByLabel("Exercises name")).toHaveValue("Straight leg raise");
    await expect(page.getByLabel("Treatments name")).toHaveValue("IFT");
    await page.getByRole("button", { name: "Save session record" }).click();
    await expect(page.getByText("Session record saved")).toBeVisible();
    await expect(page.getByText("Straight leg raise · IFT")).toHaveCount(2);
  });

  test("discharge, then reopen", async ({ page }) => {
    await page.goto(caseUrl);
    await page.getByRole("link", { name: "Discharge" }).click();
    await page.fill('textarea[name="discharge_summary"]', "Goals met. Independent with home programme.");
    await page.getByRole("button", { name: "Discharge patient" }).click();
    await expect(page.getByText("Patient discharged")).toBeVisible();
    await expect(page.getByText("Discharged", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Goals met. Independent with home programme.")).toBeVisible();

    await page.getByRole("button", { name: "Reopen case" }).click();
    await page.getByRole("button", { name: "Reopen case?" }).click();
    await expect(page.getByText("Case reopened")).toBeVisible();
  });
});
