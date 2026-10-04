import { expect, test, type Browser, type Page } from "@playwright/test";
import { accountFor, createAccount, deleteAccount, newLogin, seedDemo, signIn, type Account } from "./support";

// A clinic with two physios: invite link, shared patients, owner-only settings, removing someone.

test.describe.serial("clinic teams", () => {
  let owner: Account;
  let ids: Awaited<ReturnType<typeof seedDemo>>;
  let physio: Account | undefined;
  let physioPage: Page;
  const login = newLogin();

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    owner = await createAccount();
    ids = await seedDemo(owner);
    physioPage = await (await browser.newContext()).newPage();
  });
  test.afterAll(async () => {
    await physioPage.context().close();
    if (physio) {
      // After being removed they started their own practice: clean that up.
      const { data: me } = await physio.sb.auth.getUser();
      const { data: own } = await physio.sb.from("clinic_members").select("clinic_id").eq("user_id", me.user!.id).maybeSingle();
      await deleteAccount({ ...physio, clinicId: own?.clinic_id ?? physio.clinicId });
    }
    await deleteAccount(owner);
  });

  test("the owner invites a physio, who signs up from the link and joins the clinic", async ({ page }) => {
    await signIn(page, owner);
    await page.goto("/profile/team");
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.getByText("Send this link to the physio you're inviting")).toBeVisible();
    const link = (await page.locator("p.font-mono").textContent())!.trim();
    expect(link).toMatch(/\/join\/[0-9a-f]{32}$/);

    await physioPage.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(physioPage.getByRole("heading", { name: "UI Test Clinic (delete me)" })).toBeVisible();
    await physioPage.fill('input[name="full_name"]', "Kiran Rao"); // "Dr." is picked by default
    await physioPage.fill('input[name="email"]', login.email);
    await physioPage.fill('input[name="password"]', login.password);
    await physioPage.getByRole("button", { name: "Create account", exact: true }).last().click();
    await expect(physioPage).toHaveURL(/\/(\?.*)?$/);
    await expect(physioPage.locator("header")).toContainText("UI Test Clinic (delete me)");
    physio = await accountFor(login);
    expect(physio.clinicId).toBe(owner.clinicId);

    // The link worked once: it's gone from "Waiting to join", and the new physio is listed.
    await page.reload();
    await expect(page.getByText("Dr. Kiran Rao")).toBeVisible();
    await expect(page.getByText("Waiting to join")).toHaveCount(0);
  });

  test("the physio sees the clinic's patients, with My patients / Everyone", async () => {
    await physioPage.goto("/patients");
    await expect(physioPage.getByRole("link", { name: "My patients" })).toHaveAttribute("aria-current", "true");
    await expect(physioPage.getByText("Rahul Sharma")).toHaveCount(0);
    await physioPage.getByRole("link", { name: "Everyone" }).click();
    await expect(physioPage.getByText("Rahul Sharma")).toBeVisible();
    await expect(physioPage.locator("li", { hasText: "Rahul Sharma" })).toContainText("Dr. Test Physio");
  });

  test("only the owner can change clinic fees and closures", async () => {
    await physioPage.goto("/profile/fees");
    await expect(physioPage.getByText("Only the clinic owner can change the clinic's fees and visit types.")).toBeVisible();
    await expect(physioPage.getByRole("button", { name: "Add visit type" })).toHaveCount(0);
    await physioPage.goto("/profile/days-off");
    await expect(physioPage.getByRole("button", { name: "Save and notify patients" })).toHaveCount(0);
  });

  test("a visit the physio marks shows who marked it", async ({ page }) => {
    await physioPage.goto("/today?who=all");
    await physioPage.getByRole("button", { name: "Mark Suresh Patel present" }).click();
    await expect(physioPage.locator("li", { hasText: "Suresh Patel" }).first()).toContainText("Present");

    await signIn(page, owner);
    await page.goto(`/patients/${ids.suresh}?tab=visits`);
    await expect(page.getByText("by Dr. Kiran Rao")).toBeVisible();
  });

  test("the owner removes the physio, who can then start their own practice", async ({ page }) => {
    await signIn(page, owner);
    await page.goto("/profile/team");
    const row = page.locator("li", { hasText: "Dr. Kiran Rao" });
    await row.getByRole("button", { name: "Remove" }).click();
    await row.getByRole("button", { name: "Tap again to remove" }).click();
    await expect(page.getByText("Removed from the clinic")).toBeVisible();

    await physioPage.goto("/");
    await expect(physioPage).toHaveURL(/\/welcome$/);
    await physioPage.getByRole("button", { name: "Start my own practice" }).click();
    await expect(physioPage.getByText("Your practice is ready")).toBeVisible();
    await expect(physioPage.locator("header")).toContainText("Kiran Rao's Physio");
  });
});
