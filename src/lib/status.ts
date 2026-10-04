import { msg } from "@/i18n";
import type { SessionStatus } from "./types";

/** How each attendance outcome is shown everywhere in the app (English; shown with t()). */
export const STATUS: Record<SessionStatus, { label: string; short: string; icon: "check" | "x" | "ban"; className: string }> = {
  attended: { label: msg("Present"), short: msg("Present"), icon: "check", className: "bg-ok-soft text-ok" },
  missed: { label: msg("Absent"), short: msg("Absent"), icon: "x", className: "bg-bad-soft text-bad" },
  cancelled_patient: { label: msg("Cancelled by patient"), short: msg("Cancelled"), icon: "ban", className: "bg-warn-soft text-warn" },
  cancelled_clinic: { label: msg("Cancelled by clinic"), short: msg("Clinic cancelled"), icon: "ban", className: "bg-surface-2 text-muted" },
};

/** Outcomes that may carry a fee if the physio chooses to charge them. */
export const CHARGEABLE: SessionStatus[] = ["missed", "cancelled_patient"];
