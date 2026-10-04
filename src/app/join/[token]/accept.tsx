"use client";

import { SubmitButton } from "@/components/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import { useT } from "@/i18n/client";
import { acceptInvite } from "../../team-actions";

export function AcceptInvite({ token, clinicName }: { token: string; clinicName: string }) {
  const [state, onSubmit, pending] = useFormAction(() => acceptInvite(token), undefined);
  const t = useT();
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <p className="text-base">
        {t("You're signed in. If your account has its own practice with no patients yet, it's replaced by {clinic}.", { clinic: clinicName })}
      </p>
      {state?.error && (
        <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-base text-bad">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pending={pending} pendingText={t("Joining…")}>
        {t("Join {clinic}", { clinic: clinicName })}
      </SubmitButton>
    </form>
  );
}
