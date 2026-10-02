"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
  const fullName = String(form.get("full_name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!fullName) return { error: "Please enter your name." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? "").trim(),
    password,
    options: {
      data: { full_name: fullName, clinic_name: String(form.get("clinic_name") ?? "").trim() },
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
