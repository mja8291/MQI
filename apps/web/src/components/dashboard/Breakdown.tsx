import { useState } from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { breakupView } from "@mqi/shared";
import type { BreakupView, CampusBreakup, CampusBreakupCore } from "@mqi/shared";

/**
 * v2 (W65): the campus breakup as one top-down hierarchy —
 *   Total → Exempted | In scope → Assessed (Safe / Unsafe, Without / With App) | Pending.
 * Every figure comes from breakupView (shared), which also checks that the parts add up.
 */

/** One colour per category, everywhere on the page. */
export const C = {
  exempted: "#9aa6a1",
  assessed: "#1f8a7a",
  pending: "var(--band-average)",
  without: "#3a6ea5",
  with: "#2a9d8f",
  safe: "var(--band-good)",
  unsafe: "var(--band-poor)",
} as const;

export const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;
const campusesEco = (campuses: number, eco: number) => `${plural(campuses, "campus", "campuses")} · ${plural(eco, "E-compound", "E-compounds")}`;

const DEFINITIONS = {
  exempted: "Not surveyed: PSSP/PSRP (separate budget) and campuses built in the last five years.",
  assessed: "Campuses with a result: checked without the App, plus Survey with App campuses already surveyed.",
  pending: "Survey with App campuses not surveyed yet.",
} as const;

function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={`What is ${label}?`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-ink-faint align-middle ml-1">
        <Info size={13} />
      </button>
      {open ? <span className="block text-[11px] font-normal normal-case tracking-normal text-ink-soft mt-0.5">{text}</span> : null}
    </>
  );
}

function Bar({ parts, total, height = "h-2.5" }: { parts: { value: number; color: string; label: string }[]; total: number; height?: string }) {
  return (
    <div className={`flex ${height} rounded-full overflow-hidden bg-border/60`} role="img" aria-label={parts.map((p) => `${p.label} ${fmt(p.value)}`).join(", ")}>
      {total > 0 ? parts.map((p) => (p.value ? <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null)) : null}
    </div>
  );
}

