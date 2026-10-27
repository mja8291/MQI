
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { useSurvey } from "@/lib/survey-context";
import { getDraft, deleteDraft } from "@/lib/offline/db";
import { DRAFTS_CHANGED_EVENT } from "@/lib/draft";
import { resumeTargetRoute } from "@/lib/resume-target";

/**
 * Transitional page (Round 3 Task 9) — the home screen's draft list links
 * here (this is the manual "tap a draft" path; see AutoResumeRedirect for
 * the automatic one, which fires on Home itself without needing this page
 * at all) rather than calling loadDraft directly, since a plain link is
 * simpler than wiring every Queue tab row through context. Loads the
 * draft, drops it from the drafts store (it's live app state again now,
 * not a saved-and-closed snapshot), and continues straight into scoring —
 * no reason to replay the Method 1 Campus Visit intro or method selection
 * for progress that's already underway.
 */
function ResumeContent() {
  const router = useRouter();
  const { loadDraft } = useSurvey();
  const id = useSearchParams().get("id");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    getDraft(id).then((draft) => {
      if (cancelled) return;
      if (!draft) {
        setError(true);
        return;
      }
      loadDraft(draft.state);
      deleteDraft(id).then(() => window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT)));
      router.replace(resumeTargetRoute(draft.state));
    });
    return () => {
      cancelled = true;
    };
    // loadDraft/router are stable across renders (see survey-context.tsx's
    // useMemo and Next's router); only id should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <ScreenShell>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <p className="text-sm text-ink-soft mb-4">
            That draft couldn&apos;t be found — it may have already been resumed or discarded.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="text-sm font-semibold text-brand-deep underline"
          >
            Back to home
          </button>
        </div>
      </ScreenShell>
    );
  }

  return <ScreenShell>{null}</ScreenShell>;
}

export default function ResumePage() {
  return (
    <Suspense fallback={null}>
      <ResumeContent />
    </Suspense>
  );
}
