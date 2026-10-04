import Link from "next/link";
import { SessionDots } from "@/components/balance";
import { ConfirmButton } from "@/components/confirm-button";
import { Icon } from "@/components/icons";
import { QuickPain } from "@/components/pain";
import { SubmitButton } from "@/components/submit-button";
import { ActionTile, PageHeader, SectionTitle } from "@/components/ui";
import { VisitCost } from "@/components/visit-cost";
import { getBilling, packageSlots } from "@/lib/billing";
import { getContext } from "@/lib/context";
import { getTeam } from "@/lib/team";
import { patientName, physioName } from "@/lib/names";
import { firstParam } from "@/lib/data";
import { canChargeMiss, patientFee, standardFee } from "@/lib/fees";
import { todayIn, whatsappLink } from "@/lib/format";
import { msg } from "@/i18n";
import { getT } from "@/i18n/server";
import { paymentReceipt, sessionReceipt, statement } from "@/lib/messages";
import { DETAIL_COLUMNS, loadPatient } from "@/lib/patient";
import { formatPhone } from "@/lib/phone";
import { describePlan, isScheduledDay, nextVisit, planOn, planVisitType, projectedEnd, WEEKDAYS, type Plan } from "@/lib/schedule";
import { STATUS } from "@/lib/status";
import type { Appointment, Charge, Package, Payment, Session } from "@/lib/types";
import { describeOff, isOffFor, offOn, type DayOff } from "@/lib/days-off";
import { cancellationNotice } from "@/lib/messages";
import { Overview, type PatientDetails } from "./overview";
import { restorePatientDay } from "../../actions";
import { deleteCharge, deletePackage, deletePayment, deleteSession, endPlan, markToday } from "../../actions";

