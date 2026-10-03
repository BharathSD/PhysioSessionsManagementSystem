import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CaseFields } from "@/components/case-fields";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { updateCase } from "../../../../../actions";

export const metadata = { title: "Edit assessment" };

export default async function EditCasePage(props: PageProps<"/patients/[id]/cases/[caseId]/edit">) {
  const { id, caseId } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const { data: c } = await ctx.supabase.from("cases").select("*").eq("id", caseId).eq("patient_id", p.id).maybeSingle();
  if (!c) notFound();

  return (
    <div>
      <PageHeader back={{ href: `/patients/${p.id}/cases/${c.id}`, label: "Case" }} title="Edit assessment" subtitle={c.title} />
      <ActionForm action={updateCase.bind(null, c.id, p.id)} submitLabel="Save" className="space-y-4">
        <CaseFields today={todayIn(ctx.clinic.timezone)} defaults={c} />
      </ActionForm>
    </div>
  );
}
