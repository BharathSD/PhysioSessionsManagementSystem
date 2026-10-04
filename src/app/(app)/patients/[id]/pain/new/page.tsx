import { ActionForm } from "@/components/action-form";
import { ActivityRows } from "@/components/activity-rows";
import { ChipGroup, ChoiceChips, ScoreRow } from "@/components/assessment-inputs";
import { BodyChart } from "@/components/body-chart";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { AGGRAVATING, CHARACTER, EASING, KIND_LABEL, NERVE_SYMPTOMS, RED_FLAGS, WORSE_TIMES, type PainAssessment } from "@/lib/pain";
import { loadPatient } from "@/lib/patient";
import { savePainAssessment } from "../../../../actions";

export const generateMetadata = titled(msg("Pain assessment"));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A full pain assessment. Reassessments start from the previous one, so only what changed needs updating. */
export default async function NewPainAssessmentPage(props: PageProps<"/patients/[id]/pain/new">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const today = todayIn(ctx.clinic.timezone);
  const caseId = UUID.test(firstParam(sp.case)) ? firstParam(sp.case) : "";
  const kindParam = firstParam(sp.kind);
  const kind = (["initial", "reassessment", "discharge"].includes(kindParam) ? kindParam : "reassessment") as PainAssessment["kind"];

  // Start from the latest full assessment (not for an initial one).
  let previousQuery = ctx.supabase.from("pain_assessments").select("*").eq("patient_id", p.id).neq("kind", "session").order("assessed_on", { ascending: false }).limit(1);
  if (caseId) previousQuery = previousQuery.eq("case_id", caseId);
  const { data: prevRows } = await previousQuery;
  const prev = kind === "initial" ? undefined : (prevRows?.[0] as PainAssessment | undefined);
  const back = caseId ? { href: `/patients/${p.id}/cases/${caseId}`, label: t("Case") } : { href: `/patients/${p.id}?tab=history`, label: p.name };

  return (
    <div>
      <PageHeader
        back={back}
        title={t(KIND_LABEL[kind])}
        subtitle={
          prev
            ? `${p.name} · ${t("started from the {date} assessment — update what's changed", { date: t.date(prev.assessed_on) })}`
            : `${p.name} · ${t("fill in what you know; everything is optional")}`
        }
      />
      <ActionForm action={savePainAssessment.bind(null, p.id)} submitLabel={t("Save assessment")} className="space-y-4">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="case_id" value={caseId} />

        <section className="card space-y-4">
          <DateField name="assessed_on" label={t("Date")} today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} />
        </section>

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">{t("Where is the pain?")}</h2>
          <BodyChart defaultLocations={prev?.locations} defaultRadiating={prev?.radiating} />
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{t("How bad? (0 = none, 10 = worst imaginable)")}</h2>
          <ScoreRow name="at_rest" label={t("At rest")} />
          <ScoreRow name="on_activity" label={t("On activity / movement")} />
          <details className="space-y-4">
            <summary className="cursor-pointer text-sm font-medium text-brand">{t("More scores — at night, worst and best in the last 24 h")}</summary>
            <div className="mt-3 space-y-4">
              <ScoreRow name="at_night" label={t("At night")} />
              <ScoreRow name="worst_24h" label={t("Worst in the last 24 h")} />
              <ScoreRow name="best_24h" label={t("Best in the last 24 h")} />
            </div>
          </details>
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{t("What is it like?")}</h2>
          <ChipGroup name="character" legend={t("Type of pain")} options={CHARACTER} defaults={prev?.character} />
          <ChoiceChips
            name="pattern"
            legend={t("Pattern")}
            options={[
              { value: "constant", label: t("Constant") },
              { value: "intermittent", label: t("Comes and goes") },
            ]}
            defaultValue={prev?.pattern}
          />
          <ChipGroup name="worse_times" legend={t("Worse in the…")} options={WORSE_TIMES} defaults={prev?.worse_times} />
          <label className="field">
            <span>
              {t("Morning stiffness")} <em>{t("(minutes)")}</em>
            </span>
            <input name="morning_stiffness_min" type="number" inputMode="numeric" min={0} defaultValue={prev?.morning_stiffness_min ?? ""} className="max-w-32" />
          </label>
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{t("What makes it worse or better?")}</h2>
          <ChipGroup name="aggravating" legend={t("Worse with")} options={AGGRAVATING} defaults={prev?.aggravating} />
          <ChipGroup name="easing" legend={t("Better with")} options={EASING} defaults={prev?.easing} />
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{t("Onset and nerve symptoms")}</h2>
          <ChoiceChips
            name="onset"
            legend={t("How did it start?")}
            options={[
              { value: "sudden", label: t("Suddenly") },
              { value: "gradual", label: t("Gradually") },
            ]}
            defaultValue={prev?.onset}
          />
          <ChipGroup name="nerve_symptoms" legend={t("Nerve symptoms")} options={NERVE_SYMPTOMS} defaults={prev?.nerve_symptoms} />
        </section>

        <section className="card space-y-3 border-bad/30">
          <h2 className="text-lg font-semibold text-bad">{t("Red flags")}</h2>
          <p className="text-sm text-muted">{t("Anything ticked is shown as a warning at the top of the patient's page. Consider referral where appropriate.")}</p>
          <ChipGroup name="red_flags" legend={t("Present")} options={RED_FLAGS} defaults={prev?.red_flags} />
        </section>

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">{t("Effect on daily life")}</h2>
          <p className="text-sm text-muted">{t("Activities that matter to the patient, rated 0 (can't do it) to 10 (as before the problem).")}</p>
          <ActivityRows defaults={prev?.activities?.map((a) => ({ name: a.name, score: null }))} />
        </section>

        <section className="card">
          <label className="field">
            <span>{t("Notes")}</span>
            <textarea name="pain_notes" rows={3} placeholder={t("Anything else about the pain")} />
          </label>
        </section>
      </ActionForm>
    </div>
  );
}
