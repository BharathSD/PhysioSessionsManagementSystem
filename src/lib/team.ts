import { cache } from "react";
import { getContext } from "./context";
import { msg } from "@/i18n";
import { physioName } from "./names";
import type { Member } from "./types";

export type TeamMember = Pick<Member, "user_id" | "role" | "display_name" | "designation">;

/** Everyone in the signed-in physio's clinic. A solo physio is a team of one. */
export const getTeam = cache(async () => {
  const { supabase, clinic } = await getContext();
  const { data } = await supabase
    .from("clinic_members")
    .select("user_id, role, display_name, designation")
    .eq("clinic_id", clinic.id)
    .order("created_at");
  const members = (data ?? []) as TeamMember[];
  return {
    members,
    /** More than one physio: show who did what, and "My patients" filters. */
    isTeam: members.length > 1,
    nameOf: (userId: string | null | undefined) => {
      if (!userId) return null;
      const m = members.find((x) => x.user_id === userId);
      return m ? physioName(m) : "Former team member";
    },
  };
});

export type Who = "mine" | "all";

/** "My patients" or "Everyone": physios start with their own, owners with the whole clinic. */
export function whoFrom(param: string, member: Pick<Member, "role">): Who {
  if (param === "mine" || param === "all") return param;
  return member.role === "owner" ? "all" : "mine";
}

/** The sentences the database functions of 0013 raise, so they can be shown translated. */
export const DB_MESSAGES = [
  msg("Only a clinic owner can change roles."),
  msg("Unknown role."),
  msg("The clinic needs at least one owner. Make someone else an owner first."),
  msg("Only a clinic owner can remove people."),
  msg("To remove yourself, use Leave clinic."),
  msg("You're the only one in this clinic, so you can't leave it."),
  msg("Make someone else an owner before you leave."),
  msg("Sign in first."),
  msg("This invite link has expired or was already used. Ask the clinic for a new one."),
  msg("Your account already has its own practice with patients. Join with a different email, or contact support to combine them."),
];
