
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
import type { SchoolsResult } from "@mqi/shared";

export default function FindSchoolPage() {
  const router = useRouter();
  const { state, setSchool } = useSurvey();
  const [schools, setSchools] = useState<School[]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [area, setArea] = useState("");
  const [selected, setSelected] = useState<School | null>(state.school);

  useEffect(() => {
    // Show the last-known list immediately (works offline), then refresh from the network.
    getCachedSchools().then((cached) => {
      if (cached) {
        setSchools(cached);
        setUsingCache(true);
      }
    });

    // A failed call (offline, server error) rejects, so the good offline cache is never
    // overwritten with an empty list.
    api<SchoolsResult>("schools.list")
      .then((data) => {
        const list = data.schools ?? [];
        setSchools(list);
        setUsingCache(false);
        if (list.length > 0) cacheSchools(list);
      })
      .catch((e: unknown) => {
        // Whatever we already loaded from cache (if any) stands.
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

  function pick(school: School) {
    setSelected(school);
    setQuery("");
  }

  function continueToDetails() {
    if (!selected) return;
    setSchool(selected);
    router.push("/survey/details");
  }

  return (
    <ScreenShell>
      <TopBar title="Find school" onBack={() => router.push("/")} />

      {usingCache ? (
        <p className="text-[11px] text-ink-faint bg-surface rounded-lg px-2.5 py-2 mb-3">
          Offline — showing the last saved campus list.
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
            setRegion(e.target.value);
            setArea("");
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
          onChange={(e) => setArea(e.target.value)}
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

      {selected ? (
        <div className="inline-flex items-center gap-1.5 bg-brand-tint text-brand-deep text-[13px] font-semibold px-3 py-2 rounded-[10px] mt-1">
          {selected.name}
        </div>
      ) : null}

      <div className="mt-auto pt-4 border-t border-border">
        <Button onClick={continueToDetails} disabled={!selected}>
          Continue
        </Button>
      </div>
    </ScreenShell>
  );
}
