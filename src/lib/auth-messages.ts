import { msg } from "@/i18n";

/** Supabase Auth's common error sentences, so they can be shown translated (see login/actions.ts). */
export const AUTH_MESSAGES = [
  msg("Invalid login credentials"),
  msg("User already registered"),
  msg("Email not confirmed"),
  msg("Unable to validate email address: invalid format"),
  msg("Password should be at least 6 characters."),
];
