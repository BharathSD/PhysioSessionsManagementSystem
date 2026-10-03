"use client";

import { useState } from "react";
import { BODY_REGIONS, regionLabel, type View } from "@/lib/pain";

type Mark = "pain" | "radiating";

/**
 * Tap-to-mark body chart (front and back). Tap a region once for pain, again
 * for where it radiates, a third time to clear. Submits `locations` and
 * `radiating` (region keys). Also works as a read-only picture (`readOnly`).
 */
export function BodyChart({
  defaultLocations = [],
  defaultRadiating = [],
  readOnly = false,
}: {
  defaultLocations?: string[];
  defaultRadiating?: string[];
  readOnly?: boolean;
}) {
  const [marks, setMarks] = useState<Record<string, Mark>>(() => ({
    ...Object.fromEntries(defaultRadiating.map((k) => [k, "radiating" as const])),
    ...Object.fromEntries(defaultLocations.map((k) => [k, "pain" as const])),
  }));

  const cycle = (key: string) =>
    setMarks((m) => {
      const next = { ...m };
      if (!m[key]) next[key] = "pain";
      else if (m[key] === "pain") next[key] = "radiating";
      else delete next[key];
      return next;
    });

  const picked = BODY_REGIONS.filter((r) => marks[r.key]);

  const figure = (view: View) => (
    <figure className="flex flex-1 flex-col items-center">
      {/* Stacked on phones so each region is big enough to tap with a finger. */}
      <svg viewBox="0 0 120 240" className={`h-auto w-full ${readOnly ? "max-w-[150px]" : "max-w-[300px] sm:max-w-[190px]"}`} role="group" aria-label={`Body chart, ${view}`}>
        <defs>
          <pattern id={`hatch-${view}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="var(--warn-soft)" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--warn)" strokeWidth="1.6" />
          </pattern>
        </defs>
        {BODY_REGIONS.filter((r) => r.view === view).map((r) => {
          const mark = marks[r.key];
          const fill = mark === "pain" ? "var(--bad)" : mark === "radiating" ? `url(#hatch-${view})` : "var(--surface-2)";
          return (
            <rect
              key={r.key}
              x={r.box.x}
              y={r.box.y}
              width={r.box.w}
              height={r.box.h}
              rx={r.box.rx}
              fill={fill}
              stroke={mark ? (mark === "pain" ? "var(--bad)" : "var(--warn)") : "var(--border)"}
              strokeWidth={1}
              role={readOnly ? undefined : "button"}
              tabIndex={readOnly ? undefined : 0}
              aria-pressed={readOnly ? undefined : Boolean(mark)}
              aria-label={`${r.label}${mark ? ` — ${mark === "pain" ? "pain" : "radiating"}` : ""}`}
              className={readOnly ? undefined : "cursor-pointer"}
              onClick={readOnly ? undefined : () => cycle(r.key)}
              onKeyDown={
                readOnly
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        cycle(r.key);
                      }
                    }
              }
            >
              <title>{r.label}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        {view === "front" ? "Front" : "Back"} <span className="opacity-70">(patient&apos;s R is on the {view === "front" ? "left" : "right"})</span>
      </figcaption>
    </figure>
  );

  return (
    <div className="space-y-2">
      {!readOnly &&
        picked.map((r) => <input key={r.key} type="hidden" name={marks[r.key] === "pain" ? "locations" : "radiating"} value={r.key} />)}
      <div className={`flex gap-3 rounded-2xl bg-surface p-2 ${readOnly ? "" : "flex-col sm:flex-row"}`}>
        {figure("front")}
        {figure("back")}
      </div>
      {!readOnly && <p className="text-sm text-muted">Tap once for pain, again if it spreads (radiates) there, a third time to clear.</p>}
      <div className="flex flex-wrap gap-1.5 text-sm">
        {picked.length === 0 ? (
          <span className="text-muted">No areas marked.</span>
        ) : (
          picked.map((r) => (
            <span
              key={r.key}
              className={`chip py-1 ${marks[r.key] === "pain" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
            >
              {marks[r.key] === "pain" ? "● " : "↝ "}
              {regionLabel(r.key)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
