import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { msg } from "@/i18n";
import { getT, titled } from "@/i18n/server";
import { loadPatient } from "@/lib/patient";
import { cancelPatientDays } from "../../../actions";

export const generateMetadata = titled(msg("Cancel days"));

/**
 * Cancel one patient's sessions in advance: the days picked on the calendar or
 * in Coming up (?dates=…), or a break between two dates (no ?dates).
 */
export default async function CancelDaysPage(props: PageProps<"/patients/[id]/cancel-days">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
  const t = await getT();
  const today = todayIn(ctx.clinic.timezone);
  const dates = firstParam(sp.dates)
    .split(",")
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today)
    .sort();
  const single = dates.length === 1;

  return (
    <div>
      <PageHeader
        back={{ href: `/patients/${p.id}`, label: p.name }}
        title={dates.length === 0 ? t("Take a break") : dates.length === 1 ? t("Cancel this day") : t("Cancel {n} days", { n: dates.length })}
        subtitle={
          dates.length
            ? dates.map((d) => t.day(d)).join(" · ")
            : t("Pause {name}'s sessions between two dates — the schedule resumes after.", { name: p.name })
        }
      />
      <ActionForm action={cancelPatientDays.bind(null, p.id)} submitLabel={dates.length ? t("Cancel sessions") : t("Save break")} className="card space-y-5">
        {dates.map((d) => (
          <input key={d} type="hidden" name="dates" value={d} />
        ))}
        {dates.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField name="from_date" label={t("From")} today={today} min={today} shortcuts={["today", "tomorrow"]} required />
            <DateField name="to_date" label={t("Until (and including)")} today={today} min={today} shortcuts={[]} required />
          </div>
        )}

        <fieldset className="field">
          <legend className="mb-1.5">{t("Who cancelled?")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "patient", label: t("The patient"), hint: t("Travelling, unwell, other plans") },
              { value: "clinic", label: t("Me / the clinic"), hint: t("I'm not available") },
            ].map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer flex-col rounded-xl border border-border bg-surface px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
              >
                <input type="radio" name="cancelled_by" value={o.value} defaultChecked={o.value === "patient"} className="sr-only" />
                <span className="text-base font-medium">{o.label}</span>
                <span className="text-sm font-normal text-muted">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>
            {t("Reason")} <em>{t("(optional)")}</em>
          </span>
          <input name="reason" placeholder={t("e.g. travelling, exams, wedding")} />
        </label>

        {single && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <input type="hidden" name="visit_type_id" value={p.default_visit_type_id ?? ""} />
            <DateField
              name="reschedule_date"
              label={
                <span>
                  {t("Book a make-up session")} <em>{t("(optional)")}</em>
                </span>
              }
              today={today}
              min={today}
              shortcuts={["tomorrow"]}
            />
          </div>
        )}

        <p className="text-sm text-muted">{t("Cancelled in advance — no charge, and no package session is used. You can restore the day later.")}</p>
      </ActionForm>
    </div>
  );
}
