import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { AuthForms } from "../../login/auth-forms";
import { AcceptInvite } from "./accept";

export const generateMetadata = titled(msg("Join a clinic"));

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const supabase = await createClient();
  const t = await getT();
  const [{ data: claims }, { data: info }] = await Promise.all([
    supabase.auth.getClaims(),
    /^[0-9a-f]{32}$/.test(token) ? supabase.rpc("invite_info", { invite_token: token }) : Promise.resolve({ data: null }),
  ]);
  const invite = (info as { clinic_name: string; invited_by: string; role: string }[] | null)?.[0];
  const signedIn = Boolean(claims?.claims);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-brand-fg">P</div>
        {invite ? (
          <>
            <p className="text-sm text-muted">{invite.invited_by ? t("{name} invited you to join", { name: invite.invited_by }) : t("You're invited to join")}</p>
            <h1 className="text-2xl font-semibold">{invite.clinic_name}</h1>
            <p className="mt-1 text-sm text-muted">
              {invite.role === "owner"
                ? t("on Physio Sessions, as an owner. You'll share the clinic's patients, Today list and schedule.")
                : t("on Physio Sessions, as a physio. You'll share the clinic's patients, Today list and schedule.")}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{t("This invite link has expired")}</h1>
            <p className="mt-2 text-base text-muted">{t("Links work once and for 7 days. Ask the clinic owner to send you a new one.")}</p>
          </>
        )}
      </div>

      {invite && signedIn && <AcceptInvite token={token} clinicName={invite.clinic_name} />}
      {invite && !signedIn && (
        <>
          <AuthForms invite={token} next={`/join/${token}`} startWith="signup" />
          <p className="mt-3 text-center text-sm text-muted">
            {t("Already use Physio Sessions? Choose Sign in above, then accept the invite.")}
          </p>
        </>
      )}
      {!invite && (
        <Link href="/" className="btn btn-primary min-h-12 text-base">
          {t("Go to the app")}
        </Link>
      )}
    </main>
  );
}
