
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Pause, Play, Save } from "lucide-react";
import { clearActiveSurveyPointers, useSurvey } from "@/lib/survey-context";
import { formatElapsedMinutes } from "@/lib/format-duration";
import { saveDraft, saveDraftOnUnload } from "@/lib/draft";

// Round 3 Task 9 shipped "Save draft" as a manual button only. That's the bug
// a real user hit: state lives purely in memory (useReducer) until someone
// taps Save, so anything that takes the tab away without warning — an
// incoming phone call backgrounding the browser, the OS reclaiming a
// backgrounded tab's memory, the phone just dying — loses every unsaved
// answer. Autosave below fixes that two ways:
//   1. A debounce so an in-progress burst of edits (ticking through items,
//      typing a note) settles to a save shortly after activity pauses,
//      without writing to IndexedDB on literally every keystroke.
//   2. A hard cap so someone who *never* pauses (a long note typed
//      continuously) still gets saved periodically instead of the debounce
//      resetting forever.
// Neither of those fires *during* a sudden interruption, though — the
// debounce timer is still waiting when the call comes in. That's what the
// visibilitychange/pagehide flush is for: the moment the tab is backgrounded
// or unloaded, whatever's pending is written immediately, best-effort.
const AUTOSAVE_DEBOUNCE_MS = 2000;
const AUTOSAVE_MAX_WAIT_MS = 12000;

