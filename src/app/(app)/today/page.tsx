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
import { getTeam, whoFrom } from "@/lib/team";
import { WhoFilter } from "@/components/who-filter";
import { addressLines, mapsLink, type Address } from "@/lib/address";
import { patientName, physioName } from "@/lib/names";
import { firstParam } from "@/lib/data";
import { canChargeMiss } from "@/lib/fees";
import { todayIn, whatsappLink } from "@/lib/format";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n";
import { sessionReceipt } from "@/lib/messages";
import { describeOff } from "@/lib/days-off";
import { STATUS } from "@/lib/status";
import type { Clinic, Rate } from "@/lib/types";
import { deleteSession, markToday } from "../actions";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Today") };
}

type RowContext = {
  t: T;
  sender: { clinic: Clinic; physioName: string };
  addresses: Map<string, { text: string; link: string }>;
  rates: Rate[];
  typeName: (id: string | null | undefined) => string;
  savedTypeName: (id: string | null | undefined) => string;
  isHomeVisit: (id: string | null | undefined) => boolean;
  today: string;
};

export default async function TodayPage(props: PageProps<"/today">) {
  const sp = await props.searchParams;
  const q = firstParam(sp.q);
  const ctx = await getContext();
  const t = await getT();
  const team = await getTeam();
  const who = team.isTeam ? whoFrom(firstParam(sp.who), ctx.member) : "all";
  const today = todayIn(ctx.clinic.timezone);
  const [{ expected, others, offToday, clinicClosed, seen }, { rates, typeName, savedTypeName, isHomeVisit }, { data: withAddress }] = await Promise.all([
    getBoard(ctx, today, q, who === "mine" ? ctx.userId : undefined),
    getBilling(),
    ctx.supabase
      .from("patients")
      .select("id, address, address_line2, city, state, postal_code, address_country, latitude, longitude")
      .eq("archived", false)
      .or("address.not.is.null,address_line2.not.is.null,city.not.is.null,latitude.not.is.null"),
  ]);
  const rc: RowContext = {
    t,
    sender: { clinic: ctx.clinic, physioName: physioName(ctx.member) },
    addresses: new Map(
      ((withAddress ?? []) as (Address & { id: string })[]).map((a) => [
        a.id,
        { text: addressLines(a, ctx.clinic.country).join(", ") || t("Pinned on the map"), link: mapsLink(a, ctx.clinic.country)! },
      ]),
    ),
    rates,
    typeName,
    savedTypeName,
    isHomeVisit,
    today,
  };
  const done = expected.filter((r) => r.session).length;

  return (
    <div>
      <PageHeader title={t("Today")} subtitle={`${t.date(today)} · ${t("{n} seen", { n: seen })}`} />

      {clinicClosed && (
        <div className="mb-3 flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-base">
          <Icon name="ban" className="mt-0.5 size-5 shrink-0 text-warn" />
          <span className="flex-1">
            <span className="block font-semibold text-warn">
              {t("Clinic closed today")}
              {clinicClosed.weekdays ? ` · ${t("Weekly off")}` : clinicClosed.reason ? ` · ${clinicClosed.reason}` : ""}
            </span>
            <span className="block text-sm text-muted">{t("Scheduled sessions are off, with no charge. Seeing someone in an emergency? Mark them below.")}</span>
          </span>
          <Link href="/profile/days-off" className="text-sm font-medium text-brand">
            {t("Change")}
          </Link>
        </div>
      )}

      {team.isTeam && <WhoFilter who={who} hrefs={{ mine: `/today?${new URLSearchParams({ who: "mine", ...(q ? { q } : {}) })}`, all: `/today?${new URLSearchParams({ who: "all", ...(q ? { q } : {}) })}` }} />}
      <form role="search" className="relative mb-2">
        {team.isTeam && <input type="hidden" name="who" value={who} />}
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder={t("Find a patient…")}
          className="min-h-12 w-full rounded-2xl border border-border bg-surface pr-20 pl-11 text-base outline-none focus:border-brand"
        />
        {q && (
          <Link href={team.isTeam ? `/today?who=${who}` : "/today"} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-xl px-3 py-2 text-sm text-brand">
            {t("Clear")}
          </Link>
        )}
      </form>

      {expected.length + others.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={q ? t("No patient called “{q}”", { q }) : who === "mine" ? t("No patients of yours yet") : t("No patients yet")}>
            {who === "mine" && !q && <p>{t("Patients are yours when you're their main physio. See Everyone for the whole clinic.")}</p>}
            {!q && (
              <Link href="/patients/new" className="btn btn-primary mt-2">
                <Icon name="plus" /> {t("Add your first patient")}
              </Link>
            )}
          </EmptyState>
        </div>
      ) : clinicClosed ? (
        // Closed: no attendance asked for. Anyone seen anyway is listed, and the rest
        // stay one tap away for the rare exception.
        <>
          {expected.length > 0 && (
            <>
              <SectionTitle>{t("Seen today")}</SectionTitle>
              <ul className="space-y-2.5">
                {expected.map((r) => (
                  <PatientRow key={r.p.id} row={r} rc={rc} />
                ))}
              </ul>
            </>
          )}
          <details className="group" open={Boolean(q)}>
            <summary className="mt-7 mb-2.5 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-1 text-sm font-semibold text-muted">
              <span>{t("Emergency or extra visit? Mark the patient here ({n})", { n: offToday.length + others.length })}</span>
              <span className="text-brand group-open:hidden">{t("Show")}</span>
              <span className="hidden text-brand group-open:inline">{t("Hide")}</span>
            </summary>
            <ul className="space-y-2.5">
              {[...offToday, ...others].map((r) => (
                <PatientRow key={r.p.id} row={r} rc={rc} />
              ))}
            </ul>
          </details>
        </>
      ) : (
        <>
          <SectionTitle aside={expected.length > 0 ? t("{done} of {total} marked", { done, total: expected.length }) : undefined}>{t("Expected today")}</SectionTitle>
          {expected.length === 0 ? (
            <p className="card text-base text-muted">{t("No one is scheduled today. Patients with a schedule or a booking will appear here.")}</p>
          ) : (
            <ul className="space-y-2.5">
              {expected.map((r) => (
                <PatientRow key={r.p.id} row={r} rc={rc} />
              ))}
            </ul>
          )}

          {offToday.length > 0 && (
            <>
              <SectionTitle>{t("Off today (cancelled in advance)")}</SectionTitle>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {offToday.map((r) => (
                  <li key={r.p.id}>
                    <Link href={`/patients/${r.p.id}`} className="flex items-center gap-3 px-4 py-3">
                      <Icon name="ban" className="size-5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{patientName(r.p)}</span>
                        <span className="block text-sm text-muted">{r.off && describeOff(r.off, t)}</span>
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
                <span>{t("Walk-ins & others ({n})", { n: others.length })}</span>
                <span className="text-brand normal-case group-open:hidden">{t("Show")}</span>
                <span className="hidden text-brand normal-case group-open:inline">{t("Hide")}</span>
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
  const { t } = rc;
  const status = session ? STATUS[session.status] : null;
  const sessionType = session?.visit_type_id ?? visitTypeId;
  // Home visits show where to go.
  const address = rc.isHomeVisit(sessionType) ? rc.addresses.get(p.id) : undefined;

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
              {t(status.short)}
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
          href={address.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">📍 {address.text}</span>
          <span className="shrink-0 font-medium text-brand">{t("Maps")}</span>
        </a>
      )}

      {!session ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
            <form action={markToday.bind(null, p.id, "missed", visitTypeId)}>
              <SubmitButton className="btn btn-bad w-full text-base" aria-label={t("Mark {name} absent", { name: p.name })}>
                <Icon name="x" /> {t("Absent")}
              </SubmitButton>
            </form>
            <form action={markToday.bind(null, p.id, "attended", visitTypeId)}>
              <SubmitButton className="btn btn-ok w-full text-base" aria-label={t("Mark {name} present", { name: p.name })}>
                <Icon name="check" /> {t("Present")}
              </SubmitButton>
            </form>
          </div>
          <Link
            href={`/patients/${p.id}/attendance`}
            className="mt-2 flex min-h-10 items-center justify-center gap-1 text-sm font-medium text-brand"
          >
            {t("Cancelled, rescheduled or different visit type?")}
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
                {t("+ Exercises & notes")}
              </Link>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {p.phone ? (
              <a
                href={whatsappLink(p.phone, sessionReceipt(p, session, rc.sender, next, rc.savedTypeName(session.visit_type_id)))}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp flex-1 text-base"
              >
                <Icon name="message" /> {t("Send receipt")}
              </a>
            ) : (
              <Link href={`/patients/${p.id}/edit`} className="btn flex-1 text-muted">
                {t("Add phone number to send receipt")}
              </Link>
            )}
            <form action={deleteSession.bind(null, session.id)}>
              <SubmitButton className="btn text-base text-muted">{t("Undo")}</SubmitButton>
            </form>
          </div>
        </>
      )}
    </li>
  );
}
