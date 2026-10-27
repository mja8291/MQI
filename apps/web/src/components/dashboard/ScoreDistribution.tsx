import { BAND_COLOR } from "@/lib/scoring";
import type { RatingBand } from "@/lib/types";

const BANDS: RatingBand[] = ["Excellent", "Good", "Average", "Poor"];

export function ScoreDistribution({ distribution }: { distribution: Record<RatingBand, number> }) {
  const total = BANDS.reduce((sum, b) => sum + distribution[b], 0);

  return (
    <div>
      <div className="flex h-3.5 rounded-full overflow-hidden mb-2">
        {total === 0 ? (
          <div className="w-full bg-border" />
        ) : (
          BANDS.map((band) =>
            distribution[band] > 0 ? (
              <div
                key={band}
                style={{ width: `${(distribution[band] / total) * 100}%`, background: BAND_COLOR[band] }}
              />
            ) : null
          )
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-2">
        {BANDS.map((band) => (
          <div key={band} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: BAND_COLOR[band] }} />
            {band} ({distribution[band]})
          </div>
        ))}
      </div>
    </div>
  );
}
