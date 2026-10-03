import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Clinic, Member } from "./types";

/**
 * The signed-in physio and their clinic. Solo physios have exactly one clinic;
 * when multi-clinic support lands, this is where the "current clinic" is chosen.
 */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const email = (claims?.claims.email as string | undefined) ?? "";
  if (!userId) redirect("/login");

  const { data: member } = await supabase
    .from("clinic_members")
    .select("clinic_id, user_id, role, display_name, designation, clinics(*)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  if (!member) throw new Error("No clinic found for this account. Did the database migration run?");

  const { clinics, ...rest } = member as unknown as Member & { clinics: Clinic };
  return { supabase, userId, email, member: rest as Member, clinic: clinics };
});
