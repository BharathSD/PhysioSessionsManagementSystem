import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon, type IconName } from "@/components/icons";
import { PainChart } from "@/components/pain-chart";
import { SectionTitle } from "@/components/ui";
import { VisitCalendar } from "@/components/visit-calendar";
import { formatDate, formatDay, formatMoney } from "@/lib/format";
import {
  absentStreak,
  actualPerWeek,
  ageOn,
  attendance,
  dueSince,
  plannedPerWeek,
  recentActivity,
  upcomingVisits,
  weeklyVisits,
  type ActivityItem,
} from "@/lib/overview";
import { formatPhone } from "@/lib/phone";
import { describePlan, type Plan } from "@/lib/schedule";
import { STATUS } from "@/lib/status";
import type { Appointment, Charge, Package, PatientSummary, Payment, Rate, Session } from "@/lib/types";
import { describeOff, offOn, type DayOff } from "@/lib/days-off";
import { cancelBooking, restorePatientDay } from "../../actions";

export type PatientDetails = {
  date_of_birth: string | null;
  dob_is_estimate: boolean;
  gender: "female" | "male" | "other" | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  referred_by: string | null;
  injury_date: string | null;
  goals: string | null;
  precautions: string | null;
};

const ACTIVITY_ICON: Record<ActivityItem["kind"], IconName> = {
  visit: "check",
  payment: "rupee",
  booking: "calendar",
  schedule: "repeat",
  fee: "edit",
  charge: "plus",
};

