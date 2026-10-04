// Text for the WhatsApp receipts physios send to patients. Each message is
// timestamped on the patient's phone, which is what makes it a verifiable record.
// Messages are in the patient's language (patients.language), whatever language
// the physio uses the app in. Visit type names come in as saved (English for the
// standard ones) and are translated here.

import { isLocale, makeT, type T } from "@/i18n";
import { patientName } from "@/lib/names";
import type { Clinic, PatientSummary, Payment, Session } from "./types";

type Sender = { clinic: Clinic; physioName: string };

/** The translator for a patient's message language (English if unset or unknown). */
export const messageT = (language: string | null | undefined): T => makeT(isLocale(language) ? language : "en");

function balanceLine(t: T, p: PatientSummary, currency: string): string {
  const parts: string[] = [];
  if (p.sessions_bought > 0) {
    parts.push(
      p.sessions_left <= 0
        ? t("Package complete")
        : p.sessions_left === 1
          ? t("1 package session left")
          : t("{n} package sessions left", { n: p.sessions_left }),
    );
  }
  if (p.amount_due > 0) parts.push(t("{amount} due", { amount: t.money(p.amount_due, currency) }));
  if (p.amount_due < 0) parts.push(t("{amount} paid in advance", { amount: t.money(-p.amount_due, currency) }));
  return parts.join(" · ") || t("All paid up ✓");
}

function footer(t: T, { clinic, physioName }: Sender, p: PatientSummary): string {
  const lines = [`– ${physioName}, ${clinic.name}`];
  if (p.amount_due > 0 && clinic.upi_id) lines.push(t("Pay via UPI: {upi}", { upi: clinic.upi_id }));
  return lines.join("\n");
}

/** "₹1,000" / "from package (7 of 10 used)" */
function costLine(t: T, p: PatientSummary, s: Pick<Session, "package_id" | "charge">, currency: string): string {
  if (s.package_id) return t("from package ({used} of {total} used)", { used: p.sessions_used, total: p.sessions_bought });
  return Number(s.charge) > 0 ? t.money(s.charge, currency) : "";
}

export function sessionReceipt(
  p: PatientSummary,
  session: Pick<Session, "status" | "session_date" | "package_id" | "charge">,
  sender: Sender,
  nextVisit: string | null,
  visitTypeName: string,
): string {
  const t = messageT(p.language);
  const date = t.date(session.session_date);
  const type = t(visitTypeName);
  const cost = costLine(t, p, session, sender.clinic.currency);
  const headline = {
    attended: `✅ ${t("{type} done – {date}", { type, date })}`,
    missed: `❌ ${t("Missed {type} – {date}", { type: t.locale === "en" ? type.toLowerCase() : type, date })}`,
    cancelled_patient: `↩️ ${t("{type} on {date} cancelled", { type, date })}`,
    cancelled_clinic: `↩️ ${t("{type} on {date} cancelled by us — sorry for the inconvenience", { type, date })}`,
  }[session.status];

  return [
    t("Hi {name},", { name: patientName(p) }),
    headline,
    ...(cost ? [session.status === "attended" ? t("Charge: {cost}", { cost }) : t("Cancellation charge: {cost}", { cost })] : []),
    balanceLine(t, p, sender.clinic.currency),
    ...(nextVisit ? [`📅 ${t("Next session: {day}", { day: t.day(nextVisit) })}`] : []),
    "",
    footer(t, sender, p),
  ].join("\n");
}

export function paymentReceipt(p: PatientSummary, payment: Pick<Payment, "amount" | "method" | "paid_on">, sender: Sender): string {
  const t = messageT(p.language);
  const currency = sender.clinic.currency;
  return [
    t("Hi {name},", { name: patientName(p) }),
    `💰 ${t("Received {amount} ({method}) on {date}. Thank you!", {
      amount: t.money(payment.amount, currency),
      method: payment.method.toUpperCase(),
      date: t.date(payment.paid_on),
    })}`,
    t("Total paid: {paid} of {billed}", { paid: t.money(p.amount_paid, currency), billed: t.money(p.amount_billed, currency) }),
    balanceLine(t, p, currency),
    "",
    footer(t, sender, p),
  ].join("\n");
}

/** "Pain: 8 → 3 (since 11 Sep)" once at least two visits have a pain score. */
function painLine(t: T, sessions: Session[]): string[] {
  const scored = sessions.filter((s) => s.pain_score !== null && s.status === "attended").sort((a, b) => a.session_date.localeCompare(b.session_date));
  if (scored.length < 2) return [];
  return [t("Pain: {from} → {to} (since {date})", { from: scored[0].pain_score!, to: scored.at(-1)!.pain_score!, date: t.date(scored[0].session_date) })];
}

