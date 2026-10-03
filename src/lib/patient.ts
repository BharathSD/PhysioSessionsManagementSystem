import { notFound } from "next/navigation";
import type { getContext } from "./context";
import { toSummary } from "./data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One patient's balance summary, or a 404 page. */
export async function loadPatient({ supabase }: Awaited<ReturnType<typeof getContext>>, id: string) {
  if (!UUID.test(id)) notFound();
  const { data } = await supabase.from("patient_summary").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return toSummary(data);
}

/** The patient's details beyond the summary: About, clinical details, contacts. */
// One string literal (not joined), so Supabase can type the rows it returns.
export const DETAIL_COLUMNS =
  "date_of_birth, dob_is_estimate, gender, address, address_line2, city, state, postal_code, address_country, latitude, longitude, emergency_title, emergency_name, emergency_relation, emergency_phone, referred_by_title, referred_by, injury_date, goals, precautions";
