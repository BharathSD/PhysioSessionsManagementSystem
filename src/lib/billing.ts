// Loading what pricing needs: visit types, dated fees and package balances.

import { cache } from "react";
import { getContext } from "./context";
import type { Slot } from "./fees";
import type { Rate, VisitType } from "./types";

type Ctx = Awaited<ReturnType<typeof getContext>>;

/** The clinic's visit types and every fee (clinic and patient), once per request. */
export const getBilling = cache(async () => {
  const { supabase } = await getContext();
  const [{ data: types, error }, { data: rates }] = await Promise.all([
    supabase.from("visit_types").select("id, name, sort, archived").order("sort").order("name"),
    supabase.from("rates").select("id, patient_id, kind, visit_type_id, amount, effective_from"),
  ]);
  if (error) throw new Error(error.message);
  const visitTypes = (types ?? []) as VisitType[];
  const typeName = new Map(visitTypes.map((t) => [t.id, t.name]));
  return {
    visitTypes,
    activeTypes: visitTypes.filter((t) => !t.archived),
    rates: ((rates ?? []) as Rate[]).map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) })),
    typeName: (id: string | null | undefined) => (id ? typeName.get(id) : undefined) ?? "Session",
  };
});

/** Each package of a patient with how many sessions are still unused. */
export async function packageSlots({ supabase }: Ctx, patientId: string): Promise<Slot[]> {
  const [{ data: pkgs }, { data: used }] = await Promise.all([
    supabase.from("packages").select("id, visit_type_id, start_date, total_sessions, sessions_used_before").eq("patient_id", patientId),
    supabase.from("sessions").select("package_id").eq("patient_id", patientId).not("package_id", "is", null),
  ]);
  const usedBy = new Map<string, number>();
  for (const s of used ?? []) usedBy.set(s.package_id as string, (usedBy.get(s.package_id as string) ?? 0) + 1);
  return (pkgs ?? []).map((p) => ({
    id: p.id,
    visit_type_id: p.visit_type_id,
    start_date: p.start_date,
    remaining: p.total_sessions - p.sessions_used_before - (usedBy.get(p.id) ?? 0),
  }));
}
