import Link from "next/link";
import { BalanceChips } from "@/components/balance";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { getBoard, type BoardRow } from "@/lib/board";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { formatDate, todayIn, whatsappLink } from "@/lib/format";
import { sessionReceipt } from "@/lib/messages";
import type { Clinic } from "@/lib/types";
import { deleteSession, markToday } from "../actions";

export const metadata = { title: "Today" };

const STATUS = {
  attended: { label: "Present", icon: "check", className: "bg-ok-soft text-ok" },
  missed: { label: "Absent", icon: "x", className: "bg-bad-soft text-bad" },
  cancelled: { label: "Cancelled", icon: "x", className: "bg-surface-2 text-muted" },
} as const;

type Sender = { clinic: Clinic; physioName: string };

export default async function TodayPage(props: PageProps<"/today">) {
  const q = firstParam((await props.searchParams).q);
  const ctx = await getContext();
  const today = todayIn(ctx.clinic.timezone);
  const { expected, others, seen } = await getBoard(ctx, today, q);
  const sender = { clinic: ctx.clinic, physioName: ctx.member.display_name };
  const done = expected.filter((r) => r.session).length;

  return (
    <div>
      <PageHeader title="Today" subtitle={`${formatDate(today)} · ${seen} seen`} />

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
            <p className="card text-base text-muted">
              No one is scheduled today. Patients with a schedule or a booking will appear here.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {expected.map((r) => (
                <PatientRow key={r.p.id} row={r} sender={sender} />
              ))}
            </ul>
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
                  <PatientRow key={r.p.id} row={r} sender={sender} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function PatientRow({ row, sender }: { row: BoardRow; sender: Sender }) {
  const { p, session, expected, next } = row;
  const status = session ? STATUS[session.status] : null;

  return (
    <li className="card">
      <Link href={`/patients/${p.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{p.name}</p>
            <p className="text-sm text-muted">
              {p.sessions_bought > 0 ? `Session ${p.sessions_attended + (session ? 0 : 1)} of ${p.sessions_bought}` : "Pay per visit"}
              {expected && ` · ${expected.label}`}
            </p>
          </div>
          {status && (
            <span className={`chip shrink-0 gap-1 py-1 text-sm ${status.className}`}>
              <Icon name={status.icon} className="size-4" />
              {status.label}
            </span>
          )}
        </div>
        <div className="mt-2">
          <BalanceChips p={p} currency={sender.clinic.currency} />
        </div>
      </Link>

      {!session ? (
        <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
          <form action={markToday.bind(null, p.id, "missed")}>
            <SubmitButton className="btn btn-bad w-full text-base" aria-label={`Mark ${p.name} absent`}>
              <Icon name="x" /> Absent
            </SubmitButton>
          </form>
          <form action={markToday.bind(null, p.id, "attended")}>
            <SubmitButton className="btn btn-ok w-full text-base" aria-label={`Mark ${p.name} present`}>
              <Icon name="check" /> Present
            </SubmitButton>
          </form>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {p.phone ? (
            <a
              href={whatsappLink(p.phone, sessionReceipt(p, session, sender, next))}
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
      )}
    </li>
  );
}
