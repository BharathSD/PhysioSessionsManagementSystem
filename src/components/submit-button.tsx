"use client";

import { useFormStatus } from "react-dom";

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
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className} {...props}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
