"use client";

import { useEffect, useRef } from "react";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/app/(app)/actions";
import { useT } from "@/i18n/client";
import { SubmitButton } from "./submit-button";

/** A form wired to a server action, showing its error / success message inline. */
export function ActionForm({
  action,
  submitLabel,
  resetOnSuccess = false,
  className = "space-y-3",
  children,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, onSubmit, pending] = useFormAction(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useT();

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-base text-bad">
          {t(state.error)}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-2xl bg-ok-soft p-3 text-base font-medium text-ok">
          ✓ {t(state.ok)}
        </p>
      )}
      <SubmitButton className="btn btn-primary min-h-12 w-full text-base" pendingText={t("Saving…")} pending={pending}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
