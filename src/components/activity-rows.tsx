"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";

/**
 * The patient's own activities rated 0–10 (0 = can't do it, 10 = as before).
 * Submits activity_name[] and activity_score[] in matching order.
 */
export function ActivityRows({ defaults = [] }: { defaults?: { name: string; score: number | null }[] }) {
  const [rows, setRows] = useState(() => (defaults.length ? defaults : [{ name: "", score: null }]).map((d, i) => ({ ...d, key: i })));
  const [nextKey, setNextKey] = useState(rows.length);
  const t = useT();

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <input
            name="activity_name"
            defaultValue={r.name}
            placeholder={t("e.g. Climbing stairs")}
            aria-label={t("Activity")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-brand"
          />
          <select
            name="activity_score"
            defaultValue={r.score ?? ""}
            aria-label={t("Score out of 10")}
            className="min-h-11 w-20 shrink-0 rounded-xl border border-border bg-surface px-2 text-base outline-none focus:border-brand"
          >
            <option value="">–</option>
            {Array.from({ length: 11 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {rows.length > 1 && (
            <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-sm text-muted" aria-label={t("Remove activity")}>
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, { name: "", score: null, key: nextKey }]);
          setNextKey((k) => k + 1);
        }}
        className="text-sm font-medium text-brand"
      >
        {t("+ Add activity")}
      </button>
    </div>
  );
}
