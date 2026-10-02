"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import { SubmitButton } from "@/components/submit-button";
import { updatePassword } from "../login/actions";

export function ResetForm() {
  const [state, onSubmit, pending] = useFormAction(updatePassword, undefined);
  const [show, setShow] = useState(false);

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <label className="field">
        <span>New password</span>
        <input name="password" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" autoFocus />
      </label>
      <label className="field">
        <span>Type it again</span>
        <input name="confirm" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-[var(--brand)]" />
        Show password
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
