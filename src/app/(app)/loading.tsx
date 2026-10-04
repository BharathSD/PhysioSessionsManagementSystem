"use client";

import { useOffline } from "next/offline";
import { useT } from "@/i18n/client";

/**
 * Shown the moment a tab or link is tapped, while the page loads — so a slow
 * connection feels like loading, not like a tap that did nothing.
 */
export default function Loading() {
  const offline = useOffline();
  const t = useT();
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="mb-4 text-base text-muted">{offline ? t("No signal — this page will open when it's back.") : t("Loading…")}</p>
      <div className="animate-pulse space-y-3" aria-hidden>
        <div className="h-8 w-2/3 rounded-xl bg-surface-2" />
        <div className="h-24 rounded-2xl bg-surface-2" />
        <div className="h-16 rounded-2xl bg-surface-2" />
        <div className="h-16 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
