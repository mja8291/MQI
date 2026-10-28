import type { SurveyState } from "./survey-context";

/**
 * Where a resumed survey should land, based on how far it got — shared by
 * both the manual "tap a draft on Home" flow (resume/page.tsx) and the
 * automatic one (AutoResumeRedirect), which fires from Home itself on a
 * cold start. A survey stages the in-progress location in
 * `scoring.current` until it's finalized, so an unfinalized one needs to land
 * on the category/scoring screen directly rather than the floor picker,
 * which has no idea `current` exists and would otherwise make it look like
 * that location's scores and photos were gone (see locations/category/page.tsx).
 */
export function resumeTargetRoute(state: Pick<SurveyState, "scoring">): string {
  return state.scoring.current ? "/survey/locations/category" : "/survey/locations";
}
