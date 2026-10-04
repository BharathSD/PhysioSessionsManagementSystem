import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import type { DayOff } from "@/lib/days-off";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { removeDayOff, updateClinicDayOff } from "../../../../actions";

export const generateMetadata = titled(msg("Edit days off"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Change a clinic closure's dates or reason, or remove it. */
export default async function EditDayOffPage(props: PageProps<"/profile/days-off/[id]/edit">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const { supabase, clinic, member } = await getContext();
  if (member.role !== "owner") redirect("/profile/days-off");
  const t = await getT();
  const { data } = await supabase.from("days_off").select("*").eq("id", id).is("patient_id", null).maybeSingle();
  if (!data) notFound();
  const c = data as DayOff;
  const today = todayIn(clinic.timezone);
  const started = c.from_date < today;

  return (
    <div>
      <PageHeader back={{ href: "/profile/days-off", label: t("Days off") }} title={t("Edit days off")} subtitle={c.reason ?? t("Clinic closed")} />
      <ActionForm action={updateClinicDayOff.bind(null, c.id)} submitLabel={t("Save changes")} className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField
            name="from_date"
            label={t("First day off")}
            today={today}
            defaultValue={c.from_date}
            min={started ? c.from_date : today}
            shortcuts={started ? [] : ["today", "tomorrow"]}
            required
          />
          <DateField name="to_date" label={t("Last day off")} today={today} defaultValue={c.to_date} min={today} shortcuts={[]} required />
        </div>
        <label className="field">
          <span>
            {t("Reason")} <em>{t("(optional — shown in the message)")}</em>
          </span>
          <input name="reason" defaultValue={c.reason ?? ""} placeholder={t("e.g. Diwali, conference in Pune, family function")} />
        </label>
        <p className="text-sm text-muted">{t("If you change the dates, you'll be taken to send patients the new dates.")}</p>
      </ActionForm>

      <form action={removeDayOff.bind(null, c.id)} className="mt-4">
        <ConfirmButton className="btn w-full text-base text-muted" confirmText={t("Tap again to remove these days off")}>
          {t("Remove these days off")}
        </ConfirmButton>
      </form>
      <p className="mt-2 px-1 text-sm text-muted">{t("Removing days off brings everyone's sessions on those days back.")}</p>
    </div>
  );
}
