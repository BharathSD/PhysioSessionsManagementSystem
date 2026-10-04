import { ActionForm } from "@/components/action-form";
import { DesignationPicker } from "@/components/designation-picker";
import { Icon } from "@/components/icons";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { LinkRow, SectionTitle, initials } from "@/components/ui";
import { getContext } from "@/lib/context";
import { physioName } from "@/lib/names";
import { countryOptions } from "@/lib/phone";
import { LanguagePicker } from "@/components/language-picker";
import { getT } from "@/i18n/server";
import { signOut } from "../../login/actions";
import { setLanguage, updateSettings } from "../actions";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Profile") };
}

export default async function ProfilePage() {
  const { clinic, member, email } = await getContext();
  const t = await getT();
  const isOwner = member.role === "owner";

  return (
    <div>
      {/* Who's signed in */}
      <div className="mb-2 flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-semibold text-brand-fg">
          {initials(member.display_name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[1.65rem] leading-tight font-semibold">{physioName(member)}</h1>
          <p className="truncate text-base text-muted">{email}</p>
          <p className="truncate text-sm text-muted">{clinic.name}</p>
        </div>
      </div>

      {/* Always shown in both languages, so it can be found whichever is on. */}
      <SectionTitle>Language · भाषा</SectionTitle>
      <div className="card space-y-2">
        <LanguagePicker current={t.locale} action={setLanguage} />
        <p className="text-sm text-muted">{t("Each patient's WhatsApp messages use the language set on their details.")}</p>
      </div>

      <SectionTitle>{t("Team")}</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/team" icon="patients" title={t("Team")} detail={t("Invite physios to share patients and the Today list")} />
      </div>

      <SectionTitle>{t("Money")}</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/fees" icon="rupee" title={t("Fees & visit types")} detail={t("In-clinic, home visit, online… and no-show fees")} />
      </div>

      <SectionTitle>{t("Treatment")}</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/exercises" icon="history" title={t("Exercises & treatments")} detail={t("Your own list for session records")} />
      </div>

      <SectionTitle>{t("Availability")}</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow
          href="/profile/days-off"
          icon="calendar"
          title={t("Days off")}
          detail={t("Clinic closed or you're away — cancel everyone's sessions and notify them")}
        />
      </div>

      <SectionTitle>{t("Help")}</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/help" icon="message" title={t("Help & feedback")} detail={t("Report a problem, suggest an idea, or chat with us")} />
      </div>

      <SectionTitle>{t("Security")}</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/reset-password" icon="edit" title={t("Change password")} detail={email} />
      </div>

      <ActionForm action={updateSettings} submitLabel={t("Save changes")} className="space-y-1">
        <SectionTitle>{t("Your details")}</SectionTitle>
        <div className="card space-y-4">
          <DesignationPicker defaultValue={member.designation} />
          <label className="field">
            <span>
              {t("Your name")} <em>{t("(receipts end with “– {name}”)", { name: physioName(member) })}</em>
            </span>
            <input name="display_name" required defaultValue={member.display_name} />
          </label>
        </div>

        <SectionTitle>{t("Clinic")}</SectionTitle>
        <div className="card space-y-4">
          <label className="field">
            <span>{t("Clinic / practice name")}</span>
            <input name="clinic_name" required defaultValue={clinic.name} disabled={!isOwner} />
          </label>
          <label className="field">
            <span>
              {t("UPI ID")} <em>{t("(added to receipts when money is due)")}</em>
            </span>
            <input name="upi_id" placeholder="yourname@okhdfcbank" defaultValue={clinic.upi_id ?? ""} disabled={!isOwner} />
          </label>
          <label className="field">
            <span>
              {t("Country")} <em>{t("(default for phone numbers)")}</em>
            </span>
            <select name="country" defaultValue={clinic.country} disabled={!isOwner}>
              {countryOptions(clinic.country, t.locale).map((c) => (
                <option key={c.code} value={c.code} suppressHydrationWarning>
                  {c.flag} {c.name} ({c.dial})
                </option>
              ))}
            </select>
          </label>
          {isOwner && (
            <PhoneField
              label={
                <span>
                  {t("Clinic phone")} <em>{t("(optional)")}</em>
                </span>
              }
              clinicCountry={clinic.country}
              defaultPhone={clinic.phone}
            />
          )}
        </div>
        <div className="pt-4" />
      </ActionForm>

      <SectionTitle>{t("Use it like an app")}</SectionTitle>
      <div className="card space-y-3 text-base">
        <div className="flex gap-3">
          <Icon name="install" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>
            <strong>Android (Chrome):</strong> {t("tap the ⋮ menu, then Add to Home screen.")}
          </p>
        </div>
        <div className="flex gap-3">
          <Icon name="install" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>
            <strong>iPhone (Safari):</strong> {t("tap Share ⬆︎, then Add to Home Screen.")}
          </p>
        </div>
      </div>

      <form action={signOut} className="mt-8">
        <SubmitButton className="btn min-h-12 w-full border-bad/40 text-base text-bad" pendingText={t("Logging out…")}>
          <Icon name="logout" /> {t("Log out")}
        </SubmitButton>
      </form>
    </div>
  );
}
