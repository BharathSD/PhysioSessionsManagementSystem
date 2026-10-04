import { ActionForm } from "@/components/action-form";
import { PlanFields } from "@/components/plan-fields";
import { PageHeader } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { loadPatient } from "@/lib/patient";
import { describePlan, planOn, type Plan } from "@/lib/schedule";
import { changePlan } from "../../../actions";

export const generateMetadata = titled(msg("Schedule"));

export default async function SchedulePage(props: PageProps<"/patients/[id]/schedule">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const today = todayIn(ctx.clinic.timezone);
  const { data } = await ctx.supabase.from("schedules").select("*").eq("patient_id", p.id);
  const current = planOn((data ?? []) as Plan[], today);
  const { activeTypes } = await getBilling();

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=schedule`, label: p.name }}
        title={current ? t("Change schedule") : t("Set schedule")}
        subtitle={t("Which days the patient comes for sessions.")}
      />
      {current && (
        <div className="mb-3 rounded-2xl bg-surface-2 px-4 py-3 text-base">
          <span className="text-muted">{t("Now:")} </span>
          <span className="font-medium">{describePlan(current, t)}</span>
          <span className="text-muted"> {t("since {date}", { date: t.date(current.valid_from) })}</span>
          <p className="mt-1 text-sm text-muted">{t("This will be kept in the history; the new schedule starts on the date you pick.")}</p>
        </div>
      )}
      <ActionForm action={changePlan.bind(null, p.id)} submitLabel={t("Save schedule")} className="card space-y-5">
        <PlanFields today={today} types={activeTypes} defaultType={current?.visit_type_id ?? p.default_visit_type_id} />
      </ActionForm>
    </div>
  );
}
