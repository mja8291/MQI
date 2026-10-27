import { FileSpreadsheet, FileText } from "lucide-react";
import { BAND_COLOR } from "@/lib/scoring";
import type { CapturedSchool } from "@/lib/data/mock-dashboard";
import { downloadSurveyExcel, downloadSurveyPdf } from "@/lib/export/submitted";

const BAND_TINT: Record<string, string> = {
  Excellent: "var(--brand-tint)",
  Good: "var(--brand-tint)",
  Average: "var(--band-average-tint)",
  Poor: "var(--band-poor-tint)",
};

export function SchoolRow({ school }: { school: CapturedSchool }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-border">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{school.name}</div>
        <div className="text-[11px] text-ink-faint">
          {school.region} · {school.area} · Method {school.method} ·{" "}
          {school.date ? new Date(school.date).toLocaleDateString() : "—"}
        </div>
      </div>
      <span
        className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0"
        style={{ background: BAND_TINT[school.band], color: BAND_COLOR[school.band] }}
      >
        {Math.round(school.overall)}% · {school.band}
      </span>
      {school.surveyId ? (
        <span className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void downloadSurveyExcel(school.surveyId).catch(() => window.alert("Couldn't download right now."))}
            aria-label={`Export ${school.name} as Excel`}
            className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center text-ink-faint"
          >
            <FileSpreadsheet size={15} />
          </button>
          <button
            type="button"
            onClick={() => void downloadSurveyPdf(school.surveyId).catch(() => window.alert("Couldn't download right now."))}
            aria-label={`Export ${school.name} as PDF`}
            className="h-10 w-10 shrink-0 rounded-lg border border-border flex items-center justify-center text-ink-faint"
          >
            <FileText size={15} />
          </button>
        </span>
      ) : null}
    </div>
  );
}
