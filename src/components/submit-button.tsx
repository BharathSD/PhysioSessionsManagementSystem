"use client";

import { useFormStatus } from "react-dom";

/** Disables itself while the form is submitting, so a double tap can't record twice. */
export function SubmitButton({
  children,
  className = "btn",
  pendingText,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className} {...props}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
