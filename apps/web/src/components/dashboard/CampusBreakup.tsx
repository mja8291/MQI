import type { CampusBreakup as Breakup } from "@mqi/shared";

/**
 * v2 (W63): where every campus stands — the R&M master sheet's breakup (Campus Survey Plan tab),
 * with the app's own progress and Safe/Unsafe for the campuses it is to survey.
 */
const SEGMENTS = [
  { key: "pssp", label: "PSSP/PSRP deduction", color: "#9aa6a1" },
  { key: "doneWithoutApp", label: "Done without App", color: "#c97a2e" },
  { key: "last5", label: "Last 5 year exemption", color: "#c9d3cf" },
  { key: "withApp", label: "Survey with App", color: "var(--brand)" },
] as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The table's total row, from the region rows. */
function totalRow(b: Breakup) {
  const sum = (k: Exclude<keyof Breakup["byRegion"][number], "region">) => b.byRegion.reduce((a, r) => a + r[k], 0);
  return {
    region: "Total",
    total: sum("total"),
    pssp: sum("pssp"),
    doneWithoutApp: sum("doneWithoutApp"),
    safe: sum("safe"),
    unsafe: sum("unsafe"),
    last5: sum("last5"),
    withApp: sum("withApp"),
    surveyed: sum("surveyed"),
    surveyedUnsafe: sum("surveyedUnsafe"),
    remaining: sum("remaining"),
  };
}
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

function Bar({ parts, total }: { parts: { value: number; color: string; label: string }[]; total: number }) {
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-surface" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {parts.map((p) => (p.value ? <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null))}
    </div>
  );
}

function SafeUnsafe({ safe, unsafe }: { safe: number; unsafe: number }) {
  return (
    <span className="text-[11.5px]">
      <span className="font-semibold text-band-good">{safe} safe</span>
      <span className="text-ink-faint"> · </span>
      <span className="font-semibold text-band-poor">{unsafe} unsafe</span>
    </span>
  );
}

/** The headline: every campus found Safe or Unsafe, from the 100-list check and from the app. */
function SafeUnsafeIdentified({ b }: { b: Breakup }) {
  const safe = b.doneWithoutApp.safe + b.withApp.surveyedSafe;
  const unsafe = b.doneWithoutApp.unsafe + b.withApp.surveyedUnsafe;
  const tile = (label: string, n: number, without: number, withApp: number, tone: "safe" | "unsafe") => (
    <div className={`rounded-2xl p-3.5 ${tone === "unsafe" ? "bg-band-poor-tint" : "bg-brand-tint"}`}>
      <div className={`text-[11.5px] font-semibold uppercase tracking-wide ${tone === "unsafe" ? "text-band-poor" : "text-band-good"}`}>{label}</div>
      <div className={`font-display text-[34px] font-bold leading-none mt-1 tabular-nums ${tone === "unsafe" ? "text-band-poor" : "text-band-good"}`}>{n}</div>
      <div className="text-[11px] text-ink-soft mt-1.5 leading-snug">
        {without} checked without App
        <br />
        {withApp} surveyed with App
      </div>
    </div>
  );
  return (
    <div className="mb-2.5" aria-label="Safe and unsafe campuses identified">
      <div className="grid grid-cols-2 gap-2.5">
        {tile("Unsafe identified", unsafe, b.doneWithoutApp.unsafe, b.withApp.surveyedUnsafe, "unsafe")}
        {tile("Safe identified", safe, b.doneWithoutApp.safe, b.withApp.surveyedSafe, "safe")}
      </div>
      <p className="text-[11px] text-ink-faint mt-1.5">
        {safe + unsafe} of {b.doneWithoutApp.campuses + b.withApp.campuses} campuses to assess are assessed so far (Done without App + Survey with App).
      </p>
    </div>
  );
}

