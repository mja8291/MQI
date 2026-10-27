import type { SurveyState } from "./survey-context";

/**
 * Where a resumed survey should land, based on how far it got — shared by
 * both the manual "tap a draft on Home" flow (resume/page.tsx) and the
 * automatic one (AutoResumeRedirect), which fires from Home itself on a
 * cold start. Method 1 has no staging concept, so it always goes straight
 * to its one scoring page; Method 2 stages the in-progress location in
 * `m2.current` until it's finalized, so an unfinalized one needs to land
 * on the category/scoring screen directly rather than the floor picker,
 * which has no idea `current` exists and would otherwise make it look like
 * that location's scores and photos were gone (see m2/category/page.tsx).
 */
export function resumeTargetRoute(state: Pick<SurveyState, "method" | "m2">): string {
  if (state.method === 1) return "/survey/m1";
  return state.m2.current ? "/survey/m2/category" : "/survey/m2";
}