const TABS = [
  { key: "overview", label: msg("Overview") },
  { key: "history", label: msg("History") },
  { key: "visits", label: msg("Visits") },
  { key: "account", label: msg("Account") },
  { key: "schedule", label: msg("Schedule") },
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
  const tab = (TABS.find((x) => x.key === firstParam(sp.tab))?.key ?? "overview") as Tab;

  const ctx = await getContext();
  const { supabase, clinic, member } = ctx;
  const today = todayIn(clinic.timezone);
  const p = await loadPatient(ctx, id);
  const team = await getTeam();
  const t = await getT();
  const formatDate = (d: string) => t.date(d);
  const formatDay = (d: string) => t.day(d);
  /** "by Dr. Kiran" in a clinic team; nothing for a solo physio. */
  const by = (userId: string | null | undefined) => (team.isTeam && userId ? t("by {name}", { name: team.nameOf(userId) ?? "" }) : "");

  const [
    { activeTypes, visitTypes, rates, typeName, savedTypeName },
    slots,
    { data: sessions },
    { data: payments },
    { data: packages },
    { data: schedules },
    { data: appts },
    { data: extras },
    { data: details },
    { data: allBookings },
    { data: offRows },
    { data: caseRows },
    { data: latestPain },
  ] =
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
      supabase
        .from("patients")
        .select(DETAIL_COLUMNS)
        .eq("id", id)
        .maybeSingle(),
      supabase.from("appointments").select("booked_on, scheduled_date, status, visit_type_id").eq("patient_id", id).order("booked_on", { ascending: false }),
      // This patient's days off and the clinic's closures.
      supabase.from("days_off").select("*").or(`patient_id.is.null,patient_id.eq.${id}`).order("from_date"),
      supabase.from("cases").select("id, title, status, opened_on, closed_on, diagnosis").eq("patient_id", id).order("opened_on", { ascending: false }),
      // Latest full pain assessment, for the red-flag warning.
      supabase
        .from("pain_assessments")
        .select("assessed_on, red_flags, case_id")
        .eq("patient_id", id)
        .neq("kind", "session")
        .order("assessed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const visits = (sessions ?? []) as Visit[];
  const cases = (caseRows ?? []) as { id: string; title: string; status: "active" | "discharged"; opened_on: string; closed_on: string | null; diagnosis: string | null }[];
  const redFlags = (latestPain?.[0]?.red_flags as string[] | undefined) ?? [];
  const { data: itemRows } = visits.length
    ? await supabase.from("session_items").select("session_id, name").in("session_id", visits.map((v) => v.id)).order("sort")
    : { data: [] };
  const doneIn = new Map<string, string[]>();
  for (const it of itemRows ?? []) doneIn.set(it.session_id as string, [...(doneIn.get(it.session_id as string) ?? []), it.name as string]);
  const paid = (payments ?? []) as Payment[];
  const pkgs = (packages ?? []) as Package[];
  const plans = (schedules ?? []) as Plan[];
  const upcoming = (appts ?? []) as Appointment[];
  const charges = (extras ?? []) as Charge[];

  const plan = planOn(plans, today);
  const futurePlan = plans.find((pl) => pl.valid_from > today);
  // For receipts: the session after today. For "Next:" on screen: today, if it's still to be marked.
  const daysOff = (offRows ?? []) as DayOff[];
  const isOff = isOffFor(daysOff, p.id);
  const offToday = offOn(daysOff, p.id, today);
  const next = nextVisit(plan, upcoming.map((a) => a.scheduled_date), today, isOff);
  const attendedDates = visits.filter((v) => v.status === "attended").map((v) => v.session_date);
  const ends = plan && p.sessions_left > 0 ? projectedEnd(plan, today, p.sessions_left, attendedDates, isOff) : null;
  const todaySession = visits.find((v) => v.session_date === today);
  const todayBooking = upcoming.find((a) => a.scheduled_date === today);
  const todayType = todayBooking?.visit_type_id ?? (plan && planVisitType(plan, today)) ?? p.default_visit_type_id;
  const expectedToday = Boolean(todayBooking) || Boolean(plan && isScheduledDay(plan, today));
  const nextShown = expectedToday && !todaySession && !offToday ? today : next;

  // Just cancelled some days: offer a WhatsApp message to let the patient know.
  const notifyParam = firstParam(sp.notify);
  const notifyRanges = notifyParam
    ? notifyParam.split(",").map((r) => {
        const [from, to] = r.split("~");
        return { from, to: to ?? from };
      })
    : [];
  const makeup = firstParam(sp.makeup) || null;
  const notifyText =
    notifyRanges.length && p.phone
      ? cancellationNotice(
          patientName(p),
          notifyRanges,
          firstParam(sp.by) === "clinic" ? "clinic" : "patient",
          makeup,
          nextVisit(plan, upcoming.map((a) => a.scheduled_date), notifyRanges.at(-1)!.to, isOff),
          { clinic, physioName: physioName(member) },
          p.language,
        )
      : null;
  const sender = { clinic, physioName: physioName(member) };
  const money = (n: number) => t.money(n, clinic.currency);
  const base = `/patients/${p.id}`;
  const remainingOf = new Map(slots.map((s) => [s.id, s.remaining]));

  /** "Mon, Wed: In-clinic · Sat: Home visit" for mixed schedules. */
  const planTypes = (pl: Plan) => {
    if (pl.mode !== "fixed_days" || Object.keys(pl.day_visit_types ?? {}).length === 0) return typeName(pl.visit_type_id);
    const groups = new Map<string, string[]>();
    for (const d of pl.weekdays) {
      const type = typeName(pl.day_visit_types[String(d)] ?? pl.visit_type_id);
      groups.set(type, [...(groups.get(type) ?? []), t.weekday(WEEKDAYS[d - 1].n)]);
    }
    return [...groups].map(([type, days]) => `${days.join(", ")}: ${type}`).join(" · ");
  };

  // Account ledger: everything that changes the balance, oldest first, with a running balance.
  const ledger: LedgerRow[] = [
    ...pkgs.map((pkg) => ({
      key: `pk${pkg.id}`,
      date: pkg.start_date,
      order: 0,
      label: t("Package: {title}", { title: pkg.title }),
      detail: `${pkg.total_sessions} × ${pkg.visit_type_id ? typeName(pkg.visit_type_id) : t("any visit type")} · ${t("{n} left", { n: remainingOf.get(pkg.id) ?? 0 })}${
        pkg.sessions_used_before > 0 ? ` · ${t("{n} done before app", { n: pkg.sessions_used_before })}` : ""
      }`,
      amount: Number(pkg.price),
      remove: (
        <form action={deletePackage.bind(null, pkg.id)}>
          <ConfirmButton className="text-xs text-muted underline" confirmText={t("Remove package?")}>
            {t("Remove")}
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
        detail: v.status === "attended" ? t("Visit fee") : t("{status} — fee", { status: t(STATUS[v.status].label) }),
        amount: Number(v.charge),
      })),
    ...charges.map((c) => ({
      key: `c${c.id}`,
      date: c.charge_date,
      order: 2,
      label: c.description,
      detail: c.amount < 0 ? t("Discount") : t("Extra charge"),
      amount: Number(c.amount),
      remove: (
        <form action={deleteCharge.bind(null, c.id)}>
          <ConfirmButton className="text-xs text-muted underline" confirmText={t("Remove?")}>
            {t("Remove")}
          </ConfirmButton>
        </form>
      ),
    })),
    ...paid.map((pay) => ({
      key: `p${pay.id}`,
      date: pay.paid_on,
      order: 3,
      label: t("Payment · {method}", { method: pay.method.toUpperCase() }),
      detail: [pay.note, by(pay.recorded_by)].filter(Boolean).join(" · ") || undefined,
      amount: -Number(pay.amount),
      receipt: p.phone ? whatsappLink(p.phone, paymentReceipt(p, pay, sender)) : undefined,
      remove: (
        <form action={deletePayment.bind(null, pay.id)}>
          <ConfirmButton className="text-xs text-muted underline" confirmText={t("Remove payment?")}>
            {t("Remove")}
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
        back={{ href: "/patients", label: t("Patients") }}
        title={
          <>
            {patientName(p)}
            {p.archived && <span className="chip ml-2 bg-surface-2 align-middle text-sm text-muted">{t("Archived")}</span>}
          </>
        }
        subtitle={
          [
            p.condition,
            p.default_visit_type_id ? t("Usually: {type}", { type: typeName(p.default_visit_type_id) }) : null,
            team.isTeam && p.physio_id ? team.nameOf(p.physio_id) : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={
          <Link href={`${base}/edit`} className="btn shrink-0">
            <Icon name="edit" className="size-4" /> {t("Edit")}
          </Link>
        }
      />

      {/* Contact */}
      <div className="-mt-2 mb-4 flex flex-wrap gap-2">
        {p.phone ? (
          <>
            <a href={`tel:${p.phone}`} className="btn">
              <Icon name="phone" className="size-4" /> {t("Call")}
            </a>
            <a href={whatsappLink(p.phone, "")} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="message" className="size-4" /> WhatsApp
            </a>
            <span className="self-center text-sm text-muted">{formatPhone(p.phone)}</span>
          </>
        ) : (
          <Link href={`${base}/edit`} className="btn text-muted">
            <Icon name="plus" className="size-4" /> {t("Add phone number")}
          </Link>
        )}
      </div>

      {notifyText && (
        <a
          href={whatsappLink(p.phone, notifyText)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-whatsapp mb-3 w-full text-base"
        >
          <Icon name="message" /> {t("Let {name} know on WhatsApp", { name: p.name.split(" ")[0] })}
        </a>
      )}

      {redFlags.length > 0 && (
        <div role="note" className="mb-3 flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad-soft p-3 text-base">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-bad" />
          <div>
            <p className="text-sm font-semibold text-bad">{t("Red flags")}</p>
            <p>{redFlags.map((f) => t(f)).join(" · ")}</p>
          </div>
        </div>
      )}

      {/* Pinned precautions — on every tab, before anything else */}
      {details?.precautions && (
        <div role="note" className="mb-3 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-3 text-base">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-warn" />
          <div>
            <p className="text-sm font-semibold text-warn">{t("Precautions")}</p>
            <p className="whitespace-pre-line">{details.precautions}</p>
          </div>
        </div>
      )}

      {/* Status at a glance */}
      <section className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            {p.sessions_bought > 0 ? (
              <>
                <p className="text-sm text-muted">{t("Package sessions left")}</p>
                <p className={`text-4xl font-semibold ${p.sessions_left <= 1 ? "text-warn" : ""}`}>{p.sessions_left}</p>
                <p className="text-sm text-muted">{t("{used} of {total} used", { used: p.sessions_used, total: p.sessions_bought })}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">{t("Visits so far")}</p>
                <p className="text-4xl font-semibold">{p.visits}</p>
                <p className="text-sm text-muted">{t("Pay per visit")}</p>
              </>
            )}
          </div>
          <div>
            <p className="text-sm text-muted">{p.amount_due < 0 ? t("Paid in advance") : t("Money due")}</p>
            {p.amount_due > 0 ? (
              <p className="text-4xl font-semibold text-bad">{money(p.amount_due)}</p>
            ) : p.amount_due < 0 ? (
              <p className="text-4xl font-semibold text-ok">{money(-p.amount_due)}</p>
            ) : (
              <p className="flex items-center gap-1.5 pt-1.5 text-xl font-semibold text-ok">
                <Icon name="check" /> {t("All paid")}
              </p>
            )}
            <p className="text-sm text-muted">{t("{paid} paid of {billed}", { paid: money(p.amount_paid), billed: money(p.amount_billed) })}</p>
          </div>
        </div>
        <SessionDots used={Math.min(p.sessions_used, p.sessions_bought)} total={p.sessions_bought} />
        <div className="flex items-start justify-between gap-3 border-t border-border pt-3 text-sm">
          <span>
            <span className="text-muted">{t("Fees:")} </span>
            {activeTypes
              .map((v) => {
                const own = patientFee(rates, p.id, "visit", v.id, today);
                const fee = typeof own === "number" ? own : standardFee(rates, "visit", v.id, today);
                return fee === null ? null : (
                  <span key={v.id} className="font-medium">
                    {v.name.replace(/ session$/, "")} {money(fee)}
                    {typeof own === "number" && <span className="font-normal text-brand"> {t("(own)")}</span>}
                  </span>
                );
              })
              .filter(Boolean)
              .flatMap((el, i) => (i === 0 ? [el] : [<span key={`sep${i}`} className="text-muted"> · </span>, el]))}
            {activeTypes.every((v) => standardFee(rates, "visit", v.id, today) === null && typeof patientFee(rates, p.id, "visit", v.id, today) !== "number") && (
              <span className="text-muted">{t("not set")}</span>
            )}
          </span>
          <Link href={`${base}/fees`} className="shrink-0 font-medium text-brand">
            {t("Edit fees")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-muted">{t("Schedule:")} </span>
            <span className="font-medium">{plan ? describePlan(plan, t) : t("None")}</span>
          </span>
          {nextShown && (
            <span>
              <span className="text-muted">{t("Next:")} </span>
              <span className="font-medium">{nextShown === today ? t("Today") : formatDay(nextShown)}</span>
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
                {t("{status} today", { status: t(STATUS[todaySession.status].label) })}
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
            {todaySession.status === "attended" && (
              <>
                <QuickPain sessionId={todaySession.id} score={todaySession.pain_score} editHref={`${base}/visits/${todaySession.id}`} />
                <Link href={`${base}/visits/${todaySession.id}/record`} className="btn w-full text-base">
                  <Icon name="edit" /> {doneIn.has(todaySession.id) || todaySession.notes ? t("Edit exercises & notes") : t("Add exercises & notes")}
                </Link>
              </>
            )}
            <div className="flex gap-2">
              {p.phone && (
                <a
                  href={whatsappLink(p.phone, sessionReceipt(p, todaySession, sender, next, savedTypeName(todaySession.visit_type_id)))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp flex-1 text-base"
                >
                  <Icon name="message" /> {t("Send receipt")}
                </a>
              )}
              <form action={deleteSession.bind(null, todaySession.id)}>
                <SubmitButton className="btn text-muted">{t("Undo")}</SubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <>
            {offToday && (
              <p className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <Icon name="ban" className="size-4 text-muted" />
                <span className="flex-1">{t("Off today — {why}. You can still mark them if they come.", { why: describeOff(offToday, t) })}</span>
              </p>
            )}
            <p className="mb-2.5 text-base font-medium">
              {t("Today's attendance")} <span className="font-normal text-muted">· {typeName(todayType)}</span>
            </p>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <form action={markToday.bind(null, p.id, "missed", todayType)}>
                <SubmitButton className="btn btn-bad w-full text-base">
                  <Icon name="x" /> {t("Absent")}
                </SubmitButton>
              </form>
              <form action={markToday.bind(null, p.id, "attended", todayType)}>
                <SubmitButton className="btn btn-ok w-full text-base">
                  <Icon name="check" /> {t("Present")}
                </SubmitButton>
              </form>
            </div>
            <Link href={`${base}/attendance`} className="mt-2 flex min-h-10 items-center justify-center gap-1 text-sm font-medium text-brand">
              {t("Cancelled, rescheduled or different visit type?")}
              <Icon name="chevron" className="size-4" />
            </Link>
          </>
        )}
      </section>

      {/* Main actions */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <ActionTile href={`${base}/payment`} icon="rupee" label={t("Record payment")} />
        <ActionTile href={`${base}/book`} icon="calendar" label={t("Book session")} />
        <ActionTile href={`${base}/schedule`} icon="repeat" label={plan ? t("Change schedule") : t("Set schedule")} />
      </div>

      {/* Tabs */}
      <nav className="-mx-4 mt-6 flex overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0" aria-label={t("Patient sections")}>
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "overview" ? base : `${base}?tab=${x.key}`}
            replace
            scroll={false}
            aria-current={tab === x.key ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-base font-medium ${
              tab === x.key ? "border-brand text-brand" : "border-transparent text-muted"
            }`}
          >
            {t(x.label)}
          </Link>
        ))}
      </nav>

      <div className="pt-2">
        {tab === "overview" && (
          <Overview
            p={p}
            details={details as PatientDetails | null}
            visits={visits}
            payments={paid}
            packages={pkgs}
            charges={charges}
            plans={plans}
            plan={plan}
            upcoming={upcoming}
            allBookings={allBookings ?? []}
            patientRates={rates.filter((r) => r.patient_id === p.id)}
            ends={ends}
            today={today}
            currency={clinic.currency}
            clinicCountry={clinic.country}
            typeName={typeName}
            typeNames={Object.fromEntries(visitTypes.map((v) => [v.id, v.name]))}
            summaryLink={p.phone ? whatsappLink(p.phone, statement(p, visits, sender, savedTypeName)) : null}
            base={base}
            t={t}
            daysOff={daysOff}
            activeCases={cases.filter((cs) => cs.status === "active")}
          />
        )}

        {tab === "history" && (
          <>
            <Link href={`${base}/cases/new`} className="btn btn-primary mt-4 w-full text-base">
              <Icon name="plus" /> {t("New case")}
            </Link>
            <SectionTitle aside={cases.length ? (cases.length === 1 ? t("1 case") : t("{n} cases", { n: cases.length })) : undefined}>{t("Cases")}</SectionTitle>
            {cases.length === 0 ? (
              <p className="card text-base text-muted">
                {t("No case history yet. Open a case to record the initial assessment, pain, what's done each session and the outcome.")}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {[...cases]
                  .sort((a, b) => Number(a.status === "discharged") - Number(b.status === "discharged"))
                  .map((cs) => (
                    <li key={cs.id}>
                      <Link href={`${base}/cases/${cs.id}`} className="card flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-semibold">{cs.title}</span>
                          <span className="block text-sm text-muted">
                            <span className={`chip mr-1.5 ${cs.status === "active" ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                              {cs.status === "active" ? t("Active") : t("Discharged")}
                            </span>
                            {formatDate(cs.opened_on)} – {cs.closed_on ? formatDate(cs.closed_on) : t("now")}
                          </span>
                          {cs.diagnosis && <span className="mt-1 block truncate text-sm">{cs.diagnosis}</span>}
                        </span>
                        <Icon name="chevron" className="size-5 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}

        {tab === "visits" && (
          <>
            <Link href={`${base}/past-sessions`} className="btn mt-4 w-full text-base">
              <Icon name="history" /> {t("Add past sessions")}
            </Link>
            <SectionTitle aside={t("{n} attended", { n: p.visits })}>{t("All visits")}</SectionTitle>
            {p.sessions_prior > 0 && (
              <p className="mb-2 rounded-2xl bg-surface-2 px-4 py-3 text-base text-muted">
                {p.sessions_prior === 1
                  ? t("+ 1 earlier session from before the app (no dates)")
                  : t("+ {n} earlier sessions from before the app (no dates)", { n: p.sessions_prior })}
              </p>
            )}
            {visits.length === 0 ? (
              p.sessions_prior === 0 && <p className="card text-base text-muted">{t("No visits recorded yet.")}</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {visits.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`chip mt-0.5 w-24 shrink-0 justify-center gap-1 py-1 ${STATUS[v.status].className}`}>
                      <Icon name={STATUS[v.status].icon} className="size-3.5" />
                      {t(STATUS[v.status].short)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {formatDate(v.session_date)}
                        {by(v.recorded_by) && <span className="text-sm font-normal text-muted"> · {by(v.recorded_by)}</span>}
                      </span>
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
                      {v.pain_score !== null && <span className="block text-sm text-muted">{t("Pain {n}/10", { n: v.pain_score })}</span>}
                      {doneIn.has(v.id) && <span className="block text-sm">{doneIn.get(v.id)!.join(" · ")}</span>}
                      {v.status === "attended" && (
                        <Link href={`${base}/visits/${v.id}/record`} className="block text-sm font-medium text-brand">
                          {doneIn.has(v.id) || v.notes ? t("Session record") : t("+ Exercises & notes")}
                        </Link>
                      )}
                      {v.appointments && <span className="block text-sm text-muted">{t("Booked on {date}", { date: formatDate(v.appointments.booked_on) })}</span>}
                      {v.notes && <span className="block text-sm text-muted">{v.notes}</span>}
                    </span>
                    <Link href={`${base}/visits/${v.id}`} className="btn min-h-10 shrink-0 px-3 text-sm">
                      <Icon name="edit" className="size-4" /> {t("Edit")}
                    </Link>
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
                <Icon name="package" /> {t("New package")}
              </Link>
              <Link href={`${base}/charge`} className="btn text-base">
                <Icon name="plus" /> {t("Charge / discount")}
              </Link>
            </div>

            <SectionTitle
              aside={p.amount_due < 0 ? t("{amount} advance", { amount: money(-p.amount_due) }) : t("{amount} due", { amount: money(p.amount_due) })}
            >
              {t("Statement")}
            </SectionTitle>
            {ledgerWithBalance.length === 0 ? (
              <p className="card text-base text-muted">{t("Nothing charged or paid yet.")}</p>
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
                              {t("Send receipt")}
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
                      <span className="block text-xs text-muted">{t("bal. {amount}", { amount: money(r.balance) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <SectionTitle>{t("Fees for this patient")}</SectionTitle>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {activeTypes.map((v) => {
                const own = patientFee(rates, p.id, "visit", v.id, today);
                const std = standardFee(rates, "visit", v.id, today);
                const fee = typeof own === "number" ? own : std;
                return (
                  <li key={v.id}>
                    <Link href={`${base}/fees`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{v.name}</span>
                        <span className="block text-sm text-muted">{typeof own === "number" ? t("Custom fee for this patient") : t("Standard fee")}</span>
                      </span>
                      <span className={`font-semibold ${fee === null ? "text-muted" : ""}`}>{fee === null ? t("Not set") : money(fee)}</span>
                      <Icon name="chevron" className="size-5 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 px-1 text-sm text-muted">{t("Changing a fee only affects visits from the date you choose — past visits keep their price.")}</p>
          </>
        )}

        {tab === "schedule" && (
          <>
            <SectionTitle>{t("Current schedule")}</SectionTitle>
            <div className="card space-y-3">
              {plan ? (
                <div>
                  <p className="text-xl font-semibold">{describePlan(plan, t)}</p>
                  <p className="text-base">{planTypes(plan)}</p>
                  <p className="text-base text-muted">
                    {t("Since {date}", { date: formatDate(plan.valid_from) })}
                    {plan.valid_until ? ` · ${t("until {date}", { date: formatDate(plan.valid_until) })}` : ""}
                    {plan.note ? ` · ${plan.note}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-base text-muted">{t("No regular schedule — the patient comes only when booked.")}</p>
              )}
              {futurePlan && futurePlan !== plan && (
                <p className="rounded-xl bg-brand-soft px-3 py-2 text-base text-brand">
                  {t("Changes to {plan} from {date}", { plan: describePlan(futurePlan, t), date: formatDate(futurePlan.valid_from) })}
                </p>
              )}
              <div className="flex gap-2">
                <Link href={`${base}/schedule`} className="btn btn-primary flex-1 text-base">
                  <Icon name="repeat" /> {plan ? t("Change schedule") : t("Set schedule")}
                </Link>
                {plan && !plan.valid_until && (
                  <form action={endPlan.bind(null, plan.id)}>
                    <ConfirmButton className="btn text-base text-muted" confirmText={t("Stop schedule?")}>
                      {t("Stop")}
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </div>

            <SectionTitle
              aside={
                <Link href={`${base}/cancel-days`} className="text-brand normal-case">
                  {t("+ Take a break")}
                </Link>
              }
            >
              {t("Days off")}
            </SectionTitle>
            {daysOff.filter((d) => d.to_date >= today).length === 0 ? (
              <p className="card text-base text-muted">{t("No days off coming up. Cancel days from the calendar or Coming up on the Overview.")}</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {daysOff
                  .filter((d) => d.to_date >= today)
                  .map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {d.from_date === d.to_date ? formatDay(d.from_date) : `${formatDay(d.from_date)} – ${formatDay(d.to_date)}`}
                        </span>
                        <span className="block text-sm text-muted">{describeOff(d, t)}</span>
                      </span>
                      {d.patient_id ? (
                        <form action={restorePatientDay.bind(null, d.id, p.id)}>
                          <ConfirmButton className="btn min-h-10 px-3 text-sm" confirmText={t("Restore?")}>
                            {t("Restore")}
                          </ConfirmButton>
                        </form>
                      ) : (
                        <Link href="/profile/days-off" className="btn min-h-10 px-3 text-sm text-muted">
                          {t("Clinic")}
                        </Link>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            {plans.length > 0 && (
              <>
                <SectionTitle>{t("History")}</SectionTitle>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {plans.map((pl) => (
                    <li key={pl.id} className="px-4 py-3">
                      <p className="font-medium">{describePlan(pl, t)}</p>
                      <p className="text-sm">{planTypes(pl)}</p>
                      <p className="text-sm text-muted">
                        {formatDate(pl.valid_from)} – {pl.valid_until ? formatDate(pl.valid_until) : t("now")}
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
