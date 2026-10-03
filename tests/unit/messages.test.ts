import { describe, expect, it } from "vitest";
import { cancellationNotice, closureNotice, paymentReceipt, sessionReceipt, statement } from "@/lib/messages";
import type { Clinic, PatientSummary, Session } from "@/lib/types";

const clinic: Clinic = { id: "c", name: "Priya Physio", phone: null, upi_id: "priya@okhdfc", country: "IN", currency: "INR", timezone: "Asia/Kolkata" };
const sender = { clinic, physioName: "Dr. Priya" };
const patient: PatientSummary = {
  id: "p",
  clinic_id: "c",
  name: "Rahul",
  phone: "+919876543210",
  condition: null,
  archived: false,
  default_visit_type_id: null,
  sessions_bought: 10,
  sessions_used: 7,
  sessions_left: 3,
  visits: 7,
  sessions_prior: 0,
  amount_billed: 5000,
  amount_paid: 3500,
  amount_due: 1500,
  last_visit: "2026-10-02",
};
const session = (o: Partial<Session> = {}) =>
  ({ id: "s", session_date: "2026-10-02", status: "attended", package_id: "pkg", charge: 0, visit_type_id: null, notes: null, pain_score: null, ...o }) as Session;

describe("WhatsApp receipts", () => {
  it("confirms a package session with balance, next session and UPI", () => {
    const text = sessionReceipt(patient, session(), sender, "2026-10-05", "In-clinic session");
    expect(text).toContain("✅ In-clinic session done – 2 Oct 2026");
    expect(text).toContain("from package (7 of 10 used)");
    expect(text).toContain("3 package sessions left · ₹1,500 due");
    expect(text).toContain("Next session: Mon, 5 Oct");
    expect(text).toContain("Pay via UPI: priya@okhdfc");
  });

  it("shows the charge for a paid visit", () => {
    expect(sessionReceipt(patient, session({ package_id: null, charge: 1000 }), sender, null, "Home visit")).toContain("Charge: ₹1,000");
  });

  it("confirms a payment", () => {
    const text = paymentReceipt(patient, { amount: 2000, method: "upi", paid_on: "2026-10-01" }, sender);
    expect(text).toContain("Received ₹2,000 (UPI) on 1 Oct 2026");
  });

  it("shows advance payments and pain progress in the summary", () => {
    const text = statement(
      { ...patient, amount_due: -500 },
      [session({ session_date: "2026-09-10", pain_score: 8 }), session({ session_date: "2026-10-02", pain_score: 3 })],
      sender,
      () => "In-clinic session",
    );
    expect(text).toContain("₹500 paid in advance");
    expect(text).toContain("Pain: 8 → 3");
  });
});

describe("cancellation messages", () => {
  it("tells a patient about a clinic closure", () => {
    const text = closureNotice("Rahul", { from_date: "2026-10-20", to_date: "2026-10-24", reason: "Diwali" }, ["2026-10-21"], "2026-10-26", sender);
    expect(text).toContain("Priya Physio will be closed from");
    expect(text).toContain("(Diwali)");
    expect(text).toContain("no charge");
    expect(text).toContain("Your next session: Mon, 26 Oct");
  });

  it("words the message by who cancelled", () => {
    const ranges = [{ from: "2026-10-09", to: "2026-10-09" }];
    expect(cancellationNotice("Rahul", ranges, "clinic", null, null, sender)).toContain("I won't be available");
    expect(cancellationNotice("Rahul", ranges, "patient", "2026-10-10", null, sender)).toContain("Make-up session booked: Sat, 10 Oct");
  });
});