function Progress({ label, done, total, color, sub }: { label: string; done: number; total: number; color: string; sub?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-soft">
          <span className="font-semibold text-ink">{fmt(done)}</span> / {fmt(total)} ({pct(done, total)}%)
        </span>
      </div>
      <div className="mt-1">
        <Bar total={total} parts={[{ value: done, color, label }]} height="h-2" />
      </div>
      {sub ? <div className="text-[11px] text-ink-faint mt-0.5">{sub}</div> : null}
    </div>
  );
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** b) Total split into Exempted | Assessed | Pending; a segment taps through to its card. */
export function NetworkBar({ v }: { v: BreakupView }) {
  const segs = [
    { key: "exempted", label: "Exempted", value: v.exempted, color: C.exempted },
    { key: "assessed", label: "Assessed", value: v.assessed, color: C.assessed },
    { key: "pending", label: "Pending", value: v.pending, color: C.pending },
  ];
  return (
    <section aria-label="Network" className="rounded-2xl border border-border bg-card p-3.5 mb-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-[13px] font-semibold text-ink">All campuses</span>
        <span className="text-[11.5px] text-ink-faint tabular-nums">{campusesEco(v.total, v.totalEco)}</span>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden">
        {segs.map((s) =>
          s.value ? (
            <button
              key={s.key}
              type="button"
              aria-label={`${s.label} ${fmt(s.value)}: go to its card`}
              onClick={() => scrollTo(`card-${s.key}`)}
              style={{ width: `${(s.value / v.total) * 100}%`, background: s.color }}
            />
          ) : null,
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {segs.map((s) => (
          <button key={s.key} type="button" onClick={() => scrollTo(`card-${s.key}`)} className="text-left">
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="block text-[14px] font-semibold text-ink tabular-nums">
              {fmt(s.value)} <span className="text-[11px] font-normal text-ink-faint">{pct(s.value, v.total)}%</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Card({ id, title, def, color, children }: { id: string; title: string; def: string; color: string; children: React.ReactNode }) {
  return (
    <div id={id} className="rounded-2xl border border-border bg-card p-3.5 scroll-mt-4" style={{ borderTop: `4px solid ${color}` }}>
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">
        {title}
        <InfoTip text={def} label={title} />
      </div>
      {children}
    </div>
  );
}

const Line = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="flex items-center gap-1.5 text-[12px] text-ink-soft">
    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
    <span className="flex-1">{label}</span>
    <span className="tabular-nums text-ink">{value}</span>
  </div>
);

/** c) Exempted, Assessed and Pending. */
export function SummaryCards({ v, b }: { v: BreakupView; b: CampusBreakupCore }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
      <Card id="card-exempted" title="Exempted" def={DEFINITIONS.exempted} color={C.exempted}>
        <div className="font-display text-[26px] font-semibold text-ink leading-tight tabular-nums">{fmt(v.exempted)}</div>
        <div className="text-[11px] text-ink-faint mb-1.5">{campusesEco(v.exempted, v.exemptedEco)}</div>
        <Line color={C.exempted} label="PSSP/PSRP" value={campusesEco(b.pssp.campuses, b.pssp.eCompounds)} />
        <Line color={C.exempted} label="Last 5 yr" value={campusesEco(b.last5.campuses, b.last5.eCompounds)} />
      </Card>
      <Card id="card-assessed" title="Assessed" def={DEFINITIONS.assessed} color={C.assessed}>
        <div className="font-display text-[26px] font-semibold text-ink leading-tight tabular-nums">
          {fmt(v.assessed)} <span className="text-[13px] font-normal text-ink-soft">of {fmt(v.scope)} in scope ({pct(v.assessed, v.scope)}%)</span>
        </div>
        <div className="my-1.5">
          <Bar
            total={v.scope}
            parts={[
              { value: v.assessedWithout, color: C.without, label: "Without App" },
              { value: v.assessedWith, color: C.with, label: "With App" },
            ]}
          />
        </div>
        <Line color={C.without} label="Without App" value={fmt(v.assessedWithout)} />
        <Line color={C.with} label="With App" value={fmt(v.assessedWith)} />
      </Card>
      <Card id="card-pending" title="Pending" def={DEFINITIONS.pending} color={C.pending}>
        <div className="font-display text-[26px] font-semibold text-ink leading-tight tabular-nums">{fmt(v.pending)}</div>
        <div className="text-[11px] text-ink-faint mb-1.5">campuses still to survey with the App</div>
        <Line color={C.pending} label="E-compound visits remaining" value={`${fmt(v.pendingVisits)} of ${fmt(b.withApp.eCompounds)}`} />
      </Card>
    </div>
  );
}

/** d) Safe / Unsafe × Without App / With App, of the assessed campuses only. */
export function SafetyMatrix({ v }: { v: BreakupView }) {
  const cell = "px-2 py-2 text-right tabular-nums";
  return (
    <section aria-label="Safety result" className="rounded-2xl border border-border bg-card p-3.5 mb-3">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft mb-1.5">Safety result</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11.5px] text-ink-soft">
            <th className="px-2 py-1 text-left font-medium" />
            <th className="px-2 py-1 text-right font-medium" style={{ color: C.without }}>Without App</th>
            <th className="px-2 py-1 text-right font-medium" style={{ color: C.with }}>With App</th>
            <th className="px-2 py-1 text-right font-semibold text-ink">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {([["Safe", v.safe, C.safe], ["Unsafe", v.unsafe, C.unsafe]] as const).map(([label, r, color]) => (
            <tr key={label} style={{ color }}>
              <th className="px-2 py-2 text-left font-semibold">{label}</th>
              <td className={cell}>{fmt(r.without)}</td>
              <td className={cell}>{fmt(r.with)}</td>
              <td className={`${cell} font-bold text-[16px]`}>{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-faint mt-1">Out of {fmt(v.assessed)} assessed campuses</p>
    </section>
  );
}

function CampusList({ items }: { items: { name: string; meta: string }[] }) {
  return (
    <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface divide-y divide-border">
      {items.map((c, i) => (
        <li key={`${c.name}-${i}`} className="px-2.5 py-1.5 text-[11.5px]">
          <span className="text-ink">{c.name}</span> <span className="text-ink-faint">· {c.meta}</span>
        </li>
      ))}
    </ul>
  );
}

function Note({ tone, text, items }: { tone: "warn" | "info"; text: string; items: { name: string; meta: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg px-2.5 py-2 text-[11.5px] ${tone === "warn" ? "bg-band-average-tint text-ink" : "bg-surface text-ink-soft"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-start gap-1.5 text-left">
        {tone === "warn" ? <AlertTriangle size={13} className="shrink-0 mt-0.5 text-band-average" /> : <Info size={13} className="shrink-0 mt-0.5" />}
        <span className="flex-1">{text}</span>
        <span className="shrink-0 underline font-semibold text-brand-deep">{open ? "Hide" : "List"}</span>
      </button>
      {open ? <CampusList items={items} /> : null}
    </div>
  );
}

/** e) App survey progress, with the two notes. */
export function AppProgress({ b }: { b: CampusBreakupCore }) {
  const app = b.withApp;
  const notIn = app.notInAppListCampuses ?? [];
  const outside = b.outsidePlanCampuses ?? [];
  return (
    <section aria-label="App survey progress" className="rounded-2xl border border-border bg-card p-3.5 mb-3 space-y-2.5">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft">App survey progress</div>
      <Progress label="Campuses surveyed" done={app.surveyed} total={app.campuses} color={C.with} />
      <Progress label="E-compound visits" done={app.eCompoundsVisited} total={app.eCompounds} color={C.with} />
      {app.notInAppList ? (
        <Note
          tone="warn"
          text={`${plural(app.notInAppList, "campus", "campuses")} in the survey list ${app.notInAppList === 1 ? "is" : "are"} not yet in the App's campus list`}
          items={notIn.map((c) => ({ name: c.name, meta: [c.region, c.eCompoundNo].filter(Boolean).join(" · ") }))}
        />
      ) : null}
      {b.surveyedOutsidePlan ? (
        <Note
          tone="info"
          text={`${plural(b.surveyedOutsidePlan, "campus", "campuses")} surveyed outside the survey list (in no total above)`}
          items={outside.map((c) => ({ name: c.name, meta: [c.region, c.category].filter(Boolean).join(" · ") }))}
        />
      ) : null}
    </section>
  );
}

interface RegionLine {
  region: string;
  v: BreakupView;
}

function RegionCard({ r }: { r: RegionLine }) {
  const [open, setOpen] = useState(false);
  const { v } = r;
  return (
    <div className="rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[13px] font-semibold text-ink">{r.region}</span>
          <span className="text-[11.5px] tabular-nums">
            <span style={{ color: C.safe }}>{fmt(v.safe.total)} safe</span>
            <span className="text-ink-faint"> · </span>
            <span style={{ color: C.unsafe }}>{fmt(v.unsafe.total)} unsafe</span>
          </span>
          <ChevronDown size={15} className={`text-ink-faint shrink-0 ${open ? "rotate-180" : ""}`} />
        </div>
        <div className="mt-1.5">
          <Bar
            total={v.total}
            height="h-2"
            parts={[
              { value: v.exempted, color: C.exempted, label: "Exempted" },
              { value: v.assessed, color: C.assessed, label: "Assessed" },
              { value: v.pending, color: C.pending, label: "Pending" },
            ]}
          />
        </div>
      </button>
      {open ? (
        <div className="px-3 pb-2.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
          <Line color={C.exempted} label="Total" value={fmt(v.total)} />
          <Line color={C.exempted} label="Exempted" value={fmt(v.exempted)} />
          <Line color={C.without} label="Without App" value={fmt(v.assessedWithout)} />
          <Line color={C.with} label="With App" value={fmt(v.assessedWith)} />
          <Line color={C.assessed} label="Assessed" value={fmt(v.assessed)} />
          <Line color={C.pending} label="Pending" value={fmt(v.pending)} />
          <Line color={C.safe} label="Safe" value={fmt(v.safe.total)} />
          <Line color={C.unsafe} label="Unsafe" value={fmt(v.unsafe.total)} />
        </div>
      ) : null}
    </div>
  );
}

/** f) Region breakup: cards on phones, a table on desktop; fully exempted regions set apart. */
export function RegionBreakup({ b, only }: { b: CampusBreakup; only?: string }) {
  const lines: (RegionLine & { core: CampusBreakupCore })[] = Object.entries(b.regions ?? {})
    .filter(([region]) => !only || region === only)
    .map(([region, core]) => ({ region, core, v: breakupView(core) }));
  const active = lines.filter((l) => l.v.scope > 0);
  const exemptOnly = lines.filter((l) => l.v.scope === 0);
  const totalCore: CampusBreakupCore = only && b.regions?.[only] ? b.regions[only] : b;
  const total = breakupView(totalCore);
  const th = "px-2 py-1.5 font-semibold text-right whitespace-nowrap";
  const td = "px-2 py-1.5 text-right tabular-nums";
  const row = (name: string, v: BreakupView, core: CampusBreakupCore, extra = "") => (
    <tr key={name} className={extra}>
      <th className="sticky left-0 z-10 bg-card px-2.5 py-1.5 text-left font-semibold text-ink whitespace-nowrap">{name}</th>
      <td className={td}>{fmt(v.total)}</td>
      <td className={td}>{fmt(core.pssp.campuses)}</td>
      <td className={td}>{fmt(core.last5.campuses)}</td>
      <td className={td} style={{ color: C.without }}>{fmt(v.assessedWithout)}</td>
      <td className={td} style={{ color: C.with }}>{fmt(v.assessedWith)}</td>
      <td className={td} style={{ color: C.pending }}>{fmt(v.pending)}</td>
      <td className={td} style={{ color: C.safe }}>{fmt(v.safe.total)}</td>
      <td className={td} style={{ color: C.unsafe }}>{fmt(v.unsafe.total)}</td>
    </tr>
  );
  return (
    <section aria-label="Region breakup" className="mb-3">
      <div className="text-xs font-semibold text-brand-deep uppercase tracking-wide mb-2">Region breakup</div>

      <div className="space-y-2 md:hidden">
        {active.map((l) => (
          <RegionCard key={l.region} r={l} />
        ))}
      </div>

      <div className="hidden md:block rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-ink-soft">
            <tr className="border-b border-border">
              <th rowSpan={2} className="sticky left-0 z-10 bg-card px-2.5 py-1.5 text-left font-semibold">Region</th>
              <th rowSpan={2} className={th}>Total</th>
              <th colSpan={2} className={`${th} text-center`} style={{ color: C.exempted }}>Exempted</th>
              <th colSpan={2} className={`${th} text-center`} style={{ color: C.assessed }}>Assessed</th>
              <th rowSpan={2} className={th} style={{ color: C.pending }}>Pending</th>
              <th rowSpan={2} className={th} style={{ color: C.safe }}>Safe</th>
              <th rowSpan={2} className={th} style={{ color: C.unsafe }}>Unsafe</th>
            </tr>
            <tr className="border-b border-border">
              <th className={th}>PSSP/PSRP</th>
              <th className={th}>5 yr</th>
              <th className={th}>Without App</th>
              <th className={th}>With App</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {active.map((l) => row(l.region, l.v, l.core))}
            {exemptOnly.length ? (
              <tr>
                <td colSpan={9} className="sticky left-0 bg-surface px-2.5 py-1 text-[11px] text-ink-faint">Fully exempted regions</td>
              </tr>
            ) : null}
            {exemptOnly.map((l) => row(l.region, l.v, l.core, "text-ink-faint opacity-70"))}
            {only ? null : row("Total", total, totalCore, "border-t-2 border-border font-semibold")}
          </tbody>
        </table>
      </div>

      {exemptOnly.length ? (
        <p className="md:hidden text-[11.5px] text-ink-faint mt-2">
          Fully exempted regions: {exemptOnly.map((l) => `${l.region} (${fmt(l.v.exempted)})`).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

/** The parts must add up; if not, say so instead of showing wrong numbers silently. */
export function DataCheck({ v }: { v: BreakupView }) {
  if (!v.failed.length) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-band-average-tint px-2.5 py-1.5 text-[11.5px] text-ink mb-3">
      <AlertTriangle size={13} className="shrink-0 mt-0.5 text-band-average" />
      Data check failed: {v.failed.join("; ")}. Check the Campus Survey Plan tab.
    </p>
  );
}
