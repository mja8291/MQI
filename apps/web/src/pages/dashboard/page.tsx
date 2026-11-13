
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { breakupView, ratingBand } from "@mqi/shared";
import { BAND_COLOR } from "@/lib/scoring";
import type { CampusBreakupCore } from "@mqi/shared";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScoreDistribution } from "@/components/dashboard/ScoreDistribution";
import { RegionRow } from "@/components/dashboard/RegionRow";
import { SchoolRow } from "@/components/dashboard/SchoolRow";
import { AppProgress, DataCheck, NetworkBar, RegionBreakup, SafetyMatrix, SummaryCards, fmt } from "@/components/dashboard/Breakdown";
import { notifyAuthRequired } from "@/lib/auth/events";
import type { RatingBand } from "@/lib/types";
import type { DashboardData } from "@/lib/sheets/dashboard";
import { api, isAuthError } from "@/lib/api";
import { getMeta, setMeta } from "@/lib/offline/db";
import { downloadAllResponses } from "@/lib/export/submitted";

const FILTERS: ("All" | RatingBand)[] = ["All", "Excellent", "Good", "Average", "Poor"];
const BANDS: RatingBand[] = ["Excellent", "Good", "Average", "Poor"];

const Heading = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="mt-5 mb-2">
    <div className="text-xs font-semibold text-brand-deep uppercase tracking-wide">{children}</div>
    {sub ? <div className="text-[11px] text-ink-faint">{sub}</div> : null}
  </div>
);

