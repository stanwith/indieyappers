import type { RankHistory } from "@/lib/types";

const LINE_COLORS = [
  "#6f63f5", // iris
  "#cf5340", // red
  "#1a1c1f", // ink
  "#c2872a", // amber
  "#3f9e6e", // green
  "#0a66c2", // blue
  "#e1306c", // magenta
  "#74787f", // gray
  "#5a4ee0", // deep iris
  "#c3bcff", // light iris
];

const W = 960;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 28 };

export function RankHistoryChart({ history }: { history: RankHistory }) {
  const { dates, series } = history;
  const maxRank = Math.max(
    2,
    ...series.flatMap((s) => s.ranks.filter((r): r is number => r !== null))
  );

  const x = (i: number) =>
    dates.length <= 1
      ? W / 2
      : PAD.left + (i / (dates.length - 1)) * (W - PAD.left - PAD.right);
  const y = (rank: number) =>
    PAD.top +
    ((rank - 1) / Math.max(1, maxRank - 1)) * (H - PAD.top - PAD.bottom);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Rank history"
      >
        {[1, maxRank].map((rank) => (
          <text
            key={rank}
            x={PAD.left - 8}
            y={y(rank) + 3}
            textAnchor="end"
            fill="var(--gray-400)"
            fontSize="9"
            fontFamily="var(--font-geist-mono)"
          >
            {rank}
          </text>
        ))}

        {series.map((s, si) => {
          const pts = s.ranks
            .map((r, i) => (r === null ? null : `${x(i)},${y(r)}`))
            .filter(Boolean);
          if (pts.length === 0) return null;
          const color = LINE_COLORS[si % LINE_COLORS.length];
          return (
            <g key={s.handle}>
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.ranks.map((r, i) =>
                r === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(r)} r="3" fill={color} />
                )
              )}
            </g>
          );
        })}

        {dates.map((d, i) => (
          <text
            key={d}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fill="var(--gray-400)"
            fontSize="9"
            fontFamily="var(--font-geist-mono)"
          >
            {fmtDate(d)}
          </text>
        ))}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((s, si) => (
          <span
            key={s.handle}
            className="inline-flex items-center gap-1.5 font-code text-[11px] text-text-secondary"
          >
            <span
              aria-hidden
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ background: LINE_COLORS[si % LINE_COLORS.length] }}
            />
            @{s.handle}
          </span>
        ))}
      </div>
    </div>
  );
}
