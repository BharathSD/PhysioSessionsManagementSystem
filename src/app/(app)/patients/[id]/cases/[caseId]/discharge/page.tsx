import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { dischargeCase } from "../../../../../actions";

export const generateMetadata = titled(msg("Discharge"));

export default async function DischargePage(props: PageProps<"/patients/[id]/cases/[caseId]/discharge">) {
  const { id, caseId } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const { data: c } = await ctx.supabase.from("cases").select("id, title, opened_on").eq("id", caseId).eq("patient_id", p.id).maybeSingle();
  if (!c) notFound();
  const today = todayIn(ctx.clinic.timezone);

  return (
    <div>
      <PageHeader back={{ href: `/patients/${p.id}/cases/${c.id}`, label: t("Case") }} title={t("Discharge")} subtitle={c.title} />
      <p className="mb-3 rounded-2xl bg-brand-soft px-4 py-3 text-base text-brand">
        {t("Tip: record a final pain assessment first, so the summary shows how far they've come.")}{" "}
        <Link href={`/patients/${p.id}/pain/new?case=${c.id}&kind=discharge`} className="font-semibold underline">
          {t("Pain at discharge")}
        </Link>
      </p>
      <ActionForm action={dischargeCase.bind(null, c.id, p.id)} submitLabel={t("Discharge patient")} className="card space-y-4">
        <DateField name="closed_on" label={t("Discharged on")} today={today} defaultValue={today} min={c.opened_on} max={today} shortcuts={["today"]} />
        <label className="field">
          <span>{t("Discharge summary")}</span>
          <textarea
            name="discharge_summary"
            rows={6}
            placeholder={t("Outcome, goals met, final findings, home programme and advice given, follow-up if needed")}
          />
        </label>
      </ActionForm>
    </div>
  );
}
