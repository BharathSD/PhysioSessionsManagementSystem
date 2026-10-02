"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "./icons";

/** "✓ Payment recorded" banner, driven by ?done=… after a save. Clears itself. */
export function Flash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const message = params.get("done");

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      next.delete("done");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 3500);
    return () => clearTimeout(t);
  }, [message, params, pathname, router]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(4.5rem+env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-ok px-4 py-3 font-medium text-bg shadow-lg"
    >
      <Icon name="check" />
      {message}
    </div>
  );
}
