"use client";

import { useT } from "@/i18n/client";

type Point = { date: string; score: number };

const W = 320;
const H = 132;
const PAD = { top: 14, right: 18, bottom: 22, left: 30 };

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A tidy scale (e.g. 40 / 80 / 120) around the values: three guides on round numbers. */
export function niceScale(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rough = (max - min || Math.abs(max) || 10) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  // Whole-number values (strength grades, reps) get whole-number guides.
  const step = values.every(Number.isInteger) ? Math.max(1, Math.round(nice)) : nice;
  const clean = (n: number) => Number(n.toFixed(6)); // drop floating-point noise (1.4000000000000001)
  const lo = clean(Math.floor((min - step / 4) / step) * step);
  const hi = clean(lo + 2 * step * Math.ceil((max + step / 4 - lo) / (2 * step)));
  return [lo, hi];
}

/**
 * A value over time: one series, one hue, three faint guides, only the first
 * and latest values labelled, a hover tooltip on every point. Used for pain
 * (0–10) and for measurements (auto-scaled, with a unit). The lists next to
 * these charts are the table view of the same numbers.
 */
export function TrendChart({
  points,
  min,
  max,
  unit = "",
  what,
  emptyText,
}: {
  points: Point[];
  min?: number;
  max?: number;
  unit?: string;
  what?: string;
  emptyText: string;
}) {
  const t = useT();
  what ??= t("value");
  if (points.length === 0) return <p className="text-base text-muted">{emptyText}</p>;

  const [autoLo, autoHi] = niceScale(points.map((p) => p.score));
  const lo = min ?? autoLo;
  const hi = max ?? autoHi;
  const first = points[0];
  const last = points.at(-1)!;
  const change = last.score - first.score;
  const x = (i: number) => PAD.left + (points.length === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (points.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const path = points.map((pt, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pt.score).toFixed(1)}`).join(" ");
  const guides = [lo, (lo + hi) / 2, hi];
  const fmt = (v: number) => `${trim(v)}${unit}`;

  return (
    <div className="space-y-2">
      <p className="text-base">
        <span className="text-2xl font-semibold">
          {fmt(first.score)} → {fmt(last.score)}
        </span>
        <span className="text-muted">
          {" "}
          {points.length === 1
            ? t("on {date}", { date: t.date(first.date) })
            : change === 0
              ? t("no change since {date}", { date: t.date(first.date) })
              : `${change < 0 ? "↓" : "↑"} ${
                  unit
                    ? t("{n} since {date}", { n: `${trim(Math.abs(change))}${unit}`, date: t.date(first.date) })
                    : Math.abs(change) === 1
                      ? t("1 point since {date}", { date: t.date(first.date) })
                      : t("{n} points since {date}", { n: trim(Math.abs(change)), date: t.date(first.date) })
                }`}
        </span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-md" role="img" aria-label={t("{what} from {from} to {to} over {n} records", { what, from: fmt(first.score), to: fmt(last.score), n: points.length })}>
        {guides.map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
              {trim(g)}
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={path} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((pt, i) => (
          <g key={`${pt.date}-${i}`}>
            <title>{`${t.date(pt.date)}: ${what} ${fmt(pt.score)}`}</title>
            {/* larger invisible hit area for the tooltip */}
            <circle cx={x(i)} cy={y(pt.score)} r={11} fill="transparent" />
            <circle cx={x(i)} cy={y(pt.score)} r={4} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
        {[0, points.length - 1]
          .filter((i, k, arr) => arr.indexOf(i) === k)
          .map((i) => (
            <text
              key={`label${i}`}
              x={x(i)}
              y={y(points[i].score) - 9}
              textAnchor={i === 0 && points.length > 1 ? "start" : "end"}
              fontSize={11}
              fontWeight={600}
              fill="var(--fg)"
            >
              {trim(points[i].score)}
            </text>
          ))}
        <text x={PAD.left} y={H - 4} fontSize={10} fill="var(--muted)">
          {t.date(first.date).replace(/ \d{4}$/, "")}
        </text>
        {points.length > 1 && (
          <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize={10} fill="var(--muted)">
            {t.date(last.date).replace(/ \d{4}$/, "")}
          </text>
        )}
      </svg>
    </div>
  );
}

/** Pain score (0–10) across visits. */
export function PainChart({ points, emptyText }: { points: Point[]; emptyText?: string }) {
  const t = useT();
  return (
    <TrendChart
      points={points}
      min={0}
      max={10}
      what={t("pain")}
      emptyText={emptyText ?? t("No pain scores yet. Tap a score after marking Present to start tracking progress.")}
    />
  );
}
