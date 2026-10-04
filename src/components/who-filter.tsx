"use client";

import Link from "next/link";
import { useT } from "@/i18n/client";
import type { Who } from "@/lib/team";

/** "My patients · Everyone" — only shown in a clinic with more than one physio. */
export function WhoFilter({ who, hrefs }: { who: Who; hrefs: Record<Who, string> }) {
  const t = useT();
  return (
    <div className="mb-2 grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-medium" role="group" aria-label={t("Whose patients")}>
      {(["mine", "all"] as const).map((w) => (
        <Link
          key={w}
          href={hrefs[w]}
          aria-current={who === w ? "true" : undefined}
          className={`rounded-lg py-2 text-center ${who === w ? "bg-surface shadow-sm" : "text-muted"}`}
        >
          {w === "mine" ? t("My patients") : t("Everyone")}
        </Link>
      ))}
    </div>
  );
}
