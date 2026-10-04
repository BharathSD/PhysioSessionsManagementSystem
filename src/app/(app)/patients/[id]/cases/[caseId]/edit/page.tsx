import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { CaseFields } from "@/components/case-fields";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { updateCase } from "../../../../../actions";

export const generateMetadata = titled(msg("Edit assessment"));

export default async function EditCasePage(props: PageProps<"/patients/[id]/cases/[caseId]/edit">) {
  const { id, caseId } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const { data: c } = await ctx.supabase.from("cases").select("*").eq("id", caseId).eq("patient_id", p.id).maybeSingle();
  if (!c) notFound();

  return (
    <div>
      <PageHeader back={{ href: `/patients/${p.id}/cases/${c.id}`, label: t("Case") }} title={t("Edit assessment")} subtitle={c.title} />
      <ActionForm action={updateCase.bind(null, c.id, p.id)} submitLabel={t("Save")} className="space-y-4">
        <CaseFields today={todayIn(ctx.clinic.timezone)} defaults={c} />
      </ActionForm>
    </div>
  );
}
