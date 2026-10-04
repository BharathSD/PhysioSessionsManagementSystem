// Loading what pricing needs: visit types, dated fees and package balances.

import { cache } from "react";
import { msg } from "@/i18n";
import { getT } from "@/i18n/server";
import { getContext } from "./context";
import type { Slot } from "./fees";
import type { Rate, VisitType } from "./types";

type Ctx = Awaited<ReturnType<typeof getContext>>;

/** The visit types every clinic starts with (seeded in 0004): shown in the physio's language. */
export const DEFAULT_VISIT_TYPES = [msg("In-clinic session"), msg("Home visit"), msg("Online session"), msg("Assessment")];

/**
 * The clinic's visit types and every fee (clinic and patient), once per request.
 * Visit type `name`s are for display (the standard ones translated); `original` is as saved.
 */
export const getBilling = cache(async () => {
  const { supabase } = await getContext();
  const t = await getT();
  const [{ data: types, error }, { data: rates }] = await Promise.all([
    supabase.from("visit_types").select("id, name, sort, archived").order("sort").order("name"),
    supabase.from("rates").select("id, patient_id, kind, visit_type_id, amount, effective_from"),
  ]);
  if (error) throw new Error(error.message);
  const visitTypes = ((types ?? []) as VisitType[]).map((v) => ({ ...v, original: v.name, name: t(v.name) }));
  const typeName = new Map(visitTypes.map((v) => [v.id, v.name]));
  const savedName = new Map(visitTypes.map((v) => [v.id, v.original]));
  // Home visits show the patient's address on Today (by the saved, English-or-custom name).
  const homeTypes = new Set(visitTypes.filter((v) => /home/i.test(v.original)).map((v) => v.id));
  return {
    visitTypes,
    activeTypes: visitTypes.filter((t) => !t.archived),
    rates: ((rates ?? []) as Rate[]).map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) })),
    typeName: (id: string | null | undefined) => (id ? typeName.get(id) : undefined) ?? t("Session"),
    isHomeVisit: (id: string | null | undefined) => Boolean(id && homeTypes.has(id)),
    /** As saved (untranslated): for WhatsApp messages, which use the patient's language. */
    savedTypeName: (id: string | null | undefined) => (id ? savedName.get(id) : undefined) ?? "Session",
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
