import { ActionForm } from "@/components/action-form";
import { DesignationPicker } from "@/components/designation-picker";
import { Icon } from "@/components/icons";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { LinkRow, SectionTitle, initials } from "@/components/ui";
import { getContext } from "@/lib/context";
import { physioName } from "@/lib/names";
import { countryOptions } from "@/lib/phone";
import { signOut } from "../../login/actions";
import { updateSettings } from "../actions";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { clinic, member, email } = await getContext();
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

      <SectionTitle>Money</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/fees" icon="rupee" title="Fees & visit types" detail="In-clinic, home visit, online… and no-show fees" />
      </div>

      <SectionTitle>Treatment</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/exercises" icon="history" title="Exercises & treatments" detail="Your own list for session records" />
      </div>

      <SectionTitle>Availability</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/profile/days-off" icon="calendar" title="Days off" detail="Clinic closed or you're away — cancel everyone's sessions and notify them" />
      </div>

      <SectionTitle>Security</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <LinkRow href="/reset-password" icon="edit" title="Change password" detail={email} />
      </div>

      <ActionForm action={updateSettings} submitLabel="Save changes" className="space-y-1">
        <SectionTitle>Your details</SectionTitle>
        <div className="card space-y-4">
          <DesignationPicker defaultValue={member.designation} />
          <label className="field">
            <span>
              Your name <em>(receipts end with “– {physioName(member)}”)</em>
            </span>
            <input name="display_name" required defaultValue={member.display_name} />
          </label>
        </div>

        <SectionTitle>Clinic</SectionTitle>
        <div className="card space-y-4">
          <label className="field">
            <span>Clinic / practice name</span>
            <input name="clinic_name" required defaultValue={clinic.name} disabled={!isOwner} />
          </label>
          <label className="field">
            <span>
              UPI ID <em>(added to receipts when money is due)</em>
            </span>
            <input name="upi_id" placeholder="yourname@okhdfcbank" defaultValue={clinic.upi_id ?? ""} disabled={!isOwner} />
          </label>
          <label className="field">
            <span>
              Country <em>(default for phone numbers)</em>
            </span>
            <select name="country" defaultValue={clinic.country} disabled={!isOwner}>
              {countryOptions(clinic.country).map((c) => (
                <option key={c.code} value={c.code} suppressHydrationWarning>
                  {c.flag} {c.name} ({c.dial})
                </option>
              ))}
            </select>
          </label>
          {isOwner && (
            <PhoneField label={<span>Clinic phone <em>(optional)</em></span>} clinicCountry={clinic.country} defaultPhone={clinic.phone} />
          )}
        </div>
        <div className="pt-4" />
      </ActionForm>

      <SectionTitle>Use it like an app</SectionTitle>
      <div className="card space-y-3 text-base">
        <div className="flex gap-3">
          <Icon name="install" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>
            <strong>Android (Chrome):</strong> tap the ⋮ menu, then <em>Add to Home screen</em>.
          </p>
        </div>
        <div className="flex gap-3">
          <Icon name="install" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p>
            <strong>iPhone (Safari):</strong> tap Share ⬆︎, then <em>Add to Home Screen</em>.
          </p>
        </div>
      </div>

      <form action={signOut} className="mt-8">
        <SubmitButton className="btn min-h-12 w-full border-bad/40 text-base text-bad" pendingText="Logging out…">
          <Icon name="logout" /> Log out
        </SubmitButton>
      </form>
    </div>
  );
}
