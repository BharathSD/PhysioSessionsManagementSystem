"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./(app)/actions";

// Clinic teams: invites, roles, leaving. The rules (owners only, always one
// owner, nothing lost when joining) live in the database functions of 0013.

const TOKEN = /^[0-9a-f]{32}$/;

/** Postgres raises our own sentences ("Only a clinic owner can…"); show those, in the physio's language. */
async function friendly(error: { message: string }): Promise<string> {
  const t = await getT();
  return /schema cache|does not exist/i.test(error.message)
    ? t("The database needs an update: run the newest file in supabase/migrations in the Supabase SQL Editor, then try again.")
    : t(error.message);
}

function backToTeam(message: string, extra: Record<string, string> = {}): never {
  revalidatePath("/", "layout");
  redirect(`/profile/team?${new URLSearchParams({ done: message, ...extra })}`);
}

/** Refused (e.g. "The clinic needs at least one owner"): shown as a warning on the Team page. */
function teamProblem(message: string): never {
  redirect(`/profile/team?${new URLSearchParams({ problem: message })}`);
}

export async function createInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, clinic, member } = await getContext();
  if (member.role !== "owner") return { error: (await getT())("Only a clinic owner can invite people.") };
  const role = String(form.get("role") ?? "physio") === "owner" ? "owner" : "physio";
  const { data, error } = await supabase.from("clinic_invites").insert({ clinic_id: clinic.id, role }).select("token").single();
  if (error) return { error: await friendly(error) };
  backToTeam((await getT())("Invite link ready"), { invite: data.token });
}

export async function cancelInvite(inviteId: string) {
  const { supabase } = await getContext();
  await supabase.from("clinic_invites").delete().eq("id", inviteId);
  backToTeam((await getT())("Invite cancelled"));
}

export async function setMemberRole(userId: string, role: "owner" | "physio") {
  const { supabase, clinic } = await getContext();
  const { error } = await supabase.rpc("set_member_role", { target_clinic: clinic.id, target_user: userId, new_role: role });
  if (error) teamProblem(await friendly(error));
  const t = await getT();
  backToTeam(role === "owner" ? t("Now an owner") : t("Now a physio"));
}

export async function removeMember(userId: string) {
  const { supabase, clinic } = await getContext();
  const { error } = await supabase.rpc("remove_member", { target_clinic: clinic.id, target_user: userId });
  if (error) teamProblem(await friendly(error));
  backToTeam((await getT())("Removed from the clinic"));
}

export async function leaveClinic() {
  const { supabase, clinic } = await getContext();
  const { error } = await supabase.rpc("leave_clinic", { target_clinic: clinic.id });
  if (error) teamProblem(await friendly(error));
  revalidatePath("/", "layout");
  redirect("/welcome");
}

/** Someone without a clinic (left, or was removed) starts afresh on their own. */
export async function startOwnPractice() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_own_practice");
  if (error) throw new Error(await friendly(error));
  revalidatePath("/", "layout");
  redirect(`/?${new URLSearchParams({ done: (await getT())("Your practice is ready") })}`);
}

/** A signed-in physio accepts an invite link. */
export async function acceptInvite(token: string): Promise<FormState> {
  if (!TOKEN.test(token)) return { error: (await getT())("That invite link isn't complete. Ask for it to be sent again.") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { invite_token: token });
  if (error) return { error: await friendly(error) };
  revalidatePath("/", "layout");
  redirect(`/?${new URLSearchParams({ done: (await getT())("Welcome to the clinic") })}`);
}
