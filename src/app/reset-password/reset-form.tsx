"use client";

import { useFormAction } from "@/lib/use-form-action";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { updatePassword } from "../login/actions";

export function ResetForm() {
  const [state, onSubmit, pending] = useFormAction(updatePassword, undefined);

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <label className="field">
        <span>New password</span>
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" autoFocus />
      </label>
      <label className="field">
        <span>Type it again</span>
        <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText="Saving…" pending={pending}>
        Save new password
      </SubmitButton>
    </form>
  );
}
