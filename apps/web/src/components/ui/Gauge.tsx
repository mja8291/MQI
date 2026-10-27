import { bandColor } from "@/lib/scoring";

interface GaugeProps {
  score: number | null;
  size?: number;
}

export function Gauge({ score, size = 56 }: GaugeProps) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = bandColor(score);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-display font-semibold"
        style={{ fontSize: size * 0.23, color: "var(--brand-deep)" }}
      >
        {Math.round(pct)}%
      </div>
    </div>
  );
}
