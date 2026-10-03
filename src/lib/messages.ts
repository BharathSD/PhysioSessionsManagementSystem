// Text for the WhatsApp receipts physios send to patients. Each message is
// timestamped on the patient's phone, which is what makes it a verifiable record.

import { formatDate, formatDay, formatMoney } from "./format";
import type { Clinic, PatientSummary, Payment, Session } from "./types";

type Sender = { clinic: Clinic; physioName: string };

function balanceLine(p: PatientSummary, currency: string): string {
  const parts: string[] = [];
  if (p.sessions_bought > 0) {
    parts.push(p.sessions_left > 0 ? `${p.sessions_left} package session${p.sessions_left === 1 ? "" : "s"} left` : "Package complete");
  }
  if (p.amount_due > 0) parts.push(`${formatMoney(p.amount_due, currency)} due`);
  if (p.amount_due < 0) parts.push(`${formatMoney(-p.amount_due, currency)} paid in advance`);
  return parts.join(" · ") || "All paid up ✓";
}

function footer({ clinic, physioName }: Sender, p: PatientSummary): string {
  const lines = [`– ${physioName}, ${clinic.name}`];
  if (p.amount_due > 0 && clinic.upi_id) lines.push(`Pay via UPI: ${clinic.upi_id}`);
  return lines.join("\n");
}

/** "Home visit · ₹1,000" / "In-clinic session · from package (7 of 10)" */
function costLine(p: PatientSummary, s: Pick<Session, "package_id" | "charge">, currency: string): string {
  if (s.package_id) return `from package (${p.sessions_used} of ${p.sessions_bought} used)`;
  return Number(s.charge) > 0 ? formatMoney(s.charge, currency) : "";
}

export function sessionReceipt(
  p: PatientSummary,
  session: Pick<Session, "status" | "session_date" | "package_id" | "charge">,
  sender: Sender,
  nextVisit: string | null,
  visitTypeName: string,
): string {
  const date = formatDate(session.session_date);
  const cost = costLine(p, session, sender.clinic.currency);
  const headline = {
    attended: `✅ ${visitTypeName} done – ${date}`,
    missed: `❌ Missed ${visitTypeName.toLowerCase()} – ${date}`,
    cancelled_patient: `↩️ ${visitTypeName} on ${date} cancelled`,
    cancelled_clinic: `↩️ ${visitTypeName} on ${date} cancelled by us — sorry for the inconvenience`,
  }[session.status];

  return [
    `Hi ${p.name},`,
    headline,
    ...(cost ? [session.status === "attended" ? `Charge: ${cost}` : `Cancellation charge: ${cost}`] : []),
    balanceLine(p, sender.clinic.currency),
    ...(nextVisit ? [`📅 Next session: ${formatDay(nextVisit)}`] : []),
    "",
    footer(sender, p),
  ].join("\n");
}

export function paymentReceipt(p: PatientSummary, payment: Pick<Payment, "amount" | "method" | "paid_on">, sender: Sender): string {
  const currency = sender.clinic.currency;
  return [
    `Hi ${p.name},`,
    `💰 Received ${formatMoney(payment.amount, currency)} (${payment.method.toUpperCase()}) on ${formatDate(payment.paid_on)}. Thank you!`,
    `Total paid: ${formatMoney(p.amount_paid, currency)} of ${formatMoney(p.amount_billed, currency)}`,
    balanceLine(p, currency),
    "",
    footer(sender, p),
  ].join("\n");
}

/** "Pain: 8 → 3 (since 11 Sep)" once at least two visits have a pain score. */
function painLine(sessions: Session[]): string[] {
  const scored = sessions.filter((s) => s.pain_score !== null && s.status === "attended").sort((a, b) => a.session_date.localeCompare(b.session_date));
  if (scored.length < 2) return [];
  return [`Pain: ${scored[0].pain_score} → ${scored.at(-1)!.pain_score} (since ${formatDate(scored[0].session_date)})`];
}

export function statement(p: PatientSummary, sessions: Session[], sender: Sender, typeName: (id: string | null) => string): string {
  const currency = sender.clinic.currency;
  const icon = { attended: "✅", missed: "❌", cancelled_patient: "↩️", cancelled_clinic: "↩️" };
  const recent = sessions.slice(0, 15).map((s) => {
    const cost = Number(s.charge) > 0 ? ` · ${formatMoney(s.charge, currency)}` : s.package_id ? " · package" : "";
    return `${icon[s.status]} ${formatDate(s.session_date)} · ${typeName(s.visit_type_id)}${cost}`;
  });

  return [
    `Hi ${p.name}, here is your summary:`,
    "",
    `Visits: ${p.visits}`,
    ...(p.sessions_bought > 0 ? [`Package: ${p.sessions_used} of ${p.sessions_bought} sessions used`] : []),
    ...painLine(sessions),
    `Billed: ${formatMoney(p.amount_billed, currency)} · Paid: ${formatMoney(p.amount_paid, currency)}`,
    balanceLine(p, currency),
    ...(recent.length ? ["", "Recent visits:", ...recent] : []),
    "",
    footer(sender, p),
  ].join("\n");
}
