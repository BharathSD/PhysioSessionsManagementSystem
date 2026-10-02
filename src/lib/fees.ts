// Dated fees. The fee for a visit is the one in force on the visit's date:
// the patient's own fee if they have one then, otherwise the clinic standard.

import type { Rate, RateKind } from "./types";

type Lookup = { patientId: string | null; kind: RateKind; visitTypeId: string | null; date: string };

function latest(rates: Rate[], date: string): Rate | undefined {
  return rates.filter((r) => r.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
}

function sameKind(r: Rate, kind: RateKind, visitTypeId: string | null) {
  return r.kind === kind && (kind !== "visit" || r.visit_type_id === visitTypeId);
}

/** Clinic standard fee on a date (null = not set). */
export function standardFee(rates: Rate[], kind: RateKind, visitTypeId: string | null, date: string): number | null {
  const r = latest(rates.filter((r) => r.patient_id === null && sameKind(r, kind, visitTypeId)), date);
  return r?.amount == null ? null : Number(r.amount);
}

/** The patient's own fee on a date: a number, "standard" (uses the clinic fee), or undefined (never customised). */
export function patientFee(rates: Rate[], patientId: string, kind: RateKind, visitTypeId: string | null, date: string): number | "standard" | undefined {
  const r = latest(rates.filter((r) => r.patient_id === patientId && sameKind(r, kind, visitTypeId)), date);
  if (!r) return undefined;
  return r.amount == null ? "standard" : Number(r.amount);
}

/** The fee that applies. null = no fee has been set. */
export function feeFor(rates: Rate[], { patientId, kind, visitTypeId, date }: Lookup): number | null {
  const own = patientId ? patientFee(rates, patientId, kind, visitTypeId, date) : undefined;
  return typeof own === "number" ? own : standardFee(rates, kind, visitTypeId, date);
}

/** History of one fee, newest first. */
export function feeHistory(rates: Rate[], patientId: string | null, kind: RateKind, visitTypeId: string | null): Rate[] {
  return rates
    .filter((r) => r.patient_id === patientId && sameKind(r, kind, visitTypeId))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
}

// ---------------------------------------------------------------------------
// Pricing a visit
// ---------------------------------------------------------------------------

/** A package with sessions still unused. */
export type Slot = { id: string; visit_type_id: string | null; start_date: string; remaining: number };

export type VisitOutcome = "attended" | "missed" | "cancelled_patient" | "cancelled_clinic";

const FEE_KIND = { attended: "visit", missed: "no_show", cancelled_patient: "cancellation" } as const;
const FEE_LABEL = { visit: "visit", no_show: "no-show", cancellation: "cancellation" } as const;

/** Oldest matching package with sessions left, preferring ones that had started by `date`. */
function pickSlot(slots: Slot[], visitTypeId: string | null, date: string): Slot | undefined {
  const usable = slots
    .filter((s) => s.remaining > 0 && (s.visit_type_id === null || s.visit_type_id === visitTypeId))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return usable.find((s) => s.start_date <= date) ?? usable[0];
}

/**
 * How a visit is paid for:
 *   - present: a matching package session if one is left, else the visit fee in force that day;
 *   - absent / cancelled by patient, when charged: a package session if left, else the
 *     no-show / cancellation fee;
 *   - cancelled by clinic, or not charged: nothing.
 * Uses up the package session in `slots`, so a batch of visits can be priced in date order.
 */
export function priceVisit(o: {
  rates: Rate[];
  slots: Slot[];
  patientId: string;
  date: string;
  status: VisitOutcome;
  visitTypeId: string | null;
  chargeIt: boolean;
}): { package_id: string | null; charge: number } | { error: string } {
  if (o.status === "cancelled_clinic" || (o.status !== "attended" && !o.chargeIt)) return { package_id: null, charge: 0 };

  const slot = pickSlot(o.slots, o.visitTypeId, o.date);
  if (slot) {
    slot.remaining -= 1;
    return { package_id: slot.id, charge: 0 };
  }

  const kind = FEE_KIND[o.status];
  const fee = feeFor(o.rates, { patientId: o.patientId, kind, visitTypeId: o.visitTypeId, date: o.date });
  if (fee === null && kind !== "visit") {
    return { error: `No ${FEE_LABEL[kind]} fee is set yet. Add one in Profile → Fees, then try again.` };
  }
  return { package_id: null, charge: fee ?? 0 };
}

/** Could an absence / patient cancellation be charged (a package session left, or a fee set)? */
export function canChargeMiss(
  rates: Rate[],
  o: { patientId: string; sessionsLeft: number; status: string; visitTypeId: string | null; date: string },
): boolean {
  if (o.status !== "missed" && o.status !== "cancelled_patient") return false;
  if (o.sessionsLeft > 0) return true;
  const kind = o.status === "missed" ? "no_show" : "cancellation";
  return feeFor(rates, { patientId: o.patientId, kind, visitTypeId: o.visitTypeId, date: o.date }) !== null;
}

/** One step in a patient's fee history for a visit type. */
export type FeeStep = { from: string; amount: number | null; source: "standard" | "custom" };

/**
 * A patient's fee for a visit type over time, oldest first: their own fee
 * where they have one, otherwise the clinic standard (so changes to the
 * standard fee show up too while the patient is on it).
 */
export function feeTimeline(rates: Rate[], patientId: string, visitTypeId: string): FeeStep[] {
  const dates = [
    ...new Set(
      rates
        .filter((r) => r.kind === "visit" && r.visit_type_id === visitTypeId && (r.patient_id === null || r.patient_id === patientId))
        .map((r) => r.effective_from),
    ),
  ].sort();
  const steps: FeeStep[] = [];
  for (const from of dates) {
    const own = patientFee(rates, patientId, "visit", visitTypeId, from);
    const step: FeeStep =
      typeof own === "number"
        ? { from, amount: own, source: "custom" }
        : { from, amount: standardFee(rates, "visit", visitTypeId, from), source: "standard" };
    const prev = steps.at(-1);
    if (!prev || prev.amount !== step.amount || prev.source !== step.source) steps.push(step);
  }
  return steps;
}
