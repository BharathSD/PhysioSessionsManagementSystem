// Text for the WhatsApp receipts physios send to patients. Each message is
// timestamped on the patient's phone, which is what makes it a verifiable record.

import { formatDate, formatDay, formatMoney } from "./format";
import type { Clinic, PatientSummary, Payment, Session, SessionStatus } from "./types";

type Sender = { clinic: Clinic; physioName: string };

function balanceLine(p: PatientSummary, currency: string): string {
  const parts: string[] = [];
  const perVisit = p.rate_per_session !== null;
  if (p.sessions_bought === 0 || (p.sessions_left < 0 && perVisit)) {
    // Visits are billed per visit; the amount due says it all.
  } else if (p.sessions_left > 0) {
    parts.push(`${p.sessions_left} session${p.sessions_left === 1 ? "" : "s"} left`);
  } else if (p.sessions_left === 0) {
    parts.push("Package complete");
  } else {
    parts.push(`${-p.sessions_left} session${p.sessions_left === -1 ? "" : "s"} not yet paid for`);
  }
  if (p.amount_due > 0) parts.push(`${formatMoney(p.amount_due, currency)} due`);
  return parts.join(" · ") || "All paid up ✓";
}

function footer({ clinic, physioName }: Sender, p: PatientSummary): string {
  const lines = [`– ${physioName}, ${clinic.name}`];
  if (p.amount_due > 0 && clinic.upi_id) lines.push(`Pay via UPI: ${clinic.upi_id}`);
  return lines.join("\n");
}

const STATUS_HEADLINE: Record<SessionStatus, string> = {
  attended: "✅ Session",
  missed: "❌ Missed session",
  cancelled: "↩️ Cancelled session",
};

export function sessionReceipt(
  p: PatientSummary,
  session: Pick<Session, "status" | "session_date">,
  sender: Sender,
  nextVisit?: string | null,
): string {
  const date = formatDate(session.session_date);
  const headline =
    session.status === "attended"
      ? `${STATUS_HEADLINE.attended} ${p.sessions_attended}${p.sessions_bought ? ` of ${p.sessions_bought}` : ""} done – ${date}`
      : `${STATUS_HEADLINE[session.status]} – ${date} (not counted)`;

  return [
    `Hi ${p.name},`,
    headline,
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

export function statement(p: PatientSummary, sessions: Session[], sender: Sender): string {
  const currency = sender.clinic.currency;
  const recent = sessions
    .slice(0, 15)
    .map((s) => `${s.status === "attended" ? "✅" : s.status === "missed" ? "❌" : "↩️"} ${formatDate(s.session_date)}`);

  return [
    `Hi ${p.name}, here is your session summary:`,
    "",
    p.sessions_bought > 0 ? `Sessions: ${p.sessions_attended} attended of ${p.sessions_bought} paid` : `Visits so far: ${p.sessions_attended}`,
    balanceLine(p, currency),
    `Paid: ${formatMoney(p.amount_paid, currency)} of ${formatMoney(p.amount_billed, currency)}`,
    ...(recent.length ? ["", "Recent visits:", ...recent] : []),
    "",
    footer(sender, p),
  ].join("\n");
}
