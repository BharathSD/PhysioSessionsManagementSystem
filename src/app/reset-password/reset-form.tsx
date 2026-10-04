"use client";

import { useFormAction } from "@/lib/use-form-action";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/i18n/client";
import { updatePassword } from "../login/actions";

export function ResetForm() {
  const [state, onSubmit, pending] = useFormAction(updatePassword, undefined);
  const t = useT();

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <label className="field">
        <span>{t("New password")}</span>
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" autoFocus />
      </label>
      <label className="field">
        <span>{t("Type it again")}</span>
        <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText={t("Saving…")} pending={pending}>
        {t("Save new password")}
      </SubmitButton>
    </form>
  );
}
