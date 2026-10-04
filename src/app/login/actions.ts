"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDesignation, splitDesignation } from "@/lib/names";
import { safeNextPath } from "@/lib/redirect";
import { isLocale } from "@/i18n";
import { getLocale, getT, LANG_COOKIE } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const YEAR = 60 * 60 * 24 * 365;

/** The app language on this device (also saved to the physio's profile by setLanguage once signed in). */
export async function setLanguageCookie(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LANG_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: (await getT())(error.message) };
  // Their saved language follows them to this device.
  const { data: member } = await supabase.from("clinic_members").select("language").limit(1).maybeSingle();
  if (member?.language) await setLanguageCookie(member.language);
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  // "Dr. Priya" typed into the name works too: the title moves to the designation.
  const typed = splitDesignation(String(form.get("full_name") ?? ""));
  const fullName = typed.name;
  const picked = String(form.get("designation") ?? "");
  const designation = (isDesignation(picked) && picked) || typed.designation;
  const password = String(form.get("password") ?? "");
  const t = await getT();
  if (!fullName) return { error: t("Please enter your name.") };
  if (password.length < 8) return { error: t("Password must be at least 8 characters.") };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? "").trim(),
    password,
    options: {
      data: {
        full_name: fullName,
        designation,
        clinic_name: String(form.get("clinic_name") ?? "").trim(),
        // From a /join/<token> link: the new account joins that clinic instead of starting its own.
        invite: String(form.get("invite") ?? "") || undefined,
      },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: t(error.message) };
  // With email confirmation on (Supabase default), there's no session yet.
  if (!data.session) return { message: t("Almost done! Check your email and tap the confirmation link.") };
  // Keep the language they signed up in.
  await supabase.from("clinic_members").update({ language: await getLocale() }).eq("user_id", data.session.user.id);
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
  const t = await getT();
  if (!email) return { error: t("Enter the email you signed up with.") };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: t("Too many emails sent recently. Please wait a few minutes and try again.") };
  }
  return { message: t("If {email} has an account, a reset link is on its way. Open it on this device.", { email }) };
}

/** Sets a new password for the signed-in user (after a reset link, or from Profile). */
export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  const t = await getT();
  if (password.length < 8) return { error: t("Password must be at least 8 characters.") };
  if (password !== String(form.get("confirm") ?? "")) return { error: t("The two passwords don't match.") };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: /different from the old/i.test(error.message) ? t("Choose a password different from your current one.") : t(error.message) };
  }
  redirect(`/?${new URLSearchParams({ done: t("Password updated") })}`);
}
