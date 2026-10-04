"use client";

import { useFormAction } from "@/lib/use-form-action";
import { SubmitButton } from "@/components/submit-button";
import { useT } from "@/i18n/client";
import { requestPasswordReset } from "../login/actions";

export function ForgotForm() {
  const [state, onSubmit, pending] = useFormAction(requestPasswordReset, undefined);
  const t = useT();

  if (state?.message) {
    return (
      <div className="card space-y-2">
        <p className="text-base font-medium">{t("Check your email")}</p>
        <p className="text-base text-muted">{state.message}</p>
        <p className="text-sm text-muted">{t("Didn't get it? Check spam, or wait a minute and try again.")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <label className="field">
        <span>{t("Email")}</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" autoFocus />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText={t("Sending…")} pending={pending}>
        {t("Send reset link")}
      </SubmitButton>
    </form>
  );
}
