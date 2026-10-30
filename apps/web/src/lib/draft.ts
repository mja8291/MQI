
import type { SurveyState } from "./survey-context";
import type { PhotoAsset } from "./types";
import { db, deleteDraft, saveDraft as saveDraftToDb, type SurveyDraft } from "./offline/db";

/** Fired on window whenever the saved-drafts list may have changed, so the home screen's banner can refresh. */
export const DRAFTS_CHANGED_EVENT = "mqi-drafts-changed";

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
}

/**
 * v1 downgraded photos caught mid-upload here. v2 photos are already saved on the phone when
 * they enter the state (bytes in IndexedDB, only the reference in the draft), so nothing to settle.
 */
function settlePhotos(photos: Record<string, PhotoAsset[]>): Record<string, PhotoAsset[]> {
  return photos;
}

/**
 * Surveys that have been submitted (or queued for sync) from this page load.
 * Autosave must never write one of these back: the survey's state is still in
 * memory until the Done screen resets it, and when the move to Done turns
 * into a full page reload (offline — the navigation's server fetch fails, so
 * Next falls back to a hard navigation) the page-unload flush in
 * SurveyTimerBar saves that still-full state *after* the draft was deleted,
 * resurrecting a submitted survey as a draft — which the home screen then
 * lists, and the cold-start auto-resume jumps straight back into. Module
 * state is enough: the unload flush runs in this same page load, before the
 * reload discards it.
 */
const submittedSurveyIds = new Set<string>();

/**
 * Call just before the survey is written to the send queue: from here on neither autosave nor the
 * close-time save writes this survey's draft, even if the phone kills the app mid-submit.
 * cancelSubmitting undoes it when queuing fails, so the draft keeps saving.
 */
export function markSubmitting(surveyId: string): void {
  submittedSurveyIds.add(surveyId);
}
export function cancelSubmitting(surveyId: string): void {
  submittedSurveyIds.delete(surveyId);
}

/** Call once a survey is accepted (sent, or queued): deletes its draft and keeps autosave from ever recreating it. */
export async function discardSubmittedDraft(surveyId: string): Promise<void> {
  submittedSurveyIds.add(surveyId);
  await deleteDraft(surveyId);
  notifyChanged();
}

/**
 * Snapshots the in-progress survey to IndexedDB so it survives closing the
 * app (Round 3 Task 9). Doesn't touch startTime/pausedAt/pausedSeconds —
 * this is a mid-progress save, not a "return to survey details" action,
 * so the timer keeps running exactly as it was.
 */
export async function saveDraft(state: SurveyState): Promise<void> {
  if (!state.school || !state.started) {
    throw new Error("Can't save a draft before a school is chosen and the survey started");
  }
  if (state.surveyId && submittedSurveyIds.has(state.surveyId)) return; // see submittedSurveyIds
  // surveyId is minted when the survey starts (START_SURVEY) and survives LOAD_DRAFT
  // on resume, so it's already the stable identity for "this one assessment
  // attempt" — reusing it as the drafts-store key is what makes a repeat
  // Save draft tap overwrite the same record instead of forking a new one.
  if (!state.surveyId) {
    throw new Error("Can't save a draft without a survey id");
  }
  const snapshot: SurveyState = {
    ...state,
    reviewPhotos: settlePhotos(state.reviewPhotos ?? {}),
    scoring: {
      locations: state.scoring.locations.map((l) => ({ ...l, photos: settlePhotos(l.photos) })),
      current: state.scoring.current ? { ...state.scoring.current, photos: settlePhotos(state.scoring.current.photos) } : null,
    },
  };
  await saveDraftToDb(toDraft(state, snapshot));
  // A write that was already in flight when the survey was submitted lands
  // after the delete — take it back out.
  if (submittedSurveyIds.has(state.surveyId)) await deleteDraft(state.surveyId);
  notifyChanged();
}

function toDraft(state: SurveyState, snapshot: SurveyState): SurveyDraft {
  return { surveyId: state.surveyId!, savedAt: new Date().toISOString(), schoolName: state.school!.name, state: snapshot };
}

/**
 * v2, FR-OFF-7: the unload flush. Dexie's put only starts its transaction after a few awaits,
 * which a page being torn down (reload, kill, tab close) never reaches. A transaction created
 * synchronously on the already-open connection is committed by the browser even as the page
 * goes away, so the latest answers survive. Falls back to the normal save if the database
 * isn't open yet.
 */
export function saveDraftOnUnload(state: SurveyState): void {
  if (!state.school || !state.started || !state.surveyId || submittedSurveyIds.has(state.surveyId)) return;
  try {
    if (!db.isOpen()) throw new Error("not open");
    const tx = db.backendDB().transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(toDraft(state, { ...state }));
    (tx as IDBTransaction & { commit?: () => void }).commit?.();
  } catch {
    void saveDraft(state).catch(() => undefined);
  }
}
