import type { SessionStatus } from "./types";

/** How each attendance outcome is shown everywhere in the app. */
export const STATUS: Record<SessionStatus, { label: string; short: string; icon: "check" | "x" | "ban"; className: string }> = {
  attended: { label: "Present", short: "Present", icon: "check", className: "bg-ok-soft text-ok" },
  missed: { label: "Absent", short: "Absent", icon: "x", className: "bg-bad-soft text-bad" },
  cancelled_patient: { label: "Cancelled by patient", short: "Cancelled", icon: "ban", className: "bg-warn-soft text-warn" },
  cancelled_clinic: { label: "Cancelled by clinic", short: "Clinic cancelled", icon: "ban", className: "bg-surface-2 text-muted" },
};

/** Outcomes that may carry a fee if the physio chooses to charge them. */
export const CHARGEABLE: SessionStatus[] = ["missed", "cancelled_patient"];
