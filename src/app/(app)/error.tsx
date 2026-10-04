"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/i18n/client";

/** Something failed while loading or saving. Offer a retry and a way to tell us. */
export default function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card space-y-4 py-8 text-center">
      <p className="text-4xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="text-xl font-semibold">{t("Something went wrong")}</h1>
      <p className="text-base text-muted">
        {t("Usually this is a weak signal. Nothing you saved earlier is lost. Try again — if it keeps happening, let us know.")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => retry()} className="btn btn-primary min-h-12 text-base">
          {t("Try again")}
        </button>
        <Link href={`/profile/help?problem=${encodeURIComponent(error.digest ?? "")}`} className="btn min-h-12 text-base">
          {t("Report this problem")}
        </Link>
      </div>
    </div>
  );
}
