import Link from "next/link";
import { SessionDots } from "@/components/balance";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { ActionTile, PageHeader, SectionTitle } from "@/components/ui";
import { VisitCost } from "@/components/visit-cost";
import { getBilling, packageSlots } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { firstParam } from "@/lib/data";
import { canChargeMiss, patientFee, standardFee } from "@/lib/fees";
import { formatDate, formatDay, formatMoney, todayIn, whatsappLink } from "@/lib/format";
import { paymentReceipt, sessionReceipt, statement } from "@/lib/messages";
import { loadPatient } from "@/lib/patient";
import { formatPhone } from "@/lib/phone";
import { describePlan, nextVisit, planOn, planVisitType, projectedEnd, WEEKDAYS, type Plan } from "@/lib/schedule";
import { STATUS } from "@/lib/status";
import type { Appointment, Charge, Package, Payment, Session } from "@/lib/types";
import { cancelBooking, deleteCharge, deletePackage, deletePayment, deleteSession, endPlan, markToday } from "../../actions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "visits", label: "Visits" },
  { key: "account", label: "Account" },
  { key: "schedule", label: "Schedule" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Visit = Session & { appointments: Pick<Appointment, "booked_on"> | null };

type LedgerRow = {
  key: string;
  date: string;
  order: number; // same day: charges before payments
  label: React.ReactNode;
  detail?: string;
  amount: number; // + charge, − payment
  remove?: React.ReactNode;
  receipt?: string;
};

export default async function PatientPage(props: PageProps<"/patients/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const tab = (TABS.find((t) => t.key === firstParam(sp.tab))?.key ?? "overview") as Tab;

  const ctx = await getContext();
  const { supabase, clinic, member } = ctx;
  const today = todayIn(clinic.timezone);
  const p = await loadPatient(ctx, id);

  const [{ activeTypes, rates, typeName }, slots, { data: sessions }, { data: payments }, { data: packages }, { data: schedules }, { data: appts }, { data: extras }] =
    await Promise.all([
      getBilling(),
      packageSlots(ctx, id),
      supabase
        .from("sessions")
        .select("*, appointments!sessions_appointment_id_clinic_id_fkey(booked_on)")
        .eq("patient_id", id)
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("payments").select("*").eq("patient_id", id).order("paid_on").order("created_at"),
      supabase.from("packages").select("*").eq("patient_id", id).order("start_date"),
      supabase.from("schedules").select("*").eq("patient_id", id).order("valid_from", { ascending: false }),
      supabase.from("appointments").select("*").eq("patient_id", id).eq("status", "booked").gte("scheduled_date", today).order("scheduled_date"),
      supabase.from("charges").select("*").eq("patient_id", id).order("charge_date"),
    ]);

  const visits = (sessions ?? []) as Visit[];
  const paid = (payments ?? []) as Payment[];
  const pkgs = (packages ?? []) as Package[];
  const plans = (schedules ?? []) as Plan[];
  const upcoming = (appts ?? []) as Appointment[];
  const charges = (extras ?? []) as Charge[];

  const plan = planOn(plans, today);
  const futurePlan = plans.find((pl) => pl.valid_from > today);
  const next = nextVisit(plan, upcoming.map((a) => a.scheduled_date), today);
  const attendedDates = visits.filter((v) => v.status === "attended").map((v) => v.session_date);
  const ends = plan && p.sessions_left > 0 ? projectedEnd(plan, today, p.sessions_left, attendedDates) : null;
  const todaySession = visits.find((v) => v.session_date === today);
  const todayBooking = upcoming.find((a) => a.scheduled_date === today);
  const todayType = todayBooking?.visit_type_id ?? (plan && planVisitType(plan, today)) ?? p.default_visit_type_id;
  const sender = { clinic, physioName: member.display_name };
  const money = (n: number) => formatMoney(n, clinic.currency);
  const base = `/patients/${p.id}`;
  const remainingOf = new Map(slots.map((s) => [s.id, s.remaining]));

  /** "Mon, Wed: In-clinic · Sat: Home visit" for mixed schedules. */
  const planTypes = (pl: Plan) => {
    if (pl.mode !== "fixed_days" || Object.keys(pl.day_visit_types ?? {}).length === 0) return typeName(pl.visit_type_id);
    const groups = new Map<string, string[]>();
    for (const d of pl.weekdays) {
      const t = typeName(pl.day_visit_types[String(d)] ?? pl.visit_type_id);
      groups.set(t, [...(groups.get(t) ?? []), WEEKDAYS[d - 1].short]);
    }
    return [...groups].map(([t, days]) => `${days.join(", ")}: ${t}`).join(" · ");
  };

  // Account ledger: everything that changes the balance, oldest first, with a running balance.
  const ledger: LedgerRow[] = [
    ...pkgs.map((pkg) => ({
      key: `pk${pkg.id}`,
      date: pkg.start_date,
      order: 0,
      label: `Package: ${pkg.title}`,
      detail: `${pkg.total_sessions} × ${pkg.visit_type_id ? typeName(pkg.visit_type_id) : "any visit type"} · ${remainingOf.get(pkg.id) ?? 0} left${
        pkg.sessions_used_before > 0 ? ` · ${pkg.sessions_used_before} done before app` : ""
      }`,
      amount: Number(pkg.price),
      remove: (
        <form action={deletePackage.bind(null, pkg.id)}>
          <ConfirmButton className="text-xs text-muted underline" confirmText="Remove package?">
            Remove
          </ConfirmButton>
        </form>
      ),
    })),
    ...visits
      .filter((v) => Number(v.charge) > 0)
      .map((v) => ({
        key: `s${v.id}`,
        date: v.session_date,
        order: 1,
        label: typeName(v.visit_type_id),
        detail: v.status === "attended" ? "Visit fee" : `${STATUS[v.status].label} — fee`,
        amount: Number(v.charge),
      })),
    ...charges.map((c) => ({
      key: `c${c.id}`,
      date: c.charge_date,
      order: 2,
      label: c.description,
      detail: c.amount < 0 ? "Discount" : "Extra charge",
      amount: Number(c.amount),
      remove: (
        <form action={deleteCharge.bind(null, c.id)}>
          <ConfirmButton className="text-xs text-muted underline" confirmText="Remove?">
            Remove
          </ConfirmButton>
        </form>
      ),
    })),
    ...paid.map((pay) => ({
      key: `p${pay.id}`,
      date: pay.paid_on,
      order: 3,
      label: `Payment · ${pay.method.toUpperCase()}`,
      detail: pay.note ?? undefined,
      amount: -Number(pay.amount),
      receipt: p.phone ? whatsappLink(p.phone, paymentReceipt(p, pay, sender)) : undefined,
      remove: (
        <form action={deletePayment.bind(null, pay.id)}>
          <ConfirmButton className="text-xs text-muted underline" confirmText="Remove payment?">
            Remove
          </ConfirmButton>
        </form>
      ),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const ledgerWithBalance = ledger.reduce<(LedgerRow & { balance: number })[]>(
    (rows, r) => [...rows, { ...r, balance: (rows.at(-1)?.balance ?? 0) + r.amount }],
    [],
  );

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
        subtitle={[p.condition, p.default_visit_type_id ? `Usually: ${typeName(p.default_visit_type_id)}` : null].filter(Boolean).join(" · ") || undefined}
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
            {p.sessions_bought > 0 ? (
              <>
                <p className="text-sm text-muted">Package sessions left</p>
                <p className={`text-4xl font-semibold ${p.sessions_left <= 1 ? "text-warn" : ""}`}>{p.sessions_left}</p>
                <p className="text-sm text-muted">
                  {p.sessions_used} of {p.sessions_bought} used
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Visits so far</p>
                <p className="text-4xl font-semibold">{p.visits}</p>
                <p className="text-sm text-muted">Pay per visit</p>
              </>
            )}
          </div>
          <div>
            <p className="text-sm text-muted">{p.amount_due < 0 ? "Paid in advance" : "Money due"}</p>
            {p.amount_due > 0 ? (
              <p className="text-4xl font-semibold text-bad">{money(p.amount_due)}</p>
            ) : p.amount_due < 0 ? (
              <p className="text-4xl font-semibold text-ok">{money(-p.amount_due)}</p>
            ) : (
              <p className="flex items-center gap-1.5 pt-1.5 text-xl font-semibold text-ok">
                <Icon name="check" /> All paid
              </p>
            )}
            <p className="text-sm text-muted">
              {money(p.amount_paid)} paid of {money(p.amount_billed)}
            </p>
          </div>
        </div>
        <SessionDots used={Math.min(p.sessions_used, p.sessions_bought)} total={p.sessions_bought} />
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
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`chip gap-1 py-1.5 text-sm ${STATUS[todaySession.status].className}`}>
                <Icon name={STATUS[todaySession.status].icon} className="size-4" />
                {STATUS[todaySession.status].label} today
              </span>
              <VisitCost
                session={todaySession}
                typeName={typeName(todaySession.visit_type_id)}
                currency={clinic.currency}
                canCharge={canChargeMiss(rates, {
                  patientId: p.id,
                  sessionsLeft: p.sessions_left,
                  status: todaySession.status,
                  visitTypeId: todaySession.visit_type_id,
                  date: today,
                })}
              />
            </div>
            <div className="flex gap-2">
              {p.phone && (
                <a
                  href={whatsappLink(p.phone, sessionReceipt(p, todaySession, sender, next, typeName(todaySession.visit_type_id)))}
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
          </div>
        ) : (
          <>
            <p className="mb-2.5 text-base font-medium">
              Today&apos;s attendance <span className="font-normal text-muted">· {typeName(todayType)}</span>
            </p>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <form action={markToday.bind(null, p.id, "missed", todayType)}>
                <SubmitButton className="btn btn-bad w-full text-base">
                  <Icon name="x" /> Absent
                </SubmitButton>
              </form>
              <form action={markToday.bind(null, p.id, "attended", todayType)}>
                <SubmitButton className="btn btn-ok w-full text-base">
                  <Icon name="check" /> Present
                </SubmitButton>
              </form>
            </div>
            <Link href={`${base}/attendance`} className="mt-2 flex min-h-10 items-center justify-center gap-1 text-sm font-medium text-brand">
              Cancelled, rescheduled or different visit type?
              <Icon name="chevron" className="size-4" />
            </Link>
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
                        <span className="block font-medium">
                          {a.scheduled_date === today ? "Today" : formatDay(a.scheduled_date)} · {typeName(a.visit_type_id ?? p.default_visit_type_id)}
                        </span>
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
                href={whatsappLink(p.phone, statement(p, visits, sender, typeName))}
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
            <SectionTitle aside={`${p.visits} attended`}>All visits</SectionTitle>
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
                  <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`chip mt-0.5 w-24 shrink-0 justify-center gap-1 py-1 ${STATUS[v.status].className}`}>
                      <Icon name={STATUS[v.status].icon} className="size-3.5" />
                      {STATUS[v.status].short}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{formatDate(v.session_date)}</span>
                      <VisitCost
                        session={v}
                        typeName={typeName(v.visit_type_id)}
                        currency={clinic.currency}
                        canCharge={canChargeMiss(rates, {
                          patientId: p.id,
                          sessionsLeft: p.sessions_left,
                          status: v.status,
                          visitTypeId: v.visit_type_id,
                          date: v.session_date,
                        })}
                      />
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

        {tab === "account" && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link href={`${base}/package`} className="btn text-base">
                <Icon name="package" /> New package
              </Link>
              <Link href={`${base}/charge`} className="btn text-base">
                <Icon name="plus" /> Charge / discount
              </Link>
            </div>

            <SectionTitle aside={p.amount_due < 0 ? `${money(-p.amount_due)} advance` : `${money(p.amount_due)} due`}>Statement</SectionTitle>
            {ledgerWithBalance.length === 0 ? (
              <p className="card text-base text-muted">Nothing charged or paid yet.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {ledgerWithBalance.map((r) => (
                  <li key={r.key} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-14 shrink-0 pt-0.5 text-sm text-muted">{formatDate(r.date).replace(/ \d{4}$/, "")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.label}</span>
                      {r.detail && <span className="block text-sm text-muted">{r.detail}</span>}
                      {(r.receipt || r.remove) && (
                        <span className="mt-1 flex items-center gap-3">
                          {r.receipt && (
                            <a href={r.receipt} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand underline">
                              Send receipt
                            </a>
                          )}
                          {r.remove}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block font-semibold ${r.amount < 0 ? "text-ok" : ""}`}>
                        {r.amount < 0 ? `− ${money(-r.amount)}` : money(r.amount)}
                      </span>
                      <span className="block text-xs text-muted">bal. {money(r.balance)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <SectionTitle>Fees for this patient</SectionTitle>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {activeTypes.map((t) => {
                const own = patientFee(rates, p.id, "visit", t.id, today);
                const std = standardFee(rates, "visit", t.id, today);
                const fee = typeof own === "number" ? own : std;
                return (
                  <li key={t.id}>
                    <Link href={`${base}/fee?type=${t.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.name}</span>
                        <span className="block text-sm text-muted">{typeof own === "number" ? "Custom fee for this patient" : "Standard fee"}</span>
                      </span>
                      <span className={`font-semibold ${fee === null ? "text-muted" : ""}`}>{fee === null ? "Not set" : money(fee)}</span>
                      <Icon name="chevron" className="size-5 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 px-1 text-sm text-muted">Changing a fee only affects visits from the date you choose — past visits keep their price.</p>
          </>
        )}

        {tab === "schedule" && (
          <>
            <SectionTitle>Current schedule</SectionTitle>
            <div className="card space-y-3">
              {plan ? (
                <div>
                  <p className="text-xl font-semibold">{describePlan(plan)}</p>
                  <p className="text-base">{planTypes(plan)}</p>
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
                      <p className="text-sm">{planTypes(pl)}</p>
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
