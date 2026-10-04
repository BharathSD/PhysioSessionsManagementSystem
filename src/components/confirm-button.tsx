"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";

/**
 * Submit button for anything that removes or ends something. The first tap
 * only asks "Tap again to confirm"; the second tap submits.
 */
export function ConfirmButton({
  children,
  confirmText,
  className = "btn",
}: {
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const t = useT();
  const { pending } = useFormStatus();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      className={`${className} ${armed ? "!border-bad !bg-bad !text-white" : ""}`}
    >
      {pending ? "…" : armed ? (confirmText ?? t("Tap again to confirm")) : children}
    </button>
  );
}
