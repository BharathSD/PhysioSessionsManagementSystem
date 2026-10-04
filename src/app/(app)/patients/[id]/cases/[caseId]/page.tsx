import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BodyChart } from "@/components/body-chart";
import { CASE_SECTIONS } from "@/lib/case-sections";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { Icon } from "@/components/icons";
import { PainChart, TrendChart } from "@/components/pain-chart";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getBilling } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { KIND_LABEL, regionLabel, scoreLine, SCORES, type PainAssessment } from "@/lib/pain";
import { loadPatient } from "@/lib/patient";
import { STATUS } from "@/lib/status";
import type { Session } from "@/lib/types";
import { addMeasurement, deleteMeasurement, deletePainAssessment, reopenCase } from "../../../../actions";

export const generateMetadata = titled(msg("Case history"));

type Item = { session_id: string; kind: "exercise" | "treatment"; name: string; dosage: string | null; sort: number };
type Measurement = { id: string; measured_on: string; name: string; value: number; unit: string | null; notes: string | null };
type Event = { date: string; order: number; key: string; node: React.ReactNode };

const UNITS = ["°", "/5", "cm", "s", "kg", "reps"];

export default async function CasePage(props: PageProps<"/patients/[id]/cases/[caseId]">) {
  const { id, caseId } = await props.params;
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const { supabase } = ctx;
  const list = (values: string[]) => values.map((v) => t(v)).join(", ");
  const formatDate = (d: string) => t.date(d);
  const { data: c } = await supabase.from("cases").select("*").eq("id", caseId).eq("patient_id", p.id).maybeSingle();
  if (!c) notFound();
  const today = todayIn(ctx.clinic.timezone);

  const [{ typeName }, { data: sessionRows }, { data: painRows }, { data: measureRows }, { data: allNames }] = await Promise.all([
    getBilling(),
    supabase.from("sessions").select("*").eq("case_id", c.id).order("session_date", { ascending: false }),
    supabase.from("pain_assessments").select("*").eq("case_id", c.id).order("assessed_on").order("created_at"),
    supabase.from("measurements").select("*").eq("case_id", c.id).order("measured_on").order("created_at"),
    supabase.from("measurements").select("name").eq("patient_id", p.id),
  ]);
  const sessions = (sessionRows ?? []) as Session[];
  const pains = (painRows ?? []) as PainAssessment[];
  const measures = ((measureRows ?? []) as Measurement[]).map((m) => ({ ...m, value: Number(m.value) }));
  const { data: itemRows } = sessions.length
    ? await supabase.from("session_items").select("session_id, kind, name, dosage, sort").in("session_id", sessions.map((s) => s.id)).order("sort")
    : { data: [] };
  const itemsBy = new Map<string, Item[]>();
  for (const it of (itemRows ?? []) as Item[]) itemsBy.set(it.session_id, [...(itemsBy.get(it.session_id) ?? []), it]);

  const active = c.status === "active";
  const base = `/patients/${p.id}`;
  const full = pains.filter((a) => a.kind !== "session");
  const latest = full.at(-1);

  // Pain over time, per score (full assessments and session checks).
  const series = SCORES.map((s) => ({
    ...s,
    points: pains.filter((a) => a[s.key] !== null).map((a) => ({ date: a.assessed_on, score: Number(a[s.key]) })),
  })).filter((s) => s.points.length > 0);
  const quick = sessions
    .filter((s) => s.pain_score !== null && s.status === "attended")
    .map((s) => ({ date: s.session_date, score: Number(s.pain_score) }))
    .reverse();

  // Activities: first and latest rating for each.
  const activityNames = [...new Set(full.flatMap((a) => a.activities.map((x) => x.name)))];
  const activityProgress = activityNames.map((name) => {
    const rated = full.flatMap((a) => a.activities.filter((x) => x.name === name).map((x) => ({ date: a.assessed_on, score: x.score })));
    return { name, first: rated[0], last: rated.at(-1)! };
  });

  // Measurements grouped by name.
  const measureNames = [...new Set(measures.map((m) => m.name))];
  const nameSuggestions = [...new Set((allNames ?? []).map((m) => m.name as string))];

  const events: Event[] = [
    ...sessions.map((s) => {
      const items = itemsBy.get(s.id) ?? [];
      return {
        date: s.session_date,
        order: 2,
        key: `s${s.id}`,
        node: (
          <>
            <p className="font-medium">
              <span className={`chip mr-2 py-0.5 ${STATUS[s.status].className}`}>{t(STATUS[s.status].short)}</span>
              {typeName(s.visit_type_id)}
              {s.pain_score !== null && <span className="text-muted"> · {t("pain {n}/10", { n: s.pain_score })}</span>}
            </p>
            {items.length > 0 && (
              <ul className="mt-1 text-sm">
                {items.map((it, i) => (
                  <li key={i}>
                    <span className="text-muted">{it.kind === "exercise" ? "🏋 " : "⚡ "}</span>
                    {it.name}
                    {it.dosage && <span className="text-muted"> · {it.dosage}</span>}
                  </li>
                ))}
              </ul>
            )}
            {s.notes && <p className="mt-1 text-sm whitespace-pre-line text-muted">“{s.notes}”</p>}
            {s.status === "attended" && (
              <Link href={`${base}/visits/${s.id}/record`} className="mt-1 inline-block text-sm font-medium text-brand">
                {items.length || s.notes ? t("Edit session record") : t("+ Exercises & notes")}
              </Link>
            )}
          </>
        ),
      };
    }),
    ...pains.map((a) => ({
      date: a.assessed_on,
      order: 1,
      key: `p${a.id}`,
      node: (
        <p>
          <span className="font-medium">{t(KIND_LABEL[a.kind])}</span>
          <span className="block text-sm text-muted">{scoreLine(a, t) || t("No scores")}</span>
        </p>
      ),
    })),
    ...measures.map((m) => ({
      date: m.measured_on,
      order: 3,
      key: `m${m.id}`,
      node: (
        <p>
          <span className="font-medium">
            {m.name}: {m.value}
            {m.unit ?? ""}
          </span>
          {m.notes && <span className="block text-sm text-muted">{m.notes}</span>}
        </p>
      ),
    })),
    { date: c.opened_on, order: 9, key: "opened", node: <p className="font-medium">{t("Case opened")}</p> },
    ...(c.closed_on ? [{ date: c.closed_on, order: 0, key: "closed", node: <p className="font-medium">{t("Discharged")}</p> }] : []),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order);

  return (
    <div>
      <PageHeader
        back={{ href: `${base}?tab=history`, label: p.name }}
        title={c.title}
        subtitle={
          <>
            <span className={`chip mr-2 align-middle ${active ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>{active ? t("Active") : t("Discharged")}</span>
            {formatDate(c.opened_on)} – {c.closed_on ? formatDate(c.closed_on) : t("now")} ·{" "}
            {t("{n} visits", { n: sessions.filter((s) => s.status === "attended").length })}
          </>
        }
        action={
          <Link href={`${base}/cases/${c.id}/edit`} className="btn shrink-0">
            <Icon name="edit" className="size-4" /> {t("Edit")}
          </Link>
        }
      />

      {latest && latest.red_flags.length > 0 && (
        <div role="note" className="mb-3 flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad-soft p-3 text-base">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-bad" />
          <div>
            <p className="text-sm font-semibold text-bad">{t("Red flags noted ({date})", { date: formatDate(latest.assessed_on) })}</p>
            <p>{latest.red_flags.map((f) => t(f)).join(" · ")}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Link href={`${base}/pain/new?case=${c.id}&kind=${full.length ? "reassessment" : "initial"}`} className="btn btn-primary text-base">
          <Icon name="alert" /> {full.length ? t("Reassess pain") : t("Assess pain")}
        </Link>
        <a href="#measure" className="btn text-base">
          <Icon name="plus" /> {t("Measurement")}
        </a>
        {active ? (
          <Link href={`${base}/cases/${c.id}/discharge`} className="btn text-base">
            <Icon name="check" /> {t("Discharge")}
          </Link>
        ) : (
          <form action={reopenCase.bind(null, c.id, p.id)}>
            <ConfirmButton className="btn w-full text-base" confirmText={t("Reopen case?")}>
              {t("Reopen case")}
            </ConfirmButton>
          </form>
        )}
      </div>

      {/* Discharge summary */}
      {c.discharge_summary && (
        <>
          {/* After reopening, the old summary stays (there's no discharge date any more). */}
          <SectionTitle>{c.closed_on ? `${t("Discharge summary")} · ${formatDate(c.closed_on)}` : t("Earlier discharge summary")}</SectionTitle>
          <div className="card text-base whitespace-pre-line">{c.discharge_summary}</div>
        </>
      )}

      {/* Progress */}
      <SectionTitle>{t("Pain progress")}</SectionTitle>
      {series.length === 0 && quick.length === 0 ? (
        <p className="card text-base text-muted">{t("No pain recorded for this case yet. Use “Assess pain” above, or the quick score after a visit.")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {series
            .filter((s) => s.key === "at_rest" || s.key === "on_activity" || s.points.length > 1)
            .map((s) => (
              <div key={s.key} className="card">
                <p className="mb-1 text-sm font-medium text-muted">{t("Pain — {when}", { when: t(s.label) })}</p>
                <PainChart points={s.points} />
              </div>
            ))}
          {quick.length > 0 && (
            <div className="card">
              <p className="mb-1 text-sm font-medium text-muted">{t("Quick score per visit")}</p>
              <PainChart points={quick} />
            </div>
          )}
        </div>
      )}

      {activityProgress.length > 0 && (
        <>
          <SectionTitle aside={t("0 = can't do · 10 = as before")}>{t("Daily activities")}</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {activityProgress.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">{a.name}</span>
                <span className="shrink-0 text-base">
                  {a.first.score}
                  {a.last !== a.first && (
                    <>
                      {" "}
                      → <strong>{a.last.score}</strong>
                    </>
                  )}
                  <span className="text-sm text-muted">/10</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Measurements */}
      <SectionTitle>{t("Measurements")}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {measureNames.map((name) => {
          const rows = measures.filter((m) => m.name === name);
          return (
            <div key={name} className="card">
              <p className="mb-1 text-sm font-medium text-muted">{name}</p>
              <TrendChart points={rows.map((m) => ({ date: m.measured_on, score: m.value }))} unit={rows[0].unit ?? ""} what={name} emptyText="" />
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand">{t("All {n} records", { n: rows.length })}</summary>
                <ul className="mt-1 text-sm">
                  {rows.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-1">
                      <span>
                        {formatDate(m.measured_on)} · {m.value}
                        {m.unit ?? ""}
                        {m.notes ? ` · ${m.notes}` : ""}
                      </span>
                      <form action={deleteMeasurement.bind(null, m.id)}>
                        <ConfirmButton className="text-xs text-muted underline" confirmText={t("Remove?")}>
                          {t("Remove")}
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
      </div>
      <div id="measure" className="mt-3 scroll-mt-24">
        <ActionForm action={addMeasurement.bind(null, p.id, c.id)} submitLabel={t("Save measurement")} resetOnSuccess className="card space-y-3">
          <p className="text-base font-medium">{t("Add a measurement")}</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <label className="field">
              <span>{t("What")}</span>
              <input name="name" list="measure-names" required placeholder={t("e.g. Knee flexion (R)")} />
              <datalist id="measure-names">
                {nameSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>{t("Value")}</span>
              <input name="value" inputMode="decimal" required placeholder={t("e.g. 95")} />
            </label>
            <label className="field">
              <span>{t("Unit")}</span>
              <input name="unit" list="measure-units" placeholder="°" />
              <datalist id="measure-units">
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
          </div>
          <DateField name="measured_on" label={t("Date")} today={today} defaultValue={today} max={today} shortcuts={["today", "yesterday"]} />
          <label className="field">
            <span>
              {t("Note")} <em>{t("(optional)")}</em>
            </span>
            <input name="notes" placeholder={t("e.g. active, supine")} />
          </label>
        </ActionForm>
      </div>

      {/* Initial assessment */}
      <SectionTitle
        aside={
          <Link href={`${base}/cases/${c.id}/edit`} className="text-brand normal-case">
            {t("Edit")}
          </Link>
        }
      >
        {t("Initial assessment")}
      </SectionTitle>
      <div className="card space-y-3">
        {CASE_SECTIONS.every((s) => !c[s.name]) ? (
          <p className="text-base text-muted">{t("Nothing written yet.")}</p>
        ) : (
          CASE_SECTIONS.filter((s) => c[s.name]).map((s) => (
            <div key={s.name}>
              <p className="text-sm font-medium text-muted">{t(s.label)}</p>
              <p className="text-base whitespace-pre-line">{c[s.name]}</p>
            </div>
          ))
        )}
      </div>

      {/* Pain assessments */}
      {full.length > 0 && (
        <>
          <SectionTitle aside={t("{n} recorded", { n: full.length })}>{t("Pain assessments")}</SectionTitle>
          <div className="space-y-2.5">
            {[...full].reverse().map((a, i) => (
              <details key={a.id} className="card" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span>
                    <span className="block font-medium">
                      {t(KIND_LABEL[a.kind])} · {formatDate(a.assessed_on)}
                    </span>
                    <span className="block text-sm text-muted">{scoreLine(a, t) || t("No scores")}</span>
                  </span>
                  <Icon name="chevron" className="size-5 shrink-0 text-muted" />
                </summary>
                <div className="mt-3 space-y-3 border-t border-border pt-3 text-base">
                  {(a.locations.length > 0 || a.radiating.length > 0) && <BodyChart readOnly defaultLocations={a.locations} defaultRadiating={a.radiating} />}
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {[
                      [t("Type of pain"), list(a.character), false],
                      [t("Pattern"), a.pattern === "constant" ? t("Constant") : a.pattern === "intermittent" ? t("Comes and goes") : "", false],
                      [t("Worse in the…"), list(a.worse_times), false],
                      [t("Morning stiffness"), a.morning_stiffness_min !== null ? t("{n} min", { n: a.morning_stiffness_min }) : "", false],
                      [t("Worse with"), list(a.aggravating), false],
                      [t("Better with"), list(a.easing), false],
                      [t("Onset"), a.onset === "sudden" ? t("Suddenly") : a.onset === "gradual" ? t("Gradually") : "", false],
                      [t("Nerve symptoms"), list(a.nerve_symptoms), false],
                      [t("Red flags"), list(a.red_flags), true],
                      [t("Spreads to"), list(a.radiating.map(regionLabel)), false],
                    ]
                      .filter(([, v]) => v)
                      .map(([k, v, warn]) => (
                        <div key={String(k)}>
                          <dt className="text-sm text-muted">{k}</dt>
                          <dd className={warn ? "font-medium text-bad" : ""}>{v}</dd>
                        </div>
                      ))}
                  </dl>
                  {a.activities.length > 0 && (
                    <p>
                      <span className="text-sm text-muted">{t("Activities:")} </span>
                      {a.activities.map((x) => `${x.name} ${x.score}/10`).join(" · ")}
                    </p>
                  )}
                  {a.notes && <p className="whitespace-pre-line text-muted">{a.notes}</p>}
                  <form action={deletePainAssessment.bind(null, a.id)}>
                    <ConfirmButton className="text-sm text-muted underline" confirmText={t("Remove this assessment?")}>
                      {t("Remove")}
                    </ConfirmButton>
                  </form>
                </div>
              </details>
            ))}
          </div>
        </>
      )}

      {/* Timeline */}
      <SectionTitle>{t("Timeline")}</SectionTitle>
      <ol className="relative space-y-0 border-l-2 border-border pl-5">
        {events.map((e) => (
          <li key={e.key} className="relative pb-4">
            <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-surface bg-chart" />
            <p className="text-sm text-muted">{formatDate(e.date)}</p>
            <div className="text-base">{e.node}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
