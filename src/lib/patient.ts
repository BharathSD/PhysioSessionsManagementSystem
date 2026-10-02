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
