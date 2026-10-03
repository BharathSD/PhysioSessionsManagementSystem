import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { toSummary } from "@/lib/data";
import { datesBetween, isOffFor, type DayOff } from "@/lib/days-off";
import { formatDay, whatsappLink } from "@/lib/format";
import { closureNotice } from "@/lib/messages";
import { isActiveOn, isScheduledDay, nextVisit, type Plan } from "@/lib/schedule";
import { NotifyButton } from "./notify-button";

export const metadata = { title: "Notify patients" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who a clinic closure affects, with a one-tap WhatsApp message for each.
 * (Sending is manual: WhatsApp doesn't let apps send from a personal number.)
 */
export default async function NotifyPage(props: PageProps<"/profile/days-off/[id]/notify">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const { supabase, clinic, member } = await getContext();
  const { data: closure } = await supabase.from("days_off").select("*").eq("id", id).is("patient_id", null).maybeSingle();
  if (!closure) notFound();
  const c = closure as DayOff;

  const [{ data: rows }, { data: plans }, { data: bookings }, { data: offs }, { data: notices }] = await Promise.all([
    supabase.from("patient_summary").select("*").eq("archived", false).order("name"),
    supabase.from("schedules").select("*").or(`valid_until.is.null,valid_until.gte.${c.from_date}`),
    supabase.from("appointments").select("patient_id, scheduled_date").eq("status", "booked").gte("scheduled_date", c.from_date),
    supabase.from("days_off").select("*").gte("to_date", c.from_date),
    supabase.from("day_off_notices").select("patient_id").eq("day_off_id", id),
  ]);
  const daysOff = (offs ?? []) as DayOff[];
  const told = new Set((notices ?? []).map((n) => n.patient_id as string));
  const days = datesBetween(c.from_date, c.to_date);
  const sender = { clinic, physioName: member.display_name };

  const affected = (rows ?? []).map(toSummary).flatMap((p) => {
    const own = ((plans ?? []) as Plan[]).filter((pl) => pl.patient_id === p.id);
    const booked = (bookings ?? []).filter((b) => b.patient_id === p.id).map((b) => b.scheduled_date as string);
    // Days in the closure this patient would have come (not already off for their own reasons).
    const ownOff = isOffFor(daysOff.filter((d) => d.patient_id === p.id), p.id);
    const lost = days.filter((d) => !ownOff(d) && (booked.includes(d) || own.some((pl) => isActiveOn(pl, d) && isScheduledDay(pl, d))));
    const flexible = own.some((pl) => pl.mode === "flexible" && isActiveOn(pl, c.from_date));
    if (lost.length === 0 && !flexible) return [];
    const next = nextVisit(own.find((pl) => isActiveOn(pl, c.to_date)), booked, c.to_date, isOffFor(daysOff, p.id));
    return [{ p, lost, flexible: lost.length === 0, next }];
  });
  const toldCount = affected.filter((a) => told.has(a.p.id)).length;
  const when = c.from_date === c.to_date ? formatDay(c.from_date) : `${formatDay(c.from_date)} – ${formatDay(c.to_date)}`;

  return (
    <div>
      <PageHeader
        back={{ href: "/profile/days-off", label: "Days off" }}
        title="Notify patients"
        subtitle={`${when}${c.reason ? ` · ${c.reason}` : ""}`}
      />

      {affected.length === 0 ? (
        <p className="card text-base text-muted">No patients have sessions on these days — nobody needs to be told.</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-base text-brand">
            <span>
              <strong>{toldCount}</strong> of {affected.length} told
            </span>
            <span className="text-sm">Tap Send, then come back for the next one</span>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {affected.map(({ p, lost, flexible, next }) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-sm text-muted">
                    {flexible ? "Comes on days they choose" : `Cancelled: ${lost.map(formatDay).join(", ")}`}
                  </span>
                </span>
                {p.phone ? (
                  <NotifyButton
                    href={whatsappLink(p.phone, closureNotice(p.name, c, lost, next, sender))}
                    dayOffId={c.id}
                    patientId={p.id}
                    told={told.has(p.id)}
                  />
                ) : (
                  <Link href={`/patients/${p.id}/edit`} className="btn min-h-11 shrink-0 px-3 text-sm text-muted">
                    Add phone
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 px-1 text-sm text-muted">
            Messages open in your WhatsApp ready to send. Sending automatically from a clinic number needs the WhatsApp Business API — a later upgrade.
          </p>
        </>
      )}
      <Link href="/" className="btn mt-4 w-full text-base">
        Done
      </Link>
    </div>
  );
}
