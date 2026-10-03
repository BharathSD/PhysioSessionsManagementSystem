import { ActionForm } from "@/components/action-form";
import { DateField } from "@/components/date-field";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { formatDay, todayIn } from "@/lib/format";
import { loadPatient } from "@/lib/patient";
import { cancelPatientDays } from "../../../actions";

export const metadata = { title: "Cancel days" };

/**
 * Cancel one patient's sessions in advance: the days picked on the calendar or
 * in Coming up (?dates=…), or a break between two dates (no ?dates).
 */
export default async function CancelDaysPage(props: PageProps<"/patients/[id]/cancel-days">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const ctx = await getContext();
  const p = await loadPatient(ctx, id);
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
        title={dates.length ? `Cancel ${dates.length === 1 ? "this day" : `${dates.length} days`}` : "Take a break"}
        subtitle={dates.length ? dates.map(formatDay).join(" · ") : `Pause ${p.name}'s sessions between two dates — the schedule resumes after.`}
      />
      <ActionForm action={cancelPatientDays.bind(null, p.id)} submitLabel={dates.length ? "Cancel sessions" : "Save break"} className="card space-y-5">
        {dates.map((d) => (
          <input key={d} type="hidden" name="dates" value={d} />
        ))}
        {dates.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField name="from_date" label="From" today={today} min={today} shortcuts={["today", "tomorrow"]} required />
            <DateField name="to_date" label="Until (and including)" today={today} min={today} shortcuts={[]} required />
          </div>
        )}

        <fieldset className="field">
          <legend className="mb-1.5">Who cancelled?</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "patient", label: "The patient", hint: "Travelling, unwell, other plans" },
              { value: "clinic", label: "Me / the clinic", hint: "I'm not available" },
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
            Reason <em>(optional)</em>
          </span>
          <input name="reason" placeholder="e.g. travelling, exams, wedding" />
        </label>

        {single && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <input type="hidden" name="visit_type_id" value={p.default_visit_type_id ?? ""} />
            <DateField
              name="reschedule_date"
              label={
                <span>
                  Book a make-up session <em>(optional)</em>
                </span>
              }
              today={today}
              min={today}
              shortcuts={["tomorrow"]}
            />
          </div>
        )}

        <p className="text-sm text-muted">Cancelled in advance — no charge, and no package session is used. You can restore the day later.</p>
      </ActionForm>
    </div>
  );
}
