"use client";

import { useState } from "react";

/** Password box with a Show / Hide button, so people can check what they typed. */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={show ? "text" : "password"} className={`pr-20 ${props.className ?? ""}`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-1.5 min-h-9 -translate-y-1/2 rounded-lg px-3 text-sm font-medium text-brand hover:bg-surface-2"
      >
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}
