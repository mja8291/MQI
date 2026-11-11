import { ChevronDown } from "lucide-react";
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

/**
 * W67: two small labelled boxes, XLS above PDF, each its own tap area (Excel green, PDF red),
 * showing "…" while that file is being made.
 */
function Downloads({ surveyId, name }: { surveyId: string; name: string }) {
  const [busy, setBusy] = useState<"xls" | "pdf" | null>(null);
  const run = (kind: "xls" | "pdf") => {
    if (busy) return;
    setBusy(kind);
    void (kind === "xls" ? downloadSurveyExcel(surveyId) : downloadSurveyPdf(surveyId))
      .catch(() => window.alert("Couldn't download right now."))
      .finally(() => setBusy(null));
  };
  const box = "h-[30px] w-11 rounded-md border text-[10.5px] font-bold tracking-wide flex items-center justify-center disabled:opacity-60";
  return (
    <span className="flex flex-col gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => run("xls")}
        disabled={busy !== null}
        aria-label={`Export ${name} as Excel`}
        className={`${box} border-[#16A34A] text-[#15803D] bg-[#F0FDF4]`}
      >
        {busy === "xls" ? "…" : "XLS"}
      </button>
      <button
        type="button"
        onClick={() => run("pdf")}
        disabled={busy !== null}
        aria-label={`Export ${name} as PDF`}
        className={`${box} border-[#DC2626] text-[#B91C1C] bg-[#FEF2F2]`}
      >
        {busy === "pdf" ? "…" : "PDF"}
      </button>
    </span>
  );
}

/** W67: the score and Safe/Unsafe, one above the other, so the campus name gets the width. */
function ScoreStack({ overall, band, unsafeItems }: { overall: number; band: string; unsafeItems?: string[] }) {
  return (
    <span data-testid="score-stack" className="flex flex-col items-center gap-1 shrink-0">
      <span
        className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: BAND_TINT[band], color: BAND_COLOR[band as keyof typeof BAND_COLOR] }}
      >
        {Math.round(overall)}% · {band}
      </span>
      <SafetyBadge items={unsafeItems} />
    </span>
  );
}

/** v2 (W56): a survey with any item marked Unsafe (Wall Unsafe alone excepted) shows in red as Unsafe. */
/** v2 (W65): Safe or Unsafe beside the MQI score, green or red. */
function SafetyBadge({ items }: { items?: string[] }) {
  const unsafe = Boolean(items?.length);
  return (
    <span
      title={unsafe ? `Unsafe: ${items!.join(", ")}` : "No unsafe item"}
      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0 text-white ${unsafe ? "bg-band-poor" : "bg-band-good"}`}
    >
      {unsafe ? "Unsafe" : "Safe"}
    </span>
  );
}

/** v2 (W65): the unsafe reasons in red, two lines at most until "more" is tapped. */
function UnsafeReasons({ items }: { items?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  const text = items.join(", ");
  return (
    <div className="text-[11px] font-semibold text-band-poor leading-snug">
      <span className={open ? "" : "line-clamp-2"}>Unsafe: {text}</span>
      {text.length > 70 ? (
        <button type="button" onClick={() => setOpen((o) => !o)} className="underline font-semibold">
          {open ? "less" : "more"}
        </button>
      ) : null}
    </div>
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
          <div className="text-[13px] font-semibold leading-snug line-clamp-2 break-words">
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
          <UnsafeReasons items={school.unsafeItems} />
        </div>
        <ScoreStack overall={school.overall} band={school.band} unsafeItems={school.unsafeItems} />
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
                <UnsafeReasons items={e.unsafeItems} />
              </div>
              <ScoreStack overall={e.overall} band={e.band} unsafeItems={e.unsafeItems} />
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
