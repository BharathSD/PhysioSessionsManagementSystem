import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { startOwnPractice } from "../team-actions";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";

export const generateMetadata = titled(msg("Welcome"));

/** For an account that isn't in any clinic (it left, or was removed). */
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: member } = await supabase.from("clinic_members").select("clinic_id").limit(1).maybeSingle();
  if (member) redirect("/");
  const t = await getT();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="card space-y-4 text-center">
        <h1 className="text-2xl font-semibold">{t("You're not part of a clinic")}</h1>
        <p className="text-base text-muted">
          {t("You left your clinic or were removed from it. Their patients stay with them. You can start your own practice, or open a new invite link from a clinic.")}
        </p>
        <form action={startOwnPractice}>
          <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText={t("Setting up…")}>
            {t("Start my own practice")}
          </SubmitButton>
        </form>
        <form action={signOut}>
          <SubmitButton className="btn min-h-12 w-full text-base" pendingText={t("Logging out…")}>
            {t("Log out")}
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
