"use client";

import { startTransition, useActionState } from "react";

/**
 * Like useActionState, but submits through onSubmit instead of the form's
 * `action` prop. React resets a form after an action-prop submission even when
 * the server answers with an error, wiping what the user typed; this keeps it.
 * Browser validation (required, min, …) still runs before onSubmit fires.
 */
export function useFormAction<S>(action: (state: Awaited<S>, form: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    // One key per submission: if a weak signal makes the app resend it, the server
    // recognises the copy and doesn't save twice (isResend in actions.ts).
    form.set("_once", oneOffKey());
    startTransition(() => dispatch(form));
  };
  return [state, onSubmit, pending] as const;
}

/** A random UUID. crypto.randomUUID only exists on https / localhost, so fall back for LAN testing. */
function oneOffKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
