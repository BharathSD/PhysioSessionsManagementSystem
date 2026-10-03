import { formatDate } from "@/lib/format";

type Point = { date: string; score: number };

const W = 320;
const H = 132;
const PAD = { top: 14, right: 18, bottom: 22, left: 26 };

/**
 * Pain score (0–10) across visits: one series, one hue, faint 0/5/10 guides,
 * only the first and latest values labelled. Each point has a hover tooltip;
 * the patient's Visits tab is the table view of the same numbers.
 */
export function PainChart({ points }: { points: Point[] }) {
  if (points.length === 0) {
    return <p className="text-base text-muted">No pain scores yet. Tap a score after marking Present to start tracking progress.</p>;
  }

  const first = points[0];
  const last = points.at(-1)!;
  const change = last.score - first.score;
  const x = (i: number) => PAD.left + (points.length === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (points.length - 1)) * (W - PAD.left - PAD.right));
  const y = (score: number) => PAD.top + ((10 - score) / 10) * (H - PAD.top - PAD.bottom);
  const path = points.map((pt, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pt.score).toFixed(1)}`).join(" ");

  return (
    <div className="space-y-2">
      <p className="text-base">
        <span className="text-2xl font-semibold">
          {first.score} → {last.score}
        </span>
        <span className="text-muted">
          {" "}
          {points.length === 1
            ? `on ${formatDate(first.date)}`
            : change === 0
              ? `no change since ${formatDate(first.date)}`
              : `${change < 0 ? "↓" : "↑"} ${Math.abs(change)} point${Math.abs(change) === 1 ? "" : "s"} since ${formatDate(first.date)}`}
        </span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-md" role="img" aria-label={`Pain scores from ${first.score} to ${last.score} over ${points.length} visits`}>
        {[0, 5, 10].map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
              {g}
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={path} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((pt, i) => (
          <g key={pt.date}>
            <title>{`${formatDate(pt.date)}: pain ${pt.score}/10`}</title>
            {/* larger invisible hit area for the tooltip */}
            <circle cx={x(i)} cy={y(pt.score)} r={11} fill="transparent" />
            <circle cx={x(i)} cy={y(pt.score)} r={4} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
        {[0, points.length - 1].filter((i, k, arr) => arr.indexOf(i) === k).map((i) => (
          <text
            key={`label${i}`}
            x={x(i)}
            y={y(points[i].score) - 9}
            textAnchor={i === 0 && points.length > 1 ? "start" : "end"}
            fontSize={11}
            fontWeight={600}
            fill="var(--fg)"
          >
            {points[i].score}
          </text>
        ))}
        <text x={PAD.left} y={H - 4} fontSize={10} fill="var(--muted)">
          {formatDate(first.date).replace(/ \d{4}$/, "")}
        </text>
        {points.length > 1 && (
          <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize={10} fill="var(--muted)">
            {formatDate(last.date).replace(/ \d{4}$/, "")}
          </text>
        )}
      </svg>
    </div>
  );
}
