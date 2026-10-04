"use client";

import { useOffline } from "next/offline";
import { useT } from "@/i18n/client";

/** Shown on every screen while there's no signal. Saves wait and go through by themselves. */
export function OfflineBanner() {
  const offline = useOffline();
  const t = useT();
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-30 border-b border-warn/40 bg-warn-soft px-4 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-center text-sm font-medium text-warn">
      {t("No internet. Anything you save will go through when the signal is back — keep this screen open.")}
    </div>
  );
}
