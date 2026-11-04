import { useEffect, useState } from "react";
import Link from "next/link";
import type { OwnSurveySummary, PullResult } from "@mqi/shared";
import { api } from "@/lib/api";
import { getOwnSurveys, saveOwnSurveys } from "@/lib/offline/db";
import { BAND_COLOR } from "@/lib/scoring";

/**
 * v2 (W54): the surveys this user has submitted, as the server has them. Only this short list is
 * kept on the phone (for a quick start offline); each assessment opens from the server, read only,
 * so finished surveys and their photos don't take up space on the phone.
 */
export function MyAssessments() {
  const [list, setList] = useState<OwnSurveySummary[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    void getOwnSurveys().then((cached) => alive && setList((l) => l ?? cached));
    api<PullResult>("sync.pull")
      .then(async ({ surveys }) => {
        await saveOwnSurveys(surveys);
        if (alive) {
          setList(surveys);
          setOffline(false);
        }
      })
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, []);

  if (list === null) return <p className="text-sm text-ink-faint py-6 text-center">Loading…</p>;
  return (
    <div>
      {offline ? (
        <p className="text-[12px] text-ink-soft mb-3">No connection: this is the list from your last visit. Assessments open when you are online.</p>
      ) : null}
      {list.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-ink mb-1">No assessments yet</p>
          <p className="text-[12.5px] text-ink-soft">Surveys you submit appear here once they reach the server.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {list.map((s) => (
            <Link key={s.surveyId} href={`/my-assessments?id=${encodeURIComponent(s.surveyId)}`} className="flex items-center gap-2.5 px-3.5 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink truncate">{s.campusName}</div>
                <div className="text-[11px] text-ink-faint">
                  {new Date(s.submittedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {s.locations} location
                  {s.locations === 1 ? "" : "s"}
                </div>
              </div>
              {s.overall !== null ? (
                <span className="text-[11px] font-semibold shrink-0" style={{ color: BAND_COLOR[s.ratingBand as keyof typeof BAND_COLOR] ?? "inherit" }}>
                  {Math.round(s.overall)}% · {s.ratingBand}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
