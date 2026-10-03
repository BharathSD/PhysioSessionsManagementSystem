"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import { DesignationPicker } from "@/components/designation-picker";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { signIn, signUp } from "./actions";

export function AuthForms() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInSubmit, signInPending] = useFormAction(signIn, undefined);
  const [signUpState, signUpSubmit, signUpPending] = useFormAction(signUp, undefined);
  const state = mode === "signin" ? signInState : signUpState;

  return (
    <div className="card">
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-medium">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 ${mode === m ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={mode === "signin" ? signInSubmit : signUpSubmit} className="space-y-4">
        {mode === "signup" && (
          <>
            <DesignationPicker />
            <label className="field">
              <span>Your name</span>
              <input name="full_name" required autoComplete="name" placeholder="Priya Sharma" />
            </label>
            <label className="field">
              <span>Clinic / practice name <em>(optional)</em></span>
              <input name="clinic_name" autoComplete="organization" placeholder="Priya's Physio Care" />
            </label>
          </>
        )}
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" inputMode="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <PasswordInput
            name="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </label>
        {mode === "signin" && (
          <Link href="/forgot-password" className="-mt-1 inline-block text-sm font-medium text-brand">
            Forgot password?
          </Link>
        )}

        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        {state?.message && <p className="rounded-lg bg-ok-soft p-3 text-sm text-ok">{state.message}</p>}

        <SubmitButton className="btn btn-primary w-full" pending={mode === "signin" ? signInPending : signUpPending}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </SubmitButton>
      </form>
    </div>
  );
}
