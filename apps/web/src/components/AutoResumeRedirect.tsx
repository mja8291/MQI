
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSurvey } from "@/lib/survey-context";
import { resumeTargetRoute } from "@/lib/resume-target";

/**
 * Mounted on Home only. SurveyProvider's own mount effect (see
 * survey-context.tsx's ACTIVE_SURVEY_STORAGE_KEY) already auto-loads an
 * in-progress survey from IndexedDB into `state` the moment it detects the
 * pointer — that part happens regardless of which page triggered the
 * mount, Home included, now that the provider covers the whole app. What's
 * missing without this component: Home doesn't otherwise know or care that
 * happened, so a cold start (the actual, common scenario this exists for —
 * Android killing the app under memory pressure while offline, surveyor
 * reopens it, PWA start_url is always "/") would just... sit there on
 * Home, survey silently loaded into memory but nothing on screen reflecting
 * it except needing to notice and tap the right entry in the Queue tab.
 * This finishes the job: the moment hydration confirms there's a live
 * survey, jump straight back into it, same as reopening any other app
 * would land you where you left off.
 */
export function AutoResumeRedirect() {
  const router = useRouter();
  const { state, hydrated } = useSurvey();

  useEffect(() => {
    if (!hydrated || !state.surveyId || !state.school || !state.method) return;
    router.replace(resumeTargetRoute(state));
    // resumeTargetRoute also reads state.m2.current, deliberately not
    // listed below — this only needs to run once the survey/method
    // decision settles, using whatever m2 shape happens to be current at
    // that moment; re-evaluating every time an m2 field changes would be
    // pointless (we've already navigated away by then) and wrong (we
    // shouldn't redirect again later just because scoring continued).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state.surveyId, state.school, state.method, router]);

  return null;
}
