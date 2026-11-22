import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StalledUploadsResult } from "@mqi/shared";
import { api } from "@/lib/api";

const ago = (iso: string) => {
  if (!iso) return "never";
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/**
 * W90 (2026-11-23): surveys whose photos have waited more than a day after the answers arrived, with
 * the surveyor, so QA/QC can call them the same day (a surveyor's phone held 185 photos for four days
 * before anyone knew). The surveyor's next step is always the same: open the App on Wi-Fi, keep it on
 * screen and tap Sync now.
 */
export function StalledUploads() {
  const [data, setData] = useState<StalledUploadsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api<StalledUploadsResult>("files.stalled")
      .then((r) => {
        if (!alive) return;
        setData(r);
        if (r.surveys.length) setOpen(true);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load."));
    return () => {
      alive = false;
    };
  }, []);

  const n = data?.surveys.length ?? 0;
  return (
    <section aria-label="Photos waiting more than a day" className="mb-3 rounded-xl border border-border bg-card overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3.5 py-3 text-left">
        <span className="text-xs font-semibold text-brand-deep uppercase tracking-wide">Photos waiting more than a day</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${n ? "bg-band-poor text-white" : "bg-surface text-ink-soft"}`}>{data ? n : "…"}</span>
        <ChevronDown size={15} className={`ml-auto text-ink-soft ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="border-t border-border">
          {error ? <p className="px-3.5 py-3 text-[12.5px] text-band-poor">{error}</p> : null}
          {data && !n ? <p className="px-3.5 py-3 text-[12.5px] text-ink-soft">Every survey's photos have arrived or are less than a day old.</p> : null}
          {n ? (
            <>
              <p className="px-3.5 pt-3 text-[11.5px] text-ink-soft leading-snug">
                Ask the surveyor to open the App on Wi-Fi, keep it on screen and tap Sync now. If the count doesn't move, check the ErrorLog for "Photo upload stuck".
              </p>
              <ul className="divide-y divide-border">
                {data!.surveys.map((s) => (
                  <li key={s.surveyId} className="px-3.5 py-2.5">
                    <div className="text-[13px] font-semibold text-ink">{s.campusName || s.surveyId.slice(0, 8)}</div>
                    <div className="text-[12px] text-ink-soft">
                      {s.surveyor} · {s.waiting} of {s.total} photos waiting · answers {ago(s.since)} · last photo {ago(s.lastReceived)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
