import Link from "next/link";
import { SessionDots } from "@/components/balance";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { ActionTile, PageHeader, SectionTitle } from "@/components/ui";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { formatDate, formatDay, formatMoney, todayIn, whatsappLink } from "@/lib/format";
import { paymentReceipt, sessionReceipt, statement } from "@/lib/messages";
import { loadPatient } from "@/lib/patient";
import { formatPhone } from "@/lib/phone";
import { describePlan, nextVisit, planOn, projectedEnd, type Plan } from "@/lib/schedule";
import type { Appointment, Package, Payment, Session } from "@/lib/types";
import { cancelBooking, deletePackage, deletePayment, deleteSession, endPlan, markToday } from "../../actions";

const STATUS = {
  attended: { label: "Present", icon: "check", className: "bg-ok-soft text-ok" },
  missed: { label: "Absent", icon: "x", className: "bg-bad-soft text-bad" },
  cancelled: { label: "Cancelled", icon: "x", className: "bg-surface-2 text-muted" },
} as const;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "visits", label: "Visits" },
  { key: "payments", label: "Payments" },
  { key: "schedule", label: "Schedule" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Visit = Session & { appointments: Pick<Appointment, "booked_on"> | null };

export default async function PatientPage(props: PageProps<"/patients/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const tab = (TABS.find((t) => t.key === firstParam(sp.tab))?.key ?? "overview") as Tab;

  const ctx = await getContext();
  const { supabase, clinic, member } = ctx;
  const today = todayIn(clinic.timezone);
  const p = await loadPatient(ctx, id);

  const [{ data: sessions }, { data: payments }, { data: packages }, { data: schedules }, { data: appts }] = await Promise.all([
    supabase
      .from("sessions")
      .select("*, appointments(booked_on)")
      .eq("patient_id", id)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("patient_id", id).order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("packages").select("*").eq("patient_id", id).order("start_date", { ascending: false }),
    supabase.from("schedules").select("*").eq("patient_id", id).order("valid_from", { ascending: false }),
    supabase.from("appointments").select("*").eq("patient_id", id).eq("status", "booked").gte("scheduled_date", today).order("scheduled_date"),
  ]);

  const visits = (sessions ?? []) as Visit[];
  const paid = (payments ?? []) as Payment[];
  const pkgs = (packages ?? []) as Package[];
  const plans = (schedules ?? []) as Plan[];
  const upcoming = (appts ?? []) as Appointment[];

  const plan = planOn(plans, today);
  const futurePlan = plans.find((pl) => pl.valid_from > today);
  const next = nextVisit(plan, upcoming.map((a) => a.scheduled_date), today);
  const attendedDates = visits.filter((v) => v.status === "attended").map((v) => v.session_date);
  const ends = plan ? projectedEnd(plan, today, p.sessions_left, attendedDates) : null;
  const todaySession = visits.find((v) => v.session_date === today);
  const sender = { clinic, physioName: member.display_name };
  const money = (n: number) => formatMoney(n, clinic.currency);
  const base = `/patients/${p.id}`;
  const perVisit = p.sessions_bought === 0 || (p.sessions_left < 0 && p.rate_per_session !== null);

  return (
    <div>
      <PageHeader
        back={{ href: "/patients", label: "Patients" }}
        title={
          <>
            {p.name}
            {p.archived && <span className="chip ml-2 bg-surface-2 align-middle text-sm text-muted">Archived</span>}
          </>
        }
        subtitle={p.condition ?? undefined}
        action={
          <Link href={`${base}/edit`} className="btn shrink-0">
            <Icon name="edit" className="size-4" /> Edit
          </Link>
        }
      />

      {/* Contact */}
      <div className="-mt-2 mb-4 flex flex-wrap gap-2">
        {p.phone ? (
          <>
            <a href={`tel:${p.phone}`} className="btn">
              <Icon name="phone" className="size-4" /> Call
            </a>
            <a href={whatsappLink(p.phone, "")} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="message" className="size-4" /> WhatsApp
            </a>
            <span className="self-center text-sm text-muted">{formatPhone(p.phone)}</span>
          </>
        ) : (
          <Link href={`${base}/edit`} className="btn text-muted">
            <Icon name="plus" className="size-4" /> Add phone number
          </Link>
        )}
      </div>

      {/* Status at a glance */}
      <section className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted">{perVisit ? "Visits so far" : "Sessions left"}</p>
            <p className={`text-4xl font-semibold ${!perVisit && p.sessions_left <= 1 ? (p.sessions_left < 0 ? "text-bad" : "text-warn") : ""}`}>
              {perVisit ? p.sessions_attended : p.sessions_left}
            </p>
            {!perVisit && (
              <p className="text-sm text-muted">
                {p.sessions_attended} of {p.sessions_bought} used
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted">Money due</p>
            {p.amount_due > 0 ? (
              <p className="text-4xl font-semibold text-bad">{money(p.amount_due)}</p>
            ) : (
              <p className="flex items-center gap-1.5 pt-1.5 text-xl font-semibold text-ok">
                <Icon name="check" /> All paid
              </p>
            )}
            <p className="text-sm text-muted">
              {money(p.amount_paid)} of {money(p.amount_billed)} paid
            </p>
          </div>
        </div>
        <SessionDots used={Math.min(p.sessions_attended, p.sessions_bought)} total={p.sessions_bought} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
          <span>
            <span className="text-muted">Schedule: </span>
            <span className="font-medium">{plan ? describePlan(plan) : "None"}</span>
          </span>
          {next && (
            <span>
              <span className="text-muted">Next: </span>
              <span className="font-medium">{formatDay(next)}</span>
            </span>
          )}
        </div>
      </section>

      {/* Today's attendance */}
      <section className="card mt-3">
        {todaySession ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip gap-1 py-1.5 text-sm ${STATUS[todaySession.status].className}`}>
              <Icon name={STATUS[todaySession.status].icon} className="size-4" />
              {STATUS[todaySession.status].label} today
            </span>
            {p.phone && (
              <a
                href={whatsappLink(p.phone, sessionReceipt(p, todaySession, sender, next))}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp flex-1 text-base"
              >
                <Icon name="message" /> Send receipt
              </a>
            )}
            <form action={deleteSession.bind(null, todaySession.id)}>
              <SubmitButton className="btn text-muted">Undo</SubmitButton>
            </form>
          </div>
        ) : (
          <>
            <p className="mb-2.5 text-base font-medium">Today&apos;s attendance</p>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <form action={markToday.bind(null, p.id, "missed")}>
                <SubmitButton className="btn btn-bad w-full text-base">
                  <Icon name="x" /> Absent
                </SubmitButton>
              </form>
              <form action={markToday.bind(null, p.id, "attended")}>
                <SubmitButton className="btn btn-ok w-full text-base">
                  <Icon name="check" /> Present
                </SubmitButton>
              </form>
            </div>
          </>
        )}
      </section>

      {/* Main actions */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <ActionTile href={`${base}/payment`} icon="rupee" label="Record payment" />
        <ActionTile href={`${base}/book`} icon="calendar" label="Book session" />
        <ActionTile href={`${base}/schedule`} icon="repeat" label={plan ? "Change schedule" : "Set schedule"} />
      </div>

      {/* Tabs */}
      <nav className="-mx-4 mt-6 flex overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0" aria-label="Patient sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "overview" ? base : `${base}?tab=${t.key}`}
            replace
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-base font-medium ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="pt-2">
        {tab === "overview" && (
          <>
            <SectionTitle>Coming up</SectionTitle>
            <div className="card space-y-3">
              <div className="grid grid-cols-2 gap-3 text-base">
                <div>
                  <p className="text-sm text-muted">Next session</p>
                  <p className="font-medium">{next ? formatDay(next) : "Not booked"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Package runs out</p>
                  <p className="font-medium">{ends ? `${ends.approximate ? "Around " : ""}${formatDay(ends.date)}` : "—"}</p>
                </div>
              </div>
              {upcoming.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <Icon name="calendar" className="size-5 shrink-0 text-brand" />
                      <span className="flex-1">
                        <span className="block font-medium">{a.scheduled_date === today ? "Today" : formatDay(a.scheduled_date)}</span>
                        <span className="block text-sm text-muted">
                          Booked on {formatDate(a.booked_on)}
                          {a.note ? ` · ${a.note}` : ""}
                        </span>
                      </span>
                      <form action={cancelBooking.bind(null, a.id)}>
                        <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText="Cancel booking?">
                          Cancel
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {p.phone && (
              <a
                href={whatsappLink(p.phone, statement(p, visits, sender))}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp mt-3 w-full text-base"
              >
                <Icon name="send" /> Send full summary on WhatsApp
              </a>
            )}
          </>
        )}

        {tab === "visits" && (
          <>
            <Link href={`${base}/past-sessions`} className="btn mt-4 w-full text-base">
              <Icon name="history" /> Add past sessions
            </Link>
            <SectionTitle aside={`${p.sessions_attended} attended`}>All visits</SectionTitle>
            {p.sessions_prior > 0 && (
              <p className="mb-2 rounded-2xl bg-surface-2 px-4 py-3 text-base text-muted">
                + {p.sessions_prior} earlier session{p.sessions_prior === 1 ? "" : "s"} from before the app (no dates)
              </p>
            )}
            {visits.length === 0 ? (
              p.sessions_prior === 0 && <p className="card text-base text-muted">No visits recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {visits.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`chip w-24 shrink-0 justify-center gap-1 py-1 ${STATUS[v.status].className}`}>
                      <Icon name={STATUS[v.status].icon} className="size-3.5" />
                      {STATUS[v.status].label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{formatDate(v.session_date)}</span>
                      {v.appointments && <span className="block text-sm text-muted">Booked on {formatDate(v.appointments.booked_on)}</span>}
                      {v.notes && <span className="block text-sm text-muted">{v.notes}</span>}
                    </span>
                    <form action={deleteSession.bind(null, v.id)}>
                      <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText="Remove?">
                        Remove
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "payments" && (
          <>
            <Link href={`${base}/package`} className="btn mt-4 w-full text-base">
              <Icon name="package" /> New package
            </Link>

            <SectionTitle aside={`${money(p.amount_paid)} paid`}>Payments</SectionTitle>
            {paid.length === 0 ? (
              <p className="card text-base text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {paid.map((pay) => (
                  <li key={pay.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold">{money(pay.amount)}</span>
                      <span className="block text-sm text-muted">
                        {pay.method.toUpperCase()} · paid on {formatDate(pay.paid_on)}
                        {pay.note ? ` · ${pay.note}` : ""}
                      </span>
                    </span>
                    {p.phone && (
                      <a
                        href={whatsappLink(p.phone, paymentReceipt(p, pay, sender))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-whatsapp min-h-10 px-3 text-sm"
                      >
                        Receipt
                      </a>
                    )}
                    <form action={deletePayment.bind(null, pay.id)}>
                      <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText="Remove?">
                        Remove
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <SectionTitle aside={`${money(p.amount_billed)} billed`}>Packages</SectionTitle>
            {pkgs.length === 0 ? (
              <p className="card text-base text-muted">
                No packages — {p.rate_per_session !== null ? `${money(p.rate_per_session)} per visit` : "pay per visit"}.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {pkgs.map((pkg) => (
                  <li key={pkg.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {pkg.title} · {money(pkg.price)}
                      </span>
                      <span className="block text-sm text-muted">
                        {pkg.total_sessions} sessions · started {formatDate(pkg.start_date)}
                        {pkg.sessions_used_before > 0 && ` · ${pkg.sessions_used_before} done before app`}
                      </span>
                    </span>
                    <form action={deletePackage.bind(null, pkg.id)}>
                      <ConfirmButton className="btn min-h-10 px-3 text-sm text-muted" confirmText="Remove?">
                        Remove
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {p.rate_per_session !== null && pkgs.length > 0 && (
              <p className="mt-2 px-1 text-sm text-muted">Visits beyond the package: {money(p.rate_per_session)} each.</p>
            )}
          </>
        )}

        {tab === "schedule" && (
          <>
            <SectionTitle>Current schedule</SectionTitle>
            <div className="card space-y-3">
              {plan ? (
                <div>
                  <p className="text-xl font-semibold">{describePlan(plan)}</p>
                  <p className="text-base text-muted">
                    Since {formatDate(plan.valid_from)}
                    {plan.valid_until ? ` · until ${formatDate(plan.valid_until)}` : ""}
                    {plan.note ? ` · ${plan.note}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-base text-muted">No regular schedule — the patient comes only when booked.</p>
              )}
              {futurePlan && futurePlan !== plan && (
                <p className="rounded-xl bg-brand-soft px-3 py-2 text-base text-brand">
                  Changes to <strong>{describePlan(futurePlan)}</strong> from {formatDate(futurePlan.valid_from)}
                </p>
              )}
              <div className="flex gap-2">
                <Link href={`${base}/schedule`} className="btn btn-primary flex-1 text-base">
                  <Icon name="repeat" /> {plan ? "Change schedule" : "Set schedule"}
                </Link>
                {plan && !plan.valid_until && (
                  <form action={endPlan.bind(null, plan.id)}>
                    <ConfirmButton className="btn text-base text-muted" confirmText="Stop schedule?">
                      Stop
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </div>

            {plans.length > 0 && (
              <>
                <SectionTitle>History</SectionTitle>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {plans.map((pl) => (
                    <li key={pl.id} className="px-4 py-3">
                      <p className="font-medium">{describePlan(pl)}</p>
                      <p className="text-sm text-muted">
                        {formatDate(pl.valid_from)} – {pl.valid_until ? formatDate(pl.valid_until) : "now"}
                        {pl.note ? ` · ${pl.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
