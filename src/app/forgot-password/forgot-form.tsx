"use client";

import { useFormAction } from "@/lib/use-form-action";
import { SubmitButton } from "@/components/submit-button";
import { requestPasswordReset } from "../login/actions";

export function ForgotForm() {
  const [state, onSubmit, pending] = useFormAction(requestPasswordReset, undefined);

  if (state?.message) {
    return (
      <div className="card space-y-2">
        <p className="text-base font-medium">Check your email</p>
        <p className="text-base text-muted">{state.message}</p>
        <p className="text-sm text-muted">Didn&apos;t get it? Check spam, or wait a minute and try again.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" autoFocus />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText="Sending…" pending={pending}>
        Send reset link
      </SubmitButton>
    </form>
  );
}
