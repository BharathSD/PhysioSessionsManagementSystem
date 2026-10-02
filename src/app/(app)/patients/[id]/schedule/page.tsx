import { ActionForm } from "@/components/action-form";
import { PlanFields } from "@/components/plan-fields";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatDate, todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { describePlan, planOn, type Plan } from "@/lib/schedule";
import { changePlan } from "../../../actions";

export const metadata = { title: "Schedule" };

export default async function SchedulePage(props: PageProps<"/patients/[id]/schedule">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);
  const { data } = await ctx.supabase.from("schedules").select("*").eq("patient_id", p.id);
  const current = planOn((data ?? []) as Plan[], today);

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=schedule`, label: p.name }}
        title={current ? "Change schedule" : "Set schedule"}
        subtitle="Which days the patient comes for sessions."
      />
      {current && (
        <div className="mb-3 rounded-2xl bg-surface-2 px-4 py-3 text-base">
          <span className="text-muted">Now: </span>
          <span className="font-medium">{describePlan(current)}</span>
          <span className="text-muted"> since {formatDate(current.valid_from)}</span>
          <p className="mt-1 text-sm text-muted">This will be kept in the history; the new schedule starts on the date you pick.</p>
        </div>
      )}
      <ActionForm action={changePlan.bind(null, p.id)} submitLabel="Save schedule" className="card space-y-5">
        <PlanFields today={today} />
      </ActionForm>
    </div>
  );
}
