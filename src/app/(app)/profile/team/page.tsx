import { headers } from "next/headers";
import { ActionForm } from "@/components/action-form";
import { CHIP } from "@/components/chip";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { PageHeader, SectionTitle, initials } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { whatsappLink } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { physioName } from "@/lib/names";
import { getTeam } from "@/lib/team";
import { cancelInvite, createInvite, leaveClinic, removeMember, setMemberRole } from "../../../team-actions";

export const generateMetadata = titled(msg("Team"));

export default async function TeamPage(props: PageProps<"/profile/team">) {
  const sp = await props.searchParams;
  const newToken = firstParam(sp.invite);
  const problem = firstParam(sp.problem);
  const { supabase, clinic, member, userId } = await getContext();
  const t = await getT();
  const { members } = await getTeam();
  const isOwner = member.role === "owner";
  const { data: invites } = isOwner
    ? await supabase.from("clinic_invites").select("id, token, role, expires_at").is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at")
    : { data: [] };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const linkFor = (token: string) => `${origin}/join/${token}`;
  const shareText = (token: string) => `${t("Join {clinic} on Physio Sessions — open this link to set up your account:", { clinic: clinic.name })}\n${linkFor(token)}`;
  const fresh = (invites ?? []).find((i) => i.token === newToken);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: t("Profile") }}
        title={t("Team")}
        subtitle={
          members.length > 1
            ? t("{n} people in {clinic}", { n: members.length, clinic: clinic.name })
            : t("Working with other physios? Invite them to share patients and the Today list.")
        }
      />

      {problem && (
        <p role="alert" className="mb-3 rounded-2xl bg-bad-soft p-3 text-base text-bad">
          {problem}
        </p>
      )}

      {fresh && (
        <div className="card mb-4 space-y-3 border-brand">
          <p className="text-base font-semibold">{t("Send this link to the physio you're inviting")}</p>
          <p className="rounded-xl bg-surface-2 p-3 font-mono text-sm break-all">{linkFor(fresh.token)}</p>
          <p className="text-sm text-muted">{t("It works once, for 7 days. They create their account (or sign in) from it and join {clinic}.", { clinic: clinic.name })}</p>
          <div className="grid grid-cols-2 gap-2">
            <a href={whatsappLink(null, shareText(fresh.token))} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp">
              <Icon name="send" /> WhatsApp
            </a>
            <CopyButton text={linkFor(fresh.token)} />
          </div>
        </div>
      )}

      <SectionTitle>{t("People")}</SectionTitle>
      <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
        {members.map((m) => {
          const me = m.user_id === userId;
          return (
            <li key={m.user_id} className="border-t border-border px-4 py-3 first:border-t-0">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">{initials(m.display_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">
                    {physioName(m)}
                    {me && <span className="text-muted"> {t("(you)")}</span>}
                  </span>
                  <span className="block text-sm text-muted">{m.role === "owner" ? t("Owner — fees, days off, team") : t("Physio")}</span>
                </span>
              </div>
              {isOwner && !me && (
                <div className="mt-2 flex flex-wrap gap-2 pl-[3.25rem]">
                  <form action={setMemberRole.bind(null, m.user_id, m.role === "owner" ? "physio" : "owner")}>
                    <ConfirmButton className="btn text-sm">
                      {m.role === "owner" ? t("Make physio") : t("Make owner")}
                    </ConfirmButton>
                  </form>
                  <form action={removeMember.bind(null, m.user_id)}>
                    <ConfirmButton className="btn text-sm text-bad" confirmText={t("Tap again to remove")}>
                      {t("Remove")}
                    </ConfirmButton>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <>
          <SectionTitle>{t("Invite a physio")}</SectionTitle>
          <ActionForm action={createInvite} submitLabel={t("Create invite link")} className="card space-y-4">
            <fieldset>
              <legend className="mb-1.5 text-base font-medium">{t("They join as")}</legend>
              <div className="flex flex-wrap gap-2">
                <label className={CHIP}>
                  <input type="radio" name="role" value="physio" defaultChecked className="sr-only" />
                  {t("Physio")}
                </label>
                <label className={CHIP}>
                  <input type="radio" name="role" value="owner" className="sr-only" />
                  {t("Owner")}
                </label>
              </div>
              <p className="mt-2 text-sm text-muted">
                {t("Physios see and treat all the clinic's patients and record visits and payments. Owners can also change fees, clinic days off and the team.")}
              </p>
            </fieldset>
          </ActionForm>

          {(invites ?? []).length > 0 && (
            <>
              <SectionTitle>{t("Waiting to join")}</SectionTitle>
              <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
                {(invites ?? []).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 first:border-t-0">
                    <span className="min-w-0 flex-1 text-base">
                      {i.role === "owner" ? t("Invite as owner") : t("Invite as physio")}
                      <span className="block text-sm text-muted">{t("Link works until {date}", { date: t.date((i.expires_at as string).slice(0, 10)) })}</span>
                    </span>
                    <a href={whatsappLink(null, shareText(i.token))} target="_blank" rel="noopener noreferrer" className="btn text-sm">
                      {t("Resend")}
                    </a>
                    <form action={cancelInvite.bind(null, i.id)}>
                      <ConfirmButton className="btn text-sm text-muted" confirmText={t("Tap again")}>
                        {t("Cancel")}
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {members.length > 1 && (
        <>
          <SectionTitle>{t("Leave")}</SectionTitle>
          <div className="card space-y-3">
            <p className="text-base text-muted">
              {t("Leaving removes your access to {clinic}. Patients and the visits you recorded stay with the clinic.", { clinic: clinic.name })}
            </p>
            <form action={leaveClinic}>
              <ConfirmButton className="btn w-full text-base text-bad" confirmText={t("Tap again to leave")}>
                {t("Leave {clinic}", { clinic: clinic.name })}
              </ConfirmButton>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
