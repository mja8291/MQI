// Framework-agnostic — no "use client"/"server-only" — so both the client-side
// SurveyTimerBar and server-only export builders can share one implementation.

/** Compact clock format for the live timer bar / Review recap row: "5:37", "1:02:09". */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Coarse "N min" phrasing for the live timer bar (Task 6 addendum) — the
 * display is meant to change once per minute, not once per second, so this
 * deliberately drops second-level precision rather than just relabeling a
 * seconds value. Sheet/export data keeps full second-level precision — see
 * formatDuration/formatDurationFriendly, unaffected by this. */
export function formatElapsedMinutes(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  return `${minutes} min`;
}

/** Human-readable duration for reports/exports: "1h 54m", "34m 12s", "45s". */
export function formatDurationFriendly(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
