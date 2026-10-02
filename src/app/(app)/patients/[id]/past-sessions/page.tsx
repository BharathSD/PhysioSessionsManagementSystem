import { ActionForm } from "@/components/action-form";
import { MultiDateField } from "@/components/multi-date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import type { SessionStatus } from "@/lib/types";
import { addPastSessions } from "../../../actions";

export const metadata = { title: "Add past sessions" };

export default async function PastSessionsPage(props: PageProps<"/patients/[id]/past-sessions">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const today = todayIn(ctx.clinic.timezone);
  const { data } = await ctx.supabase.from("sessions").select("session_date, status").eq("patient_id", p.id);
  const existing = Object.fromEntries((data ?? []).map((s) => [s.session_date as string, s.status as SessionStatus]));

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=visits`, label: p.name }}
        title="Add past sessions"
        subtitle="Forgot to mark a day, or copying from your notebook? Tap the dates."
      />
      <ActionForm action={addPastSessions.bind(null, p.id)} submitLabel="Save sessions" className="card space-y-5">
        <MultiDateField today={today} existing={existing} />
      </ActionForm>
    </div>
  );
}
