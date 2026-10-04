"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";

/** Copies text (an invite link) and says so. */
export function CopyButton({ text, label, className = "btn" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          window.prompt(t("Copy this link:"), text);
        }
      }}
    >
      {copied ? `✓ ${t("Copied")}` : (label ?? t("Copy link"))}
    </button>
  );
}
