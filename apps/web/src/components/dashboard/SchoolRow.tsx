import { ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { BAND_COLOR } from "@/lib/scoring";
import type { CapturedSchool } from "@/lib/data/mock-dashboard";
import { downloadSurveyExcel, downloadSurveyPdf } from "@/lib/export/submitted";

const BAND_TINT: Record<string, string> = {
  Excellent: "var(--brand-tint)",
  Good: "var(--brand-tint)",
  Average: "var(--band-average-tint)",
  Poor: "var(--band-poor-tint)",
};

function Downloads({ surveyId, name }: { surveyId: string; name: string }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() =>
          void downloadSurveyExcel(surveyId).catch(() =>
            window.alert("Couldn't download right now."),
          )
        }
        aria-label={`Export ${name} as Excel`}
        className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center text-ink-faint"
      >
        <FileSpreadsheet size={15} />
      </button>
      <button
        type="button"
        onClick={() =>
          void downloadSurveyPdf(surveyId).catch(() =>
            window.alert("Couldn't download right now."),
          )
        }
        aria-label={`Export ${name} as PDF`}
        className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center text-ink-faint"
      >
        <FileText size={15} />
      </button>
    </span>
  );
}

/** v2 (W56): a survey with any item marked Unsafe (Wall Unsafe alone excepted) shows in red as Unsafe. */
function UnsafeBadge({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <span
      title={`Unsafe: ${items.join(", ")}`}
      className="text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-band-poor text-white"
    >
      Unsafe
    </span>
  );
}

const when = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export function SchoolRow({ school }: { school: CapturedSchool }) {
  // W53: a campus surveyed more than once lists every survey, not only the latest.
  const [open, setOpen] = useState(false);
  const others = school.earlier ?? [];
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2.5 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {school.name}
          </div>
          <div className="text-[11px] text-ink-faint">
            {school.region} · {school.area} · {when(school.date)}
            {school.submittedBy ? ` · ${school.submittedBy}` : ""}
          </div>
          {others.length ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-deep"
            >
              {others.length + 1} surveys of this campus
              <ChevronDown size={13} className={open ? "rotate-180" : ""} />
            </button>
          ) : null}
          {school.unsafeItems?.length ? (
            <div className="text-[11px] font-semibold text-band-poor leading-snug">
              Unsafe: {school.unsafeItems.join(", ")}
            </div>
          ) : null}
        </div>
        <UnsafeBadge items={school.unsafeItems} />
        <span
          className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0"
          style={{
            background: BAND_TINT[school.band],
            color: BAND_COLOR[school.band],
          }}
        >
          {Math.round(school.overall)}% · {school.band}
        </span>
        {school.surveyId ? (
          <Downloads surveyId={school.surveyId} name={school.name} />
        ) : null}
      </div>
      {open
        ? others.map((e) => (
            <div
              key={e.surveyId}
              className="flex items-center gap-2.5 py-2 pl-3 border-t border-dashed border-border"
            >
              <div className="flex-1 min-w-0 text-[11.5px] text-ink-soft">
                {when(e.date)}
                {e.submittedBy ? ` · ${e.submittedBy}` : ""}
                {e.unsafeItems?.length ? (
                  <div className="font-semibold text-band-poor">Unsafe: {e.unsafeItems.join(", ")}</div>
                ) : null}
              </div>
              <UnsafeBadge items={e.unsafeItems} />
              <span
                className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: BAND_TINT[e.band],
                  color: BAND_COLOR[e.band],
                }}
              >
                {Math.round(e.overall)}% · {e.band}
              </span>
              <Downloads
                surveyId={e.surveyId}
                name={`${school.name} (${when(e.date)})`}
              />
            </div>
          ))
        : null}
    </div>
  );
}
