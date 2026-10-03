import Link from "next/link";
import { BalanceChips } from "@/components/balance";
import { Icon } from "@/components/icons";
import { QuickPain } from "@/components/pain";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { VisitCost } from "@/components/visit-cost";
import { getBilling } from "@/lib/billing";
import { getBoard, type BoardRow } from "@/lib/board";
import { getContext } from "@/lib/context";
import { patientName, physioName } from "@/lib/names";
import { firstParam } from "@/lib/data";
import { canChargeMiss } from "@/lib/fees";
import { formatDate, todayIn, whatsappLink } from "@/lib/format";
import { sessionReceipt } from "@/lib/messages";
import { describeOff } from "@/lib/days-off";
import { STATUS } from "@/lib/status";
import type { Clinic, Rate } from "@/lib/types";
import { deleteSession, markToday } from "../actions";

export const metadata = { title: "Today" };

type RowContext = {
  sender: { clinic: Clinic; physioName: string };
  addresses: Map<string, string>;
  rates: Rate[];
  typeName: (id: string | null | undefined) => string;
  today: string;
};

export default async function TodayPage(props: PageProps<"/today">) {
  const q = firstParam((await props.searchParams).q);
  const ctx = await getContext();
  const today = todayIn(ctx.clinic.timezone);
  const [{ expected, others, offToday, clinicClosed, seen }, { rates, typeName }, { data: withAddress }] = await Promise.all([
    getBoard(ctx, today, q),
    getBilling(),
    ctx.supabase.from("patients").select("id, address").eq("archived", false).not("address", "is", null),
  ]);
  const rc: RowContext = {
    sender: { clinic: ctx.clinic, physioName: physioName(ctx.member) },
    addresses: new Map((withAddress ?? []).map((r) => [r.id as string, r.address as string])),
    rates,
    typeName,
    today,
  };
  const done = expected.filter((r) => r.session).length;

  return (
    <div>
      <PageHeader title="Today" subtitle={`${formatDate(today)} · ${seen} seen`} />

      {clinicClosed && (
        <div className="mb-3 flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-base">
          <Icon name="ban" className="mt-0.5 size-5 shrink-0 text-warn" />
          <span className="flex-1">
            <span className="block font-semibold text-warn">Clinic closed today{clinicClosed.reason ? ` · ${clinicClosed.reason}` : ""}</span>
            <span className="block text-sm text-muted">Scheduled sessions are cancelled. You can still mark anyone who comes.</span>
          </span>
          <Link href="/profile/days-off" className="text-sm font-medium text-brand">
            Change
          </Link>
        </div>
      )}

      <form role="search" className="relative mb-2">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Find a patient…"
          className="min-h-12 w-full rounded-2xl border border-border bg-surface pr-20 pl-11 text-base outline-none focus:border-brand"
        />
        {q && (
          <Link href="/today" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-xl px-3 py-2 text-sm text-brand">
            Clear
          </Link>
        )}
      </form>

      {expected.length + others.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={q ? `No patient called “${q}”` : "No patients yet"}>
            {!q && (
              <Link href="/patients/new" className="btn btn-primary mt-2">
                <Icon name="plus" /> Add your first patient
              </Link>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          <SectionTitle aside={expected.length > 0 ? `${done} of ${expected.length} marked` : undefined}>Expected today</SectionTitle>
          {expected.length === 0 ? (
            <p className="card text-base text-muted">No one is scheduled today. Patients with a schedule or a booking will appear here.</p>
          ) : (
            <ul className="space-y-2.5">
              {expected.map((r) => (
                <PatientRow key={r.p.id} row={r} rc={rc} />
              ))}
            </ul>
          )}

          {offToday.length > 0 && (
            <>
              <SectionTitle>Off today (cancelled in advance)</SectionTitle>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {offToday.map((r) => (
                  <li key={r.p.id}>
                    <Link href={`/patients/${r.p.id}`} className="flex items-center gap-3 px-4 py-3">
                      <Icon name="ban" className="size-5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{patientName(r.p)}</span>
                        <span className="block text-sm text-muted">{r.off && describeOff(r.off)}</span>
                      </span>
                      <Icon name="chevron" className="size-5 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {others.length > 0 && (
            <details className="group" open={Boolean(q) || expected.length === 0}>
              <summary className="mt-7 mb-2.5 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-1 text-sm font-semibold tracking-wide text-muted uppercase">
                <span>Walk-ins & others ({others.length})</span>
                <span className="text-brand normal-case group-open:hidden">Show</span>
                <span className="hidden text-brand normal-case group-open:inline">Hide</span>
              </summary>
              <ul className="space-y-2.5">
                {others.map((r) => (
                  <PatientRow key={r.p.id} row={r} rc={rc} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function PatientRow({ row, rc }: { row: BoardRow; rc: RowContext }) {
  const { p, session, expected, next, visitTypeId } = row;
  const status = session ? STATUS[session.status] : null;
  const sessionType = session?.visit_type_id ?? visitTypeId;
  // Home visits show where to go.
  const address = /home/i.test(rc.typeName(sessionType)) ? rc.addresses.get(p.id) : undefined;

  return (
    <li className="card">
      <Link href={`/patients/${p.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{patientName(p)}</p>
            <p className="text-sm text-muted">
              {/* Once marked, the visit type is shown with its cost below. */}
              {[session ? null : rc.typeName(sessionType), expected?.label].filter(Boolean).join(" · ")}
            </p>
          </div>
          {status && (
            <span className={`chip shrink-0 gap-1 py-1 text-sm ${status.className}`}>
              <Icon name={status.icon} className="size-4" />
              {status.short}
            </span>
          )}
        </div>
        {!session && (
          <div className="mt-2">
            <BalanceChips p={p} currency={rc.sender.clinic.currency} />
          </div>
        )}
      </Link>
      {address && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">📍 {address}</span>
          <span className="shrink-0 font-medium text-brand">Maps</span>
        </a>
      )}

      {!session ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
            <form action={markToday.bind(null, p.id, "missed", visitTypeId)}>
              <SubmitButton className="btn btn-bad w-full text-base" aria-label={`Mark ${p.name} absent`}>
                <Icon name="x" /> Absent
              </SubmitButton>
            </form>
            <form action={markToday.bind(null, p.id, "attended", visitTypeId)}>
              <SubmitButton className="btn btn-ok w-full text-base" aria-label={`Mark ${p.name} present`}>
                <Icon name="check" /> Present
              </SubmitButton>
            </form>
          </div>
          <Link
            href={`/patients/${p.id}/attendance`}
            className="mt-2 flex min-h-10 items-center justify-center gap-1 text-sm font-medium text-brand"
          >
            Cancelled, rescheduled or different visit type?
            <Icon name="chevron" className="size-4" />
          </Link>
        </>
      ) : (
        <>
          <div className="mt-2">
            <VisitCost
              session={session}
              typeName={rc.typeName(session.visit_type_id)}
              currency={rc.sender.clinic.currency}
              canCharge={canChargeMiss(rc.rates, {
                patientId: p.id,
                sessionsLeft: p.sessions_left,
                status: session.status,
                visitTypeId: session.visit_type_id,
                date: rc.today,
              })}
            />
          </div>
          {session.status === "attended" && (
            <div className="mt-3">
              <QuickPain sessionId={session.id} score={session.pain_score} editHref={`/patients/${p.id}/visits/${session.id}`} />
              <Link href={`/patients/${p.id}/visits/${session.id}/record`} className="mt-2 inline-block text-sm font-medium text-brand">
                + Exercises &amp; notes
              </Link>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {p.phone ? (
              <a
                href={whatsappLink(p.phone, sessionReceipt(p, session, rc.sender, next, rc.typeName(session.visit_type_id)))}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp flex-1 text-base"
              >
                <Icon name="message" /> Send receipt
              </a>
            ) : (
              <Link href={`/patients/${p.id}/edit`} className="btn flex-1 text-muted">
                Add phone number to send receipt
              </Link>
            )}
            <form action={deleteSession.bind(null, session.id)}>
              <SubmitButton className="btn text-base text-muted">Undo</SubmitButton>
            </form>
          </div>
        </>
      )}
    </li>
  );
}
