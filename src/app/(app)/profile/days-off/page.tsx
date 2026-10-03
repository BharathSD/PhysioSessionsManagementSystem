import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { DateField } from "@/components/date-field";
import { Icon } from "@/components/icons";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getContext } from "@/lib/context";
import type { DayOff } from "@/lib/days-off";
import { formatDay, todayIn } from "@/lib/format";
import { addClinicDaysOff, removeDayOff } from "../../actions";

export const metadata = { title: "Days off" };

export default async function DaysOffPage() {
  const { supabase, clinic } = await getContext();
  const today = todayIn(clinic.timezone);
  const [{ data }, { data: notices }] = await Promise.all([
    supabase.from("days_off").select("*").is("patient_id", null).order("from_date"),
    supabase.from("day_off_notices").select("day_off_id"),
  ]);
  const closures = (data ?? []) as DayOff[];
  const told = new Map<string, number>();
  for (const n of notices ?? []) told.set(n.day_off_id, (told.get(n.day_off_id) ?? 0) + 1);
  const upcoming = closures.filter((c) => c.to_date >= today);
  const past = closures.filter((c) => c.to_date < today).reverse().slice(0, 10);
  const when = (c: DayOff) => (c.from_date === c.to_date ? formatDay(c.from_date) : `${formatDay(c.from_date)} – ${formatDay(c.to_date)}`);

  return (
    <div>
      <PageHeader
        back={{ href: "/profile", label: "Profile" }}
        title="Days off"
        subtitle="Clinic closed or you're away? Add the days — everyone's sessions on them are cancelled (no charge) and you can tell patients on WhatsApp."
      />

      <ActionForm action={addClinicDaysOff} submitLabel="Save and notify patients" className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField name="from_date" label="First day off" today={today} min={today} shortcuts={["today", "tomorrow"]} required />
          <DateField name="to_date" label={<span>Last day off <em>(same day if just one)</em></span>} today={today} min={today} shortcuts={[]} />
        </div>
        <label className="field">
          <span>
            Reason <em>(optional — shown in the message)</em>
          </span>
          <input name="reason" placeholder="e.g. Diwali, conference in Pune, family function" />
        </label>
      </ActionForm>

      <SectionTitle>Coming up</SectionTitle>
      {upcoming.length === 0 ? (
        <p className="card text-base text-muted">No days off planned.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {upcoming.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{when(c)}</span>
                <span className="block text-sm text-muted">
                  {c.reason ?? "Clinic closed"} · {told.get(c.id) ?? 0} patient{told.get(c.id) === 1 ? "" : "s"} told
                </span>
              </span>
              <Link href={`/profile/days-off/${c.id}/notify`} className="btn btn-whatsapp min-h-10 shrink-0 px-3 text-sm">
                <Icon name="message" className="size-4" /> Notify
              </Link>
              <form action={removeDayOff.bind(null, c.id)}>
                <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText="Remove?">
                  Remove
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 px-1 text-sm text-muted">Removing days off brings everyone&apos;s sessions on those days back.</p>

      {past.length > 0 && (
        <>
          <SectionTitle>Past</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {past.map((c) => (
              <li key={c.id} className="px-4 py-3 text-muted">
                {when(c)}
                {c.reason ? ` · ${c.reason}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
