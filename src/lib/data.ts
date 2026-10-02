import type { PatientSummary } from "./types";

// Postgres numeric columns can arrive as strings; coerce once at the edge.
export function toSummary(row: Record<string, unknown>): PatientSummary {
  return {
    ...(row as PatientSummary),
    sessions_bought: Number(row.sessions_bought),
    sessions_used: Number(row.sessions_used),
    sessions_left: Number(row.sessions_left),
    visits: Number(row.visits),
    sessions_prior: Number(row.sessions_prior ?? 0),
    amount_billed: Number(row.amount_billed),
    amount_paid: Number(row.amount_paid),
    amount_due: Number(row.amount_due),
  };
}

export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
