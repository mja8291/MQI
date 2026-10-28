
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { TopBar } from "@/components/ui/TopBar";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useSurvey } from "@/lib/survey-context";
import type { School } from "@/lib/types";
import { cacheSchools, getCachedSchools } from "@/lib/offline/db";
import { api, isAuthError } from "@/lib/api";
import { notifyAuthRequired } from "@/lib/auth/events";
import { prefetchSiblingExternal } from "@/lib/sibling-external";
import type { SchoolsResult } from "@mqi/shared";

export default function FindSchoolPage() {
  const router = useRouter();
  const { state, setSchool } = useSurvey();
  const [schools, setSchools] = useState<School[]>([]);
  // v2 (parity-notes W9): the saved list shows at once; the note says "Updating" while the
  // fresh list loads (Apps Script takes seconds) and "Offline" only once that load has failed.
  const [listState, setListState] = useState<"loading" | "fresh" | "failed">("loading");
  const [usingCache, setUsingCache] = useState(false);
  const [query, setQuery] = useState("");
  // Coming back to this screen keeps the chosen school and its region/area filled in.
  const [region, setRegion] = useState(state.school?.region ?? "");
  const [area, setArea] = useState(state.school?.area ?? "");
  const [selected, setSelected] = useState<School | null>(state.school);

  useEffect(() => {
    // Show the last-known list immediately (works offline), then refresh from the network.
    let fresh = false;
    getCachedSchools().then((cached) => {
      // The network can answer first; never replace a fresh list with the saved one.
      if (cached && !fresh) {
        setSchools(cached);
        setUsingCache(true);
      }
    });

    // A failed call (offline, server error) rejects, so the good offline cache is never
    // overwritten with an empty list.
    api<SchoolsResult>("schools.list")
      .then((data) => {
        fresh = true;
        const list = data.schools ?? [];
        setSchools(list);
        setUsingCache(false);
        setListState("fresh");
        if (list.length > 0) cacheSchools(list);
      })
      .catch((e: unknown) => {
        // Whatever we already loaded from cache (if any) stands.
        setListState("failed");
        if (isAuthError(e)) notifyAuthRequired();
      });
  }, []);

  const regions = useMemo(() => Array.from(new Set(schools.map((s) => s.region))).sort(), [schools]);
  const areas = useMemo(
    () => Array.from(new Set(schools.filter((s) => s.region === region).map((s) => s.area))).sort(),
    [schools, region]
  );
  const areaSchools = useMemo(
    () => schools.filter((s) => s.region === region && s.area === area).sort((a, b) => a.name.localeCompare(b.name)),
    [schools, region, area]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return schools.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [schools, query]);

  // v2 (W10): picking a school (by search, or a sibling campus) fills Region and Area too.
  function pick(school: School) {
    setSelected(school);
    setRegion(school.region);
    setArea(school.area);
    setQuery("");
  }

  // The full record (location, coordinates, e-compound) comes from the list, not the survey.
  const details = useMemo(() => (selected ? schools.find((s) => s.schoolId === selected.schoolId) ?? selected : null), [schools, selected]);
  const siblings = useMemo(
    () =>
      details?.eCompoundNo
        ? schools.filter((s) => s.eCompoundNo === details.eCompoundNo && s.schoolId !== details.schoolId).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [schools, details]
  );

  function continueToDetails() {
    if (!selected) return;
    // Only the four survey fields travel with the survey; the details are for this screen.
    setSchool({ schoolId: selected.schoolId, name: selected.name, region: selected.region, area: selected.area });
    if (details?.eCompoundNo) prefetchSiblingExternal(selected.schoolId);
    router.push("/survey/details");
  }

  return (
    <ScreenShell>
      <TopBar title="Find school" onBack={() => router.push("/")} />

      {usingCache ? (
        <p className="text-[11px] text-ink-faint bg-surface rounded-lg px-2.5 py-2 mb-3">
          {listState === "failed"
            ? "Offline — showing the last saved campus list."
            : "Updating the campus list… you can search the saved one now."}
        </p>
      ) : null}

      <Field label="Search by name">
        <TextInput
          placeholder="Start typing a campus name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searchResults.length > 0 ? (
          <div className="mt-2 rounded-[10px] border border-border overflow-hidden">
            {searchResults.map((s) => (
              <button
                key={s.schoolId}
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2.5 text-[13px] border-b border-border last:border-b-0 active:bg-brand-tint"
              >
                {s.name}
                <div className="text-[11px] text-ink-faint">
                  {s.region} · {s.area}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </Field>

      <p className="text-center text-[11px] text-ink-faint my-4">or browse by region</p>

      <Field label="Region">
        <select
          value={region}
          onChange={(e) => {
            // Changing a parent clears everything that depended on it.
            setRegion(e.target.value);
            setArea("");
            setSelected(null);
          }}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
        >
          <option value="">Select a region</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Area">
        <select
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setSelected(null);
          }}
          disabled={!region}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink disabled:text-ink-faint"
        >
          <option value="">{region ? "Select an area" : "Select a region first"}</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Field>

      <Field label="School">
        <select
          value={selected?.schoolId ?? ""}
          onChange={(e) => {
            const s = areaSchools.find((x) => x.schoolId === e.target.value);
            if (s) pick(s);
          }}
          disabled={!area}
          className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink disabled:text-ink-faint"
        >
          <option value="">{area ? "Select a school" : "Select an area first"}</option>
          {areaSchools.map((s) => (
            <option key={s.schoolId} value={s.schoolId}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      {details ? <CampusCard school={details} siblings={siblings} onPick={pick} /> : null}

      <div className="mt-auto pt-4 border-t border-border">
        <Button onClick={continueToDetails} disabled={!selected}>
          Continue
        </Button>
      </div>
    </ScreenShell>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-[12.5px]">
      <span className="w-[92px] shrink-0 text-ink-faint">{label}</span>
      <span className="flex-1 min-w-0 text-ink break-words">{children}</span>
    </div>
  );
}

/** v2 (W10): the chosen campus with its e-compound, location, coordinates and sibling campuses. */
function CampusCard({ school, siblings, onPick }: { school: School; siblings: School[]; onPick: (s: School) => void }) {
  // Town and city only when the address doesn't already name them.
  const address = school.address ?? "";
  const place = [address, ...[school.town, school.city].filter((v) => v && !address.toLowerCase().includes(v.toLowerCase()))]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .join(", ");
  const hasCoords = Boolean(school.latitude && school.longitude);
  return (
    <div className="rounded-[10px] border border-border bg-brand-tint/40 px-3 py-2.5 mt-1">
      <div className="text-[14px] font-semibold text-brand-deep mb-1">{school.name}</div>
      <DetailRow label="E-compound">
        {school.eCompoundName || school.eCompoundNo || "—"}
        {school.eCompoundName && school.eCompoundNo && !school.eCompoundName.includes(school.eCompoundNo) ? ` (${school.eCompoundNo})` : ""}
      </DetailRow>
      <DetailRow label="Location">{place || "—"}</DetailRow>
      <DetailRow label="Coordinates">
        {hasCoords ? (
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(`${school.latitude},${school.longitude}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-deep underline"
          >
            {school.latitude}, {school.longitude}
          </a>
        ) : (
          "—"
        )}
      </DetailRow>
      <DetailRow label="Same compound">
        {siblings.length === 0 ? (
          "No other campus"
        ) : (
          <span className="flex flex-col items-start gap-1">
            {siblings.map((s) => (
              <button key={s.schoolId} type="button" onClick={() => onPick(s)} className="text-left text-brand-deep underline">
                {s.name}
              </button>
            ))}
          </span>
        )}
      </DetailRow>
    </div>
  );
}
