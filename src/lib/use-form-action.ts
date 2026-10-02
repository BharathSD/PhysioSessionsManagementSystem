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
    startTransition(() => dispatch(form));
  };
  return [state, onSubmit, pending] as const;
}