function computeElapsed(startTime: string, pausedAt: string | null, pausedSeconds: number): number {
  const startMs = new Date(startTime).getTime();
  const nowMs = Date.now();
  const openPauseMs = pausedAt ? nowMs - new Date(pausedAt).getTime() : 0;
  return Math.max(0, Math.round((nowMs - startMs - pausedSeconds * 1000 - openPauseMs) / 1000));
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Persistent bar showing elapsed time since the survey started (see
 * survey-context START_SURVEY), with a Pause/Resume control and — Round 3
 * Task 9 — a Save draft control. Rendered once in survey/layout.tsx so it's
 * present across the whole locations/review flow without every page wiring it
 * in individually; that's also why Save draft lives here rather than on any
 * one page — "close the app and finish later" needs to work from wherever
 * the surveyor happens to be mid-assessment, not just from Review. Renders
 * nothing before the survey starts (no startTime yet) or on the Done
 * screen (assessment is over — the timer's job is done, see submit.ts for
 * the final tally).
 */
export function SurveyTimerBar() {
  const pathname = usePathname();
  const { state, pauseTimer, resumeTimer } = useSurvey();
  const paused = Boolean(state.pausedAt);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveFlashTimeoutRef.current) clearTimeout(saveFlashTimeoutRef.current);
    };
  }, []);

  // Always the latest state, read from timers/listeners that are set up
  // once and shouldn't need to be torn down and rebuilt on every keystroke
  // just to close over a fresh `state`.
  const stateRef = useRef(state);
  stateRef.current = state;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const runSave = useCallback(async () => {
    const s = stateRef.current;
    if (!s.school || !s.started || !s.surveyId) return; // nothing to save yet
    if (savingRef.current) return; // a save is already in flight — it'll pick up this state or the next debounce will
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      await saveDraft(s);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (saveFlashTimeoutRef.current) clearTimeout(saveFlashTimeoutRef.current);
      saveFlashTimeoutRef.current = setTimeout(() => setSaveState("idle"), 2500);
    }
  }, []);

  const handleSaveDraft = runSave;

  // Leave the survey without losing it: pause the clock (the time it then
  // sits in the Queue tab isn't time spent assessing), write the draft, forget
  // which survey is "live" (otherwise opening Home would auto-resume straight
  // back into it — survey-context's ACTIVE_SURVEY_STORAGE_KEY), and load Home
  // fresh. A full page load rather than router.push + reset() on purpose: see
  // clearActiveSurveyPointers. Resume from the Queue tab reloads the draft.
  const handleSaveAndExit = useCallback(async () => {
    pauseTimer();
    // Let the pause render so stateRef (read by runSave) carries it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runSave();
    clearActiveSurveyPointers();
    window.location.assign("/?tab=incomplete"); // W28: a saved draft is listed under Incomplete
  }, [pauseTimer, runSave]);

  // Debounced autosave: any survey action reschedules the debounce timer, so
  // a save fires ~2s after activity settles. The max-wait timer is only
  // (re)armed when it isn't already pending, so continuous edits still force
  // a save at least every AUTOSAVE_MAX_WAIT_MS instead of the debounce
  // resetting indefinitely.
  useEffect(() => {
    if (!state.school || !state.started || !state.surveyId) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => void runSave(), AUTOSAVE_DEBOUNCE_MS);
    if (!maxWaitTimerRef.current) {
      maxWaitTimerRef.current = setTimeout(() => void runSave(), AUTOSAVE_MAX_WAIT_MS);
    }
  }, [state, runSave]);

  // The debounce above (and the pagehide/visibilitychange flush further
  // down) both assume *some* orderly event gives autosave a chance to run
  // before data is at risk — a pause in typing, or the page being
  // backgrounded/unloaded. Neither assumption holds for the single most
  // fragile moment in the whole flow: the instant the survey first starts
  // (START_SURVEY, which mints surveyId) leaves a survey that exists only in
  // memory, with nothing in IndexedDB yet to recover — see
  // ACTIVE_SURVEY_STORAGE_KEY in survey-context.tsx, which points at this
  // surveyId but has nothing to load until a draft actually lands. A real
  // Android app-process kill under memory pressure isn't a graceful
  // navigation or backgrounding event; it doesn't reliably fire pagehide or
  // visibilitychange at all, so if that happens inside the debounce's ~2s
  // window (confirmed reported live: connection dropped, tapped Start survey,
  // landed straight back on Home with nothing to resume into), autosave
  // never got a chance to run even once. Saving immediately the moment a
  // new surveyId first appears — instead of waiting on the debounce — means
  // there's always at least one real snapshot in IndexedDB from the first
  // instant a survey exists, not just from whenever activity next settles.
  const lastSavedSurveyIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.surveyId && state.surveyId !== lastSavedSurveyIdRef.current) {
      lastSavedSurveyIdRef.current = state.surveyId;
      void runSave();
    }
  }, [state.surveyId, runSave]);

  // Safety net for a sudden interruption (incoming call, switching apps,
  // closing the tab) — flush immediately instead of waiting on the debounce.
  // visibilitychange fires reliably when a mobile browser is backgrounded
  // (the phone-call case), which pagehide alone would miss since the tab
  // isn't actually being unloaded.
  useEffect(() => {
    // v2: written synchronously (saveDraftOnUnload) — an async save started here may never
    // reach IndexedDB before the page is gone.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") saveDraftOnUnload(stateRef.current);
    }
    function onPageHide() {
      saveDraftOnUnload(stateRef.current);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [runSave]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
    };
  }, []);
  // Date.now() can't be called during render (react-hooks/purity), and
  // setState can't be called synchronously in an effect body
  // (react-hooks/set-state-in-effect) — so every read of it happens inside
  // this interval's callback instead. The very first tick lands up to a
  // minute after mount/pause/resume; until then this shows the last value
  // computed, which needs no correction at mount (elapsed is ~0 the instant
  // the survey starts) and is at worst a minute stale right after a resume.
  //
  // Deliberately once-per-minute, not once-per-second re-labeled as
  // "min" — the whole point (Task 6 addendum) is cutting the visual churn
  // of a digit changing every second, so the interval itself has to be
  // coarse, not just the formatting.
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!state.startTime || paused) return;
    const startTime = state.startTime;
    const pausedAt = state.pausedAt;
    const pausedSeconds = state.pausedSeconds;
    const id = setInterval(() => setSeconds(computeElapsed(startTime, pausedAt, pausedSeconds)), 60000);
    return () => clearInterval(id);
  }, [state.startTime, state.pausedAt, state.pausedSeconds, paused]);

  if (!state.startTime || pathname === "/survey/done") return null;

  return (
    <div className="w-full max-w-md mx-auto px-5 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${
          paused ? "border-band-average bg-band-average-tint text-band-average" : "border-border bg-card text-ink-soft"
        }`}
      >
        <span className="font-medium">
          {paused ? "Paused" : "Time on assessment"}
          {" · "}
          <span className={`font-display font-semibold ${paused ? "text-band-average" : "text-ink"}`}>
            {formatElapsedMinutes(seconds)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saveState === "saving"}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 font-semibold text-ink-soft disabled:opacity-60"
          >
            <Save size={13} />
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Failed" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={paused ? resumeTimer : pauseTimer}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 font-semibold text-ink-soft"
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAndExit()}
            aria-label="Save and exit to the queue"
            title="Save and exit to the queue"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-2 py-1.5 text-ink-soft"
          >
            <LogOut size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}