/**
 * v2 (W65): the dashboard as one top-down hierarchy — network bar, Exempted / Assessed / Pending,
 * the Safe/Unsafe matrix, App progress, the region breakup — then the MQI score sections. The
 * region filter applies to everything; the rating chips only to the MQI sections and the list.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [filter, setFilter] = useState<"All" | RatingBand>("All");
  const [region, setRegion] = useState("");
  // W71: search the campus list by name, campus ID, area, region or surveyor.
  const [query, setQuery] = useState("");
  const [exportingAll, setExportingAll] = useState(false);

  useEffect(() => {
    // Last copy first (works offline, as v1's cached /api/dashboard did), then the server's.
    void getMeta<DashboardData>("dashboard").then((cached) => cached && setData((d) => d ?? cached));
    api<DashboardData>("dashboard.get")
      .then((fresh) => {
        setData(fresh);
        void setMeta("dashboard", fresh);
      })
      .catch((e: unknown) => {
        if (isAuthError(e)) notifyAuthRequired(); // signed out or no longer approved — the app sends them to sign in
      });
  }, []);

  const regions = useMemo(
    () => [...new Set([...Object.keys(data?.breakup?.regions ?? {}), ...(data?.byRegion ?? []).map((r) => r.region)])].filter(Boolean).sort(),
    [data],
  );
  const core: CampusBreakupCore | undefined = data?.breakup ? (region ? data.breakup.regions?.[region] : data.breakup) : undefined;
  const view = core ? breakupView(core) : null;

  // The MQI sections cover the App surveys (the dashboard's campus list), in the chosen region.
  const inRegion = data ? data.schools.filter((s) => !region || s.region === region) : [];
  const distribution = Object.fromEntries(BANDS.map((b) => [b, inRegion.filter((s) => s.band === b).length])) as Record<RatingBand, number>;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (s: (typeof inRegion)[number]) =>
    !words.length || words.every((w) => [s.name, s.schoolId, s.area, s.region, s.submittedBy ?? ""].join(" ").toLowerCase().includes(w));
  const listed = inRegion.filter((s) => (filter === "All" || s.band === filter) && matches(s));
  const outside = core?.surveyedOutsidePlan ?? 0;
  // W68: average Major (Engineering) and Minor (school-maintained, *) scores of the surveys shown.
  const avgOf = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const avgMajor = avgOf(inRegion.map((s) => s.major));
  const avgMinor = avgOf(inRegion.map((s) => s.minor));
  const mqiScope = `App surveys${outside ? `, incl. ${fmt(outside)} outside the survey list` : ""}${region ? ` · ${region}` : ""}`;

  return (
    <ScreenShell wide>
      <TopBar
        title="MQI Dashboard"
        onBack={() => router.push("/")}
        right={
          <button
            type="button"
            disabled={exportingAll}
            onClick={() => {
              setExportingAll(true);
              downloadAllResponses()
                .catch(() => window.alert("Couldn't export right now. Check your connection and try again."))
                .finally(() => setExportingAll(false));
            }}
            className="text-xs font-semibold text-brand-deep underline"
          >
            {exportingAll ? "Exporting…" : "Export all (.xlsx)"}
          </button>
        }
      />

      {!data ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-[11.5px] text-ink-faint">
              {data.generatedAt
                ? `Report of ${new Date(data.generatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                : "Report"}
            </span>
            <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              Region
              <select
                aria-label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="rounded-lg border border-border bg-white px-2 py-1.5 text-[12.5px] text-ink max-w-[11rem]"
              >
                <option value="">All regions</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {core && view ? (
            <>
              <DataCheck v={view} />
              <NetworkBar v={view} />
              <SummaryCards v={view} b={core} />
              <SafetyMatrix v={view} />
              <AppProgress b={core} />
              {data.breakup ? <RegionBreakup b={data.breakup} only={region || undefined} /> : null}
            </>
          ) : (
            // No Campus Survey Plan tab: the plain totals.
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <StatCard label="Total schools in scope" value={fmt(data.totalSchools)} />
              <StatCard label="Captured" value={fmt(data.captured)} sub={`${fmt(data.pending)} pending`} />
            </div>
          )}

          {/* The rating chips filter only the MQI sections and the captured list below. */}
          <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="MQI rating filter">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3.5 py-1.5 rounded-full border ${filter === f ? "bg-brand border-brand text-white" : "bg-white border-border text-ink-soft"}`}
              >
                {f}
              </button>
            ))}
          </div>

          <Heading sub={mqiScope}>MQI Score distribution</Heading>
          <ScoreDistribution distribution={distribution} />

          <Heading sub={mqiScope}>Major and minor items</Heading>
          <div className="grid grid-cols-2 gap-2.5" data-testid="major-minor">
            <StatCard
              label="Major items (Engineering)"
              value={avgMajor === null ? "—" : `${Math.round(avgMajor)}%`}
              sub={`Average · ${ratingBand(avgMajor) ?? "no scores"}`}
              color={avgMajor === null ? undefined : BAND_COLOR[ratingBand(avgMajor)!]}
            />
            <StatCard
              label="Minor items * (school)"
              value={avgMinor === null ? "—" : `${Math.round(avgMinor)}%`}
              sub={`Average · ${ratingBand(avgMinor) ?? "no scores"}`}
              color={avgMinor === null ? undefined : BAND_COLOR[ratingBand(avgMinor)!]}
            />
          </div>
          <p className="mt-1 text-[10.5px] text-ink-faint">
            Minor (*) items are maintained by the school itself. Each campus&apos;s Major and Minor score is in the list below (tap a campus on a phone).
          </p>

          <Heading sub={mqiScope}>MQI by region</Heading>
          {data.byRegion.filter((r) => !region || r.region === region).length === 0 ? (
            <p className="text-xs text-ink-faint">No regions captured yet.</p>
          ) : (
            data.byRegion.filter((r) => !region || r.region === region).map((r) => <RegionRow key={r.region} {...r} />)
          )}

          <Heading sub={`${fmt(listed.length)} shown`}>Schools captured</Heading>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campus, campus ID, area or surveyor"
            aria-label="Search campuses"
            className="w-full mb-2 rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] text-ink"
          />
          {listed.length === 0 ? (
            <p className="text-xs text-ink-faint py-3">{query.trim() ? `No campus matches "${query.trim()}".` : "No schools match this filter."}</p>
          ) : (
            listed.map((s) => <SchoolRow key={s.schoolId} school={s} />)
          )}
          <div className="h-6" />
        </>
      )}
    </ScreenShell>
  );
}