export function statement(p: PatientSummary, sessions: Session[], sender: Sender, typeName: (id: string | null) => string): string {
  const t = messageT(p.language);
  const currency = sender.clinic.currency;
  const icon = { attended: "✅", missed: "❌", cancelled_patient: "↩️", cancelled_clinic: "↩️" };
  const recent = sessions.slice(0, 15).map((s) => {
    const cost = Number(s.charge) > 0 ? ` · ${t.money(s.charge, currency)}` : s.package_id ? ` · ${t("package")}` : "";
    return `${icon[s.status]} ${t.date(s.session_date)} · ${t(typeName(s.visit_type_id))}${cost}`;
  });

  return [
    t("Hi {name}, here is your summary:", { name: patientName(p) }),
    "",
    t("Visits: {n}", { n: p.visits }),
    ...(p.sessions_bought > 0 ? [t("Package: {used} of {total} sessions used", { used: p.sessions_used, total: p.sessions_bought })] : []),
    ...painLine(t, sessions),
    t("Billed: {billed} · Paid: {paid}", { billed: t.money(p.amount_billed, currency), paid: t.money(p.amount_paid, currency) }),
    balanceLine(t, p, currency),
    ...(recent.length ? ["", t("Recent visits:"), ...recent] : []),
    "",
    footer(t, sender, p),
  ].join("\n");
}

/** "Mon, 20 Oct" for one day, "20 Oct – 24 Oct" for several. */
function span(t: T, from: string, to: string): string {
  if (from === to) return t.day(from);
  const short = new Intl.DateTimeFormat(t.intl, { day: "numeric", month: "short", timeZone: "UTC" });
  const f = (d: string) => short.format(new Date(`${d}T00:00:00Z`));
  return `${f(from)} – ${f(to)}`;
}

/** Telling a patient the clinic is closed. Used one tap at a time now; ready for automatic sending later. */
export function closureNotice(
  patientName: string,
  closure: { from_date: string; to_date: string; reason: string | null },
  affected: string[],
  nextAfter: string | null,
  sender: Sender,
  language?: string,
): string {
  const t = messageT(language);
  const when = span(t, closure.from_date, closure.to_date);
  const closed =
    closure.from_date === closure.to_date
      ? t("{clinic} will be closed on {when}", { clinic: sender.clinic.name, when })
      : t("{clinic} will be closed from {when}", { clinic: sender.clinic.name, when });
  const days = affected.map((d) => t.day(d)).join(", ");
  return [
    t("Hi {name},", { name: patientName }),
    `🗓️ ${closed}${closure.reason ? ` (${closure.reason})` : ""}.`,
    ...(affected.length > 0
      ? [affected.length === 1 ? t("Your session on {days} is cancelled — no charge.", { days }) : t("Your sessions on {days} are cancelled — no charge.", { days })]
      : []),
    ...(nextAfter ? [`📅 ${t("Your next session: {day}", { day: t.day(nextAfter) })}`] : []),
    "",
    `– ${sender.physioName}`,
  ].join("\n");
}

/** Confirming one patient's cancelled days (and a make-up session, if booked). */
export function cancellationNotice(
  patientName: string,
  ranges: { from: string; to: string }[],
  by: "clinic" | "patient",
  makeup: string | null,
  nextAfter: string | null,
  sender: Sender,
  language?: string,
): string {
  const t = messageT(language);
  const when = ranges.map((r) => span(t, r.from, r.to)).join(", ");
  const oneDay = ranges.length === 1 && ranges[0].from === ranges[0].to;
  return [
    t("Hi {name},", { name: patientName }),
    `🗓️ ${
      by === "clinic"
        ? oneDay
          ? t("Sorry — I won't be available on {when}, so your session is cancelled. No charge.", { when })
          : t("Sorry — I won't be available on {when}, so your sessions are cancelled. No charge.", { when })
        : t("Noted — no session on {when}. No charge.", { when })
    }`,
    ...(makeup
      ? [`📅 ${t("Make-up session booked: {day}", { day: t.day(makeup) })}`]
      : nextAfter
        ? [`📅 ${t("Your next session: {day}", { day: t.day(nextAfter) })}`]
        : []),
    "",
    `– ${sender.physioName}, ${sender.clinic.name}`,
  ].join("\n");
}
