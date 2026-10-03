import { describe, expect, it } from "vitest";
import { canChargeMiss, feeFor, feeTimeline, priceVisit, type Slot } from "@/lib/fees";
import type { Rate } from "@/lib/types";

const CLINIC = "clinic-visit";
const HOME = "home-visit";
let n = 0;
const rate = (o: Partial<Rate>): Rate => ({
  id: `r${n++}`,
  patient_id: null,
  kind: "visit",
  visit_type_id: CLINIC,
  amount: 0,
  effective_from: "2000-01-01",
  ...o,
});

const rates: Rate[] = [
  rate({ amount: 600, effective_from: "2026-01-01" }),
  rate({ amount: 700, effective_from: "2026-10-01" }), // price rise from 1 Oct
  rate({ visit_type_id: HOME, amount: 1000, effective_from: "2026-01-01" }),
  rate({ patient_id: "rahul", amount: 500, effective_from: "2026-06-01" }), // Rahul's own clinic fee
  rate({ patient_id: "rahul", amount: null, effective_from: "2026-11-01" }), // back to standard from Nov
  rate({ kind: "no_show", visit_type_id: null, amount: 300, effective_from: "2026-01-01" }),
];

describe("which fee applies", () => {
  it("uses the fee in force on the visit's date", () => {
    expect(feeFor(rates, { patientId: "meena", kind: "visit", visitTypeId: CLINIC, date: "2026-09-30" })).toBe(600);
    expect(feeFor(rates, { patientId: "meena", kind: "visit", visitTypeId: CLINIC, date: "2026-10-01" })).toBe(700);
  });

  it("uses the fee for the visit type", () => {
    expect(feeFor(rates, { patientId: "meena", kind: "visit", visitTypeId: HOME, date: "2026-10-01" })).toBe(1000);
  });

  it("prefers the patient's own fee while it applies, then goes back to standard", () => {
    expect(feeFor(rates, { patientId: "rahul", kind: "visit", visitTypeId: CLINIC, date: "2026-05-31" })).toBe(600);
    expect(feeFor(rates, { patientId: "rahul", kind: "visit", visitTypeId: CLINIC, date: "2026-10-15" })).toBe(500);
    expect(feeFor(rates, { patientId: "rahul", kind: "visit", visitTypeId: CLINIC, date: "2026-11-02" })).toBe(700);
    expect(feeFor(rates, { patientId: "rahul", kind: "visit", visitTypeId: HOME, date: "2026-10-15" })).toBe(1000);
  });

  it("returns null when no fee is set", () => {
    expect(feeFor(rates, { patientId: "x", kind: "visit", visitTypeId: "online", date: "2026-10-15" })).toBeNull();
  });

  it("builds a patient's fee history, including standard changes while on standard", () => {
    expect(feeTimeline(rates, "rahul", CLINIC)).toEqual([
      { from: "2026-01-01", amount: 600, source: "standard" },
      { from: "2026-06-01", amount: 500, source: "custom" },
      { from: "2026-11-01", amount: 700, source: "standard" },
    ]);
    expect(feeTimeline(rates, "meena", CLINIC)).toEqual([
      { from: "2026-01-01", amount: 600, source: "standard" },
      { from: "2026-10-01", amount: 700, source: "standard" },
    ]);
  });
});

describe("pricing a visit", () => {
  const slots = (): Slot[] => [
    { id: "pkgClinic", visit_type_id: CLINIC, start_date: "2026-09-01", remaining: 1 },
    { id: "pkgAny", visit_type_id: null, start_date: "2026-09-15", remaining: 1 },
  ];
  const base = { rates, patientId: "meena", date: "2026-10-02", chargeIt: false };

  it("uses matching packages oldest-first, then charges the fee", () => {
    const s = slots();
    // A home visit can't use the clinic-only package, so it uses "any type".
    expect(priceVisit({ ...base, slots: s, status: "attended", visitTypeId: HOME })).toEqual({ package_id: "pkgAny", charge: 0 });
    expect(priceVisit({ ...base, slots: s, status: "attended", visitTypeId: HOME })).toEqual({ package_id: null, charge: 1000 });
    expect(priceVisit({ ...base, slots: s, status: "attended", visitTypeId: CLINIC })).toEqual({ package_id: "pkgClinic", charge: 0 });
    expect(priceVisit({ ...base, slots: s, status: "attended", visitTypeId: CLINIC })).toEqual({ package_id: null, charge: 700 });
  });

  it("doesn't charge absences unless asked", () => {
    expect(priceVisit({ ...base, slots: slots(), status: "missed", visitTypeId: CLINIC })).toEqual({ package_id: null, charge: 0 });
  });

  it("charges an absence from the package first, else the no-show fee", () => {
    expect(priceVisit({ ...base, slots: slots(), status: "missed", visitTypeId: CLINIC, chargeIt: true })).toEqual({
      package_id: "pkgClinic",
      charge: 0,
    });
    expect(priceVisit({ ...base, slots: [], status: "missed", visitTypeId: CLINIC, chargeIt: true })).toEqual({ package_id: null, charge: 300 });
  });

  it("refuses to charge a cancellation when no cancellation fee is set", () => {
    expect(priceVisit({ ...base, slots: [], status: "cancelled_patient", visitTypeId: CLINIC, chargeIt: true })).toHaveProperty("error");
    expect(canChargeMiss(rates, { patientId: "m", sessionsLeft: 0, status: "cancelled_patient", visitTypeId: CLINIC, date: "2026-10-02" })).toBe(false);
    expect(canChargeMiss(rates, { patientId: "m", sessionsLeft: 0, status: "missed", visitTypeId: CLINIC, date: "2026-10-02" })).toBe(true);
  });

  it("never charges a clinic cancellation", () => {
    expect(priceVisit({ ...base, slots: slots(), status: "cancelled_clinic", visitTypeId: CLINIC, chargeIt: true })).toEqual({
      package_id: null,
      charge: 0,
    });
  });
});
