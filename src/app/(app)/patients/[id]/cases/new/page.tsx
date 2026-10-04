import { ActionForm } from "@/components/action-form";
import { CaseFields } from "@/components/case-fields";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { openCase } from "../../../../actions";

export const generateMetadata = titled(msg("New case"));

export default async function NewCasePage(props: PageProps<"/patients/[id]/cases/new">) {
  const { id } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const { data: details } = await ctx.supabase.from("patients").select("goals, injury_date").eq("id", p.id).maybeSingle();

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}?tab=history`, label: p.name }}
        title={t("New case")}
        subtitle={t("One case per problem or course of treatment. Visits from its start date are filed under it.")}
      />
      <ActionForm action={openCase.bind(null, p.id)} submitLabel={t("Open case and assess pain")} className="space-y-4">
        <CaseFields today={todayIn(ctx.clinic.timezone)} defaults={{ title: p.condition ?? "", goals: details?.goals ?? null }} />
        <input type="hidden" name="then" value="pain" />
        <p className="px-1 text-sm text-muted">{t("Next you'll record the initial pain assessment (you can skip any part of it).")}</p>
      </ActionForm>
    </div>
  );
}