export function CampusBreakup({ breakup: b }: { breakup: Breakup }) {
  const app = b.withApp;
  return (
    <section aria-label="Campus breakup" className="mb-5">
      <div className="text-xs font-semibold text-brand-deep uppercase tracking-wide mb-2.5">Campus breakup</div>

      {/* Safe and Unsafe identified so far: checked without the app plus surveyed with it. */}
      <SafeUnsafeIdentified b={b} />

      {/* Survey with App progress first: it is what the surveyors are working through. */}
      <div className="rounded-2xl border border-border bg-card p-3.5 mb-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">Survey with App</span>
          <span className="text-[11px] text-ink-faint">
            {plural(app.campuses, "campus", "campuses")} · {plural(app.eCompounds, "e-compound", "e-compounds")}
          </span>
        </div>
        <div className="font-display text-[26px] font-semibold text-brand-deep leading-tight mt-1">
          {app.surveyed} <span className="text-[14px] text-ink-soft font-normal">of {app.campuses} surveyed ({pct(app.surveyed, app.campuses)}%)</span>
        </div>
        <div className="mt-2">
          <Bar
            total={app.campuses}
            parts={[
              { value: app.surveyedSafe, color: "var(--band-good)", label: "Surveyed, safe" },
              { value: app.surveyedUnsafe, color: "var(--band-poor)", label: "Surveyed, unsafe" },
            ]}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 mt-2">
          <SafeUnsafe safe={app.surveyedSafe} unsafe={app.surveyedUnsafe} />
          <span className="text-[11.5px] text-ink-soft">
            {app.remaining} remaining · {app.eCompoundsVisited} of {app.eCompounds} e-compounds visited
          </span>
        </div>
        {app.notInAppList ? (
          <p className="text-[11px] text-band-average mt-1.5">
            {app.notInAppList === 1 ? "1 of these campuses is" : `${app.notInAppList} of these campuses are`} not in the app's campus list yet, so {app.notInAppList === 1 ? "it" : "they"} can't be picked.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card p-3.5 mb-2.5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px] font-semibold text-ink">All campuses</span>
          <span className="text-[11px] text-ink-faint">
            {plural(b.total.campuses, "campus", "campuses")} · {plural(b.total.eCompounds, "e-compound", "e-compounds")}
          </span>
        </div>
        <Bar total={b.total.campuses} parts={SEGMENTS.map((s) => ({ value: b[s.key].campuses, color: s.color, label: s.label }))} />
        <div className="mt-2.5 divide-y divide-border">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="py-1.5">
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="flex-1 text-ink">{s.label}</span>
                <span className="font-semibold text-ink tabular-nums">{b[s.key].campuses}</span>
                <span className="w-24 text-right text-[11px] text-ink-faint tabular-nums">{plural(b[s.key].eCompounds, "e-compound", "e-compounds")}</span>
              </div>
              {s.key === "doneWithoutApp" ? (
                <div className="pl-[18px] mt-0.5">
                  <SafeUnsafe safe={b.doneWithoutApp.safe} unsafe={b.doneWithoutApp.unsafe} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {b.surveyedOutsidePlan ? (
          <p className="text-[11px] text-ink-faint mt-1.5">
            {b.surveyedOutsidePlan} campus{b.surveyedOutsidePlan === 1 ? " was" : "es were"} also surveyed with the app outside the Survey with App list.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-[11.5px] tabular-nums">
          <thead>
            <tr className="text-ink-soft text-left align-bottom">
              <th className="px-2.5 py-2 font-semibold">Region</th>
              <th className="px-1.5 py-2 font-semibold text-right">Total</th>
              <th className="px-1.5 py-2 font-semibold text-right">PSSP/ PSRP</th>
              <th className="px-1.5 py-2 font-semibold text-right">Last 5 yr</th>
              <th className="px-1.5 py-2 font-semibold text-right">Without App</th>
              <th className="px-1.5 py-2 font-semibold text-right">With App</th>
              <th className="px-1.5 py-2 font-semibold text-right bg-surface">Captured</th>
              <th className="px-1.5 py-2 font-semibold text-right bg-surface">Pending</th>
              <th className="px-1.5 py-2 font-semibold text-right text-band-good">Safe</th>
              <th className="px-2.5 py-2 font-semibold text-right text-band-poor">Unsafe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...b.byRegion, totalRow(b)].map((r) => (
              <tr key={r.region} className={r.region === "Total" ? "font-semibold border-t-2 border-border" : ""}>
                <td className="px-2.5 py-1.5 text-ink whitespace-nowrap">{r.region}</td>
                <td className="px-1.5 py-1.5 text-right">{r.total}</td>
                <td className="px-1.5 py-1.5 text-right">{r.pssp}</td>
                <td className="px-1.5 py-1.5 text-right">{r.last5}</td>
                <td className="px-1.5 py-1.5 text-right">{r.doneWithoutApp}</td>
                <td className="px-1.5 py-1.5 text-right">{r.withApp}</td>
                <td className="px-1.5 py-1.5 text-right bg-surface">{r.surveyed}</td>
                <td className="px-1.5 py-1.5 text-right bg-surface">{r.remaining}</td>
                <td className="px-1.5 py-1.5 text-right text-band-good">{r.safe + r.surveyed - r.surveyedUnsafe}</td>
                <td className="px-2.5 py-1.5 text-right text-band-poor">{r.unsafe + r.surveyedUnsafe}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-2.5 py-1.5 text-[10.5px] text-ink-faint border-t border-border">
          Captured and Pending: campuses of Survey with App. Safe and Unsafe: identified without the App and with it.
        </p>
      </div>
    </section>
  );
}
