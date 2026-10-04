"use client";

import { useOffline } from "next/offline";
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";

/** Disables itself while the form is submitting, so a double tap can't record twice. */
export function SubmitButton({
  children,
  className = "btn",
  pendingText,
  pending: pendingProp,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string; pending?: boolean }) {
  // `pending` is passed by forms that submit via useFormAction (useFormStatus can't see those).
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  const offline = useOffline();
  const t = useT();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className} {...props}>
      {/* No signal: the save is queued and goes through by itself when it's back. */}
      {pending && offline ? t("Waiting for signal…") : pending && pendingText ? pendingText : children}
    </button>
  );
}
