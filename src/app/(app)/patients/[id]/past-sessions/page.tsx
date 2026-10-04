import { ActionForm } from "@/components/action-form";
import { ChoiceWithAmount } from "@/components/choice-with-amount";
import { MultiDateField } from "@/components/multi-date-field";
import { PageHeader } from "@/components/ui";
import { VisitTypePicker } from "@/components/visit-type-picker";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { planOn, type Plan } from "@/lib/schedule";
import { addPastSessions } from "../../../actions";

export const generateMetadata = titled(msg("Add past sessions"));

export default async function PastSessionsPage(props: PageProps<"/patients/[id]/past-sessions">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const today = todayIn(ctx.clinic.timezone);
  const [{ activeTypes }, { data: sessions }, { data: plans }] = await Promise.all([
    getBilling(),
    ctx.supabase.from("sessions").select("session_date, status").eq("patient_id", p.id),
    ctx.supabase.from("schedules").select("*").eq("patient_id", p.id),
  ]);
  const existing = Object.fromEntries((sessions ?? []).map((s) => [s.session_date as string, s.status as string]));
  const plan = planOn((plans ?? []) as Plan[], today);

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=visits`, label: p.name }}
        title={t("Add past sessions")}
        subtitle={t("Fill a date range, or tap days on the calendar. You can edit any visit later from the Visits tab.")}
      />
      <ActionForm action={addPastSessions.bind(null, p.id)} submitLabel={t("Save sessions")} className="card space-y-6">
        <MultiDateField today={today} existing={existing} scheduleDays={plan?.mode === "fixed_days" ? plan.weekdays : []} />
        <VisitTypePicker types={activeTypes} label={t("These sessions were")} defaultValue={p.default_visit_type_id} />
        <ChoiceWithAmount
          legend={t("How were they paid for?")}
          name="pricing"
          amountName="fixed_amount"
          defaultValue="auto"
          options={[
            { value: "auto", label: t("Automatic"), hint: t("From the package if there is one, otherwise the fee in force on each date") },
            { value: "fixed", label: t("Same amount for each session"), hint: t("e.g. ₹500 per session, as in your notebook"), withAmount: true },
            { value: "none", label: t("No charge"), hint: t("Already settled, or free sessions") },
          ]}
        />
        <p className="text-sm text-muted">{t("Absences are never charged here — use Edit on a visit to charge one.")}</p>
      </ActionForm>
    </div>
  );
}