/** The patient's Overview tab: alerts, attendance, what's coming, money, treatment, activity and personal details. */
export function Overview(props: {
  p: PatientSummary;
  details: PatientDetails | null;
  visits: (Session & { appointments: Pick<Appointment, "booked_on"> | null })[];
  payments: Payment[];
  packages: Package[];
  charges: Charge[];
  plans: Plan[];
  plan: Plan | undefined;
  upcoming: Appointment[];
  allBookings: Pick<Appointment, "booked_on" | "scheduled_date" | "status" | "visit_type_id">[];
  typeNames: Record<string, string>;
  patientRates: Rate[];
  ends: { date: string; approximate: boolean } | null;
  today: string;
  currency: string;
  typeName: (id: string | null | undefined) => string;
  summaryLink: string | null;
  daysOff: DayOff[];
  base: string;
}) {
  const { p, details, visits, today, typeName, base } = props;
  const money = (n: number) => formatMoney(n, props.currency);

  // Attendance & adherence
  const att = attendance(visits, today);
  const planned = plannedPerWeek(props.plan);
  const actual = actualPerWeek(visits, today);
  const weeks = weeklyVisits(visits, today, 8);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count), Math.ceil(planned ?? 0));
  const streak = absentStreak(visits);

  // Pain over the last 12 scored visits
  const painPoints = visits
    .filter((v) => v.status === "attended" && v.pain_score !== null)
    .map((v) => ({ date: v.session_date, score: Number(v.pain_score) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);

  // Treatment
  const attendedDates = visits.filter((v) => v.status === "attended").map((v) => v.session_date);
  const firstVisit = attendedDates.length ? attendedDates.reduce((a, b) => (a < b ? a : b)) : null;
  const firstPackage = props.packages.length ? props.packages.map((k) => k.start_date).reduce((a, b) => (a < b ? a : b)) : null;
  const started = [firstVisit, p.sessions_prior > 0 ? firstPackage : null].filter(Boolean).sort()[0] ?? null;
  const weeksIn = started ? Math.max(1, Math.round((Date.parse(today) - Date.parse(started)) / (7 * 86_400_000))) : 0;
  const phases = [...props.plans].sort((a, b) => a.valid_from.localeCompare(b.valid_from));

  // Money
  const since = p.amount_due > 0 ? dueSince({ packages: props.packages, visits, charges: props.charges, payments: props.payments }) : null;
  const dueDays = since ? Math.round((Date.parse(today) - Date.parse(since)) / 86_400_000) : 0;
  const lastPayment = [...props.payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on))[0];
  const monthStart = `${today.slice(0, 7)}-01`;
  const billedThisMonth =
    props.packages.filter((k) => k.start_date >= monthStart).reduce((s, k) => s + Number(k.price), 0) +
    visits.filter((v) => v.session_date >= monthStart).reduce((s, v) => s + Number(v.charge), 0) +
    props.charges.filter((c) => c.charge_date >= monthStart).reduce((s, c) => s + Number(c.amount), 0);
  const paidThisMonth = props.payments.filter((x) => x.paid_on >= monthStart).reduce((s, x) => s + Number(x.amount), 0);

  // Coming up
  const todayMarked = visits.some((v) => v.session_date === today);
  const next7 = upcomingVisits(props.plans, props.upcoming, p.default_visit_type_id, today, 7, !todayMarked, (d) =>
    offOn(props.daysOff, p.id, d),
  );
  const flexiblePlan = props.plan?.mode === "flexible" ? props.plan : undefined;

  // Alerts
  const lastVisit = p.last_visit;
  const quietDays = lastVisit ? Math.round((Date.parse(today) - Date.parse(lastVisit)) / 86_400_000) : 0;
  const alerts: { text: string; tone: "bad" | "warn" }[] = [];
  if (streak >= 2) alerts.push({ text: `Absent for the last ${streak} sessions — worth a call`, tone: "bad" });
  if (!p.archived && lastVisit && quietDays >= 14) alerts.push({ text: `No visit in ${quietDays} days (last on ${formatDate(lastVisit)})`, tone: "warn" });
  if (since && dueDays >= 30) alerts.push({ text: `${money(p.amount_due)} has been due for ${dueDays} days`, tone: "bad" });

  // Recent activity
  const activity = recentActivity(
    { visits, payments: props.payments, bookings: props.allBookings, plans: props.plans, rates: props.patientRates, charges: props.charges },
    {
      visit: (v) => ({
        title: `${STATUS[v.status].label} · ${typeName(v.visit_type_id)}`,
        detail: [v.package_id ? "from package" : Number(v.charge) > 0 ? money(Number(v.charge)) : null, v.notes ? `“${v.notes}”` : null]
          .filter(Boolean)
          .join(" · "),
      }),
      payment: (x) => `Paid ${money(Number(x.amount))} · ${x.method.toUpperCase()}`,
      plan: (pl) => describePlan(pl),
      fee: (r) => `${typeName(r.visit_type_id)} fee ${r.amount === null ? "back to default" : `set to ${money(Number(r.amount))}`}`,
      money,
      date: formatDay,
    },
    6,
  );

  const age = details?.date_of_birth ? ageOn(details.date_of_birth, today) : null;
  const hasAbout = Boolean(age !== null || details?.gender || details?.address || details?.emergency_phone || details?.emergency_name);

  return (
    <div>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map((a) => (
            <p
              key={a.text}
              className={`flex items-start gap-2 rounded-2xl p-3 text-base font-medium ${a.tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
            >
              <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
              {a.text}
            </p>
          ))}
        </div>
      )}

      {/* Calendar of visits */}
      <SectionTitle>Calendar</SectionTitle>
      <div className="card">
        <VisitCalendar
          patientId={p.id}
          visits={visits.map((v) => ({ id: v.id, date: v.session_date, status: v.status, visitTypeId: v.visit_type_id, pain: v.pain_score }))}
          plans={props.plans}
          bookings={props.allBookings.map((b) => ({ date: b.scheduled_date, visitTypeId: b.visit_type_id, status: b.status }))}
          defaultType={p.default_visit_type_id}
          typeNames={props.typeNames}
          today={today}
          daysOff={props.daysOff}
        />
      </div>

      {/* Pain */}
      <SectionTitle aside={painPoints.length > 1 ? `Last ${painPoints.length} scored visits` : undefined}>Pain</SectionTitle>
      <div className="card">
        <PainChart points={painPoints} />
      </div>

      {/* Attendance */}
      <SectionTitle aside="Last 30 days">Attendance</SectionTitle>
      <div className="card space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className={`text-3xl font-semibold ${att.rate !== null && att.rate < 70 ? "text-warn" : ""}`}>{att.rate === null ? "—" : `${att.rate}%`}</p>
            <p className="text-sm text-muted">turned up</p>
          </div>
          <div>
            <p className="text-3xl font-semibold">{actual === null ? "—" : actual.toFixed(1)}</p>
            <p className="text-sm text-muted">per week</p>
          </div>
          <div>
            <p className="text-3xl font-semibold">{planned === null ? "—" : Number.isInteger(planned) ? planned : planned.toFixed(1)}</p>
            <p className="text-sm text-muted">planned / week</p>
          </div>
        </div>
        <p className="text-center text-sm text-muted">
          {att.present} present · {att.absent} absent · {att.cancelled} cancelled by patient
        </p>
        <div>
          <div className="flex h-20 items-end gap-1.5" aria-label="Visits per week, last 8 weeks">
            {weeks.map((w) => (
              <div
                key={w.start}
                title={`Week of ${formatDay(w.start)}: ${w.count} visit${w.count === 1 ? "" : "s"}${planned !== null ? ` (plan ${Number.isInteger(planned) ? planned : planned.toFixed(1)})` : ""}`}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-xs text-muted">{w.count || ""}</span>
                <div
                  className={`w-full rounded-md ${planned !== null && w.count >= planned ? "bg-chart" : "bg-chart/50"}`}
                  style={{ height: `${w.count ? Math.max(8, (w.count / maxWeek) * 100) : 3}%`, opacity: w.count ? 1 : 0.3 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{formatDay(weeks[0].start)}</span>
            <span>visits per week</span>
            <span>this week</span>
          </div>
        </div>
      </div>

      {/* Coming up */}
      <SectionTitle>Coming up</SectionTitle>
      <div className="card space-y-3">
        {next7.length === 0 ? (
          <p className="text-base text-muted">{flexiblePlan ? `${describePlan(flexiblePlan)} — book days as they choose them.` : "Nothing scheduled in the next 7 days."}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {next7.map((u) =>
              u.off ? (
                // Cancelled in advance: struck through, with Restore for the patient's own single days off.
                <span key={u.date} className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted">
                  <span className="block font-semibold line-through">{u.date === today ? "Today" : formatDay(u.date)}</span>
                  <span className="block">{describeOff(u.off)}</span>
                  {u.off.patient_id && u.off.from_date === u.off.to_date && (
                    <form action={restorePatientDay.bind(null, u.off.id, p.id)}>
                      <button type="submit" className="mt-0.5 text-xs font-medium text-brand underline">
                        Restore
                      </button>
                    </form>
                  )}
                </span>
              ) : (
                <span key={u.date} className="flex items-start gap-2 rounded-xl bg-surface-2 py-2 pr-1 pl-3 text-sm">
                  <span>
                    <span className="block font-semibold">{u.date === today ? "Today" : formatDay(u.date)}</span>
                    <span className="block text-muted">
                      {typeName(u.visitTypeId)}
                      {u.booked ? " · booked" : ""}
                    </span>
                  </span>
                  <Link
                    href={`${base}/cancel-days?dates=${u.date}`}
                    aria-label={`Cancel ${formatDay(u.date)}`}
                    title="Cancel this day"
                    className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-bad"
                  >
                    <Icon name="x" className="size-4" />
                  </Link>
                </span>
              ),
            )}
          </div>
        )}
        <Link href={`${base}/cancel-days`} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand">
          <Icon name="ban" className="size-4" /> Away for a while? Take a break
        </Link>
        {p.sessions_bought > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-sm text-muted">Package runs out</p>
              <p className="font-medium">
                {p.sessions_left <= 0 ? "Used up" : props.ends ? `${props.ends.approximate ? "Around " : ""}${formatDay(props.ends.date)}` : `${p.sessions_left} left`}
              </p>
            </div>
            {p.sessions_left <= 2 && (
              <Link href={`${base}/package`} className="btn btn-primary shrink-0">
                <Icon name="package" /> Renew package
              </Link>
            )}
          </div>
        )}
        {props.upcoming.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {props.upcoming.map((a) => (
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

      {/* Money */}
      <SectionTitle>Money</SectionTitle>
      <div className="card grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted">{p.amount_due < 0 ? "Paid in advance" : "Due"}</p>
          <p className={`text-xl font-semibold ${p.amount_due > 0 ? "text-bad" : "text-ok"}`}>
            {p.amount_due === 0 ? "Nothing" : money(Math.abs(p.amount_due))}
          </p>
          {since && (
            <p className="text-sm text-muted">
              since {formatDate(since)} ({dueDays} day{dueDays === 1 ? "" : "s"})
            </p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted">Last payment</p>
          <p className="text-xl font-semibold">{lastPayment ? money(Number(lastPayment.amount)) : "None yet"}</p>
          {lastPayment && (
            <p className="text-sm text-muted">
              {lastPayment.method.toUpperCase()} · {formatDate(lastPayment.paid_on)}
            </p>
          )}
        </div>
        <div className="col-span-2 flex justify-between border-t border-border pt-3 text-sm">
          <span>
            <span className="text-muted">This month billed </span>
            <span className="font-medium">{money(billedThisMonth)}</span>
          </span>
          <span>
            <span className="text-muted">paid </span>
            <span className="font-medium">{money(paidThisMonth)}</span>
          </span>
        </div>
      </div>

      {/* Treatment */}
      <SectionTitle>Treatment</SectionTitle>
      <div className="card space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold">{started ? formatDay(started).replace(/^\w+, /, "") : "—"}</p>
            <p className="text-sm text-muted">started</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{started ? `${weeksIn} wk${weeksIn === 1 ? "" : "s"}` : "—"}</p>
            <p className="text-sm text-muted">in treatment</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{p.visits}</p>
            <p className="text-sm text-muted">visits</p>
          </div>
        </div>
        {(details?.injury_date || details?.referred_by || details?.goals) && (
          <dl className="space-y-2 border-t border-border pt-3 text-base">
            {details?.injury_date && (
              <div>
                <dt className="text-sm text-muted">Injury / surgery</dt>
                <dd>
                  {formatDate(details.injury_date)}
                  <span className="text-muted">
                    {" "}
                    · {Math.max(0, Math.round((Date.parse(today) - Date.parse(details.injury_date)) / (7 * 86_400_000)))} weeks ago
                  </span>
                </dd>
              </div>
            )}
            {details?.referred_by && (
              <div>
                <dt className="text-sm text-muted">Referred by</dt>
                <dd>{details.referred_by}</dd>
              </div>
            )}
            {details?.goals && (
              <div>
                <dt className="text-sm text-muted">Goals</dt>
                <dd className="whitespace-pre-line">{details.goals}</dd>
              </div>
            )}
          </dl>
        )}
        {phases.length > 0 && (
          <ol className="space-y-1.5 border-t border-border pt-3 text-sm">
            {phases.map((pl) => (
              <li key={pl.id} className="flex gap-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${pl === props.plan ? "bg-brand" : "bg-border"}`} />
                <span>
                  <span className="font-medium">{describePlan(pl)}</span>
                  <span className="text-muted">
                    {" "}
                    · {formatDate(pl.valid_from)} – {pl.valid_until ? formatDate(pl.valid_until) : "now"}
                    {pl.note ? ` · ${pl.note}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <>
          <SectionTitle>Recent activity</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {activity.map((a, i) => (
              <li key={`${a.kind}${a.date}${i}`} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                  <Icon name={ACTIVITY_ICON[a.kind]} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.title}</span>
                  {a.detail && <span className="block truncate text-sm text-muted">{a.detail}</span>}
                </span>
                <span className="shrink-0 text-sm text-muted">{formatDate(a.date).replace(/ \d{4}$/, "")}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* About */}
      <SectionTitle aside={<Link href={`${base}/edit`} className="text-brand normal-case">Edit</Link>}>About</SectionTitle>
      <div className="card space-y-3 text-base">
        {!hasAbout && <p className="text-muted">Add age, address for home visits and an emergency contact under Edit.</p>}
        {(age !== null || details?.gender) && (
          <p>
            {age !== null && `${details?.dob_is_estimate ? "~" : ""}${age} years`}
            {age !== null && details?.gender ? " · " : ""}
            {details?.gender && { female: "Female", male: "Male", other: "Other" }[details.gender]}
            {details?.date_of_birth && !details.dob_is_estimate && <span className="text-muted"> · born {formatDate(details.date_of_birth)}</span>}
          </p>
        )}
        {details?.address && (
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-line">{details.address}</p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn shrink-0"
            >
              Open in Maps
            </a>
          </div>
        )}
        {(details?.emergency_name || details?.emergency_phone) && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <p>
              <span className="block text-sm text-muted">Emergency contact</span>
              {details.emergency_name}
              {details.emergency_phone && <span className="text-muted"> · {formatPhone(details.emergency_phone)}</span>}
            </p>
            {details.emergency_phone && (
              <a href={`tel:${details.emergency_phone}`} className="btn shrink-0">
                <Icon name="phone" className="size-4" /> Call
              </a>
            )}
          </div>
        )}
      </div>

      {props.summaryLink && (
        <a href={props.summaryLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp mt-4 w-full text-base">
          <Icon name="send" /> Send full summary on WhatsApp
        </a>
      )}
    </div>
  );
}
