"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDesignation, splitDesignation } from "@/lib/names";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  // "Dr. Priya" typed into the name works too: the title moves to the designation.
  const typed = splitDesignation(String(form.get("full_name") ?? ""));
  const fullName = typed.name;
  const picked = String(form.get("designation") ?? "");
  const designation = (isDesignation(picked) && picked) || typed.designation;
  const password = String(form.get("password") ?? "");
  if (!fullName) return { error: "Please enter your name." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? "").trim(),
    password,
    options: {
      data: { full_name: fullName, designation, clinic_name: String(form.get("clinic_name") ?? "").trim() },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  // With email confirmation on (Supabase default), there's no session yet.
  if (!data.session) return { message: "Almost done! Check your email and tap the confirmation link." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Sends a password-reset link. Says the same thing whether or not the email has an account. */
export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email you signed up with." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: "Too many emails sent recently. Please wait a few minutes and try again." };
  }
  return { message: `If ${email} has an account, a reset link is on its way. Open it on this device.` };
}

/** Sets a new password for the signed-in user (after a reset link, or from Profile). */
export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: /different from the old/i.test(error.message) ? "Choose a password different from your current one." : error.message };
  }
  redirect(`/?${new URLSearchParams({ done: "Password updated" })}`);
}
