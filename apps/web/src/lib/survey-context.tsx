
import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { getDraft } from "./offline/db";
import { emptyDrillingCheck, emptySiteChecks, type DrillingCheck, type SiteChecks } from "./types";
import type {
  Condition,
  FloorLevel,
  LocationType,
  BuildingStructure,
  CenterBeam,
  TypeOfStructure,
  SurveyLocation,
  PhotoAsset,
  PowerSupply,
  School,
  StructuralConcern,
} from "@/lib/types";
import type { ColumnCheck } from "@mqi/shared";
import { UNNAMED_LOCATION_TYPES } from "@/lib/data/items";
import { uuidv7 } from "@mqi/shared";

interface CurrentLocation {
  floorLevel: FloorLevel;
  type: LocationType | null;
  name: string;
  classroomGrade?: string;
  classroomSection?: string;
  scores: Record<string, Condition>;
  unsafeParts?: Record<string, string[]>;
  columnCheck?: ColumnCheck;
  /** Multiple photos per item are allowed. Each uploads to Drive individually on attach — see PhotoAsset. */
  photos: Record<string, PhotoAsset[]>;
  notes: Record<string, string>;
}

export interface SurveyState {
  school: School | null;
  /** True from the moment the survey starts (respondent details confirmed). */
  started: boolean;
  /** v2 (W24): levels confirmed for this campus; null until chosen (older drafts: every level). */
  levels: FloorLevel[] | null;
  asm: string;
  apm: string;
  principal: string;
  powerSupply: PowerSupply | "";
  structuralConcern: StructuralConcern | "";
  buildingStructure: BuildingStructure | "";
  typeOfStructure: TypeOfStructure | "";
  centerBeam: CenterBeam | "";
  drillingCheck: DrillingCheck;
  siteChecks: SiteChecks;
  /** Photos attached to last-page questions (see SITE_PHOTO_* in types.ts), keyed by question text. Same lifecycle as every other photo — each uploads to Drive individually on attach. */
  reviewPhotos: Record<string, PhotoAsset[]>;
  complaints: string;
  scoring: {
    locations: SurveyLocation[];
    current: CurrentLocation | null;
  };
  /**
   * Set the moment the survey starts, alongside startTime — every photo
   * uploaded during this attempt (Round 3 Task 8) carries this same id in
   * its Drive folder path, and the final submit's response/attachment rows
   * must reuse the exact same id so photos correlate back to their survey
   * row. Regenerated fresh on every START_SURVEY, same lifecycle as startTime.
   */
  surveyId: string | null;
  /** Set right after a successful (non-queued) submit, so the Done screen can offer downloads. */
  lastSurveyId: string | null;
  /** ISO timestamp set the moment the survey starts (not on page load, not on first item answered). Cleared if the user discards progress and goes back to survey details. */
  startTime: string | null;
  /** ISO timestamp of the most recent pause, while paused; null once resumed (or if never paused). */
  pausedAt: string | null;
  /** Seconds accumulated across every *completed* pause span. Does not include a currently-open pause — see pausedAt. */
  pausedSeconds: number;
}

/** v2: the survey ID is a UUID v7 — the idempotency key on the server (sync.push). */
function newSurveyId(): string {
  return uuidv7((n) => crypto.getRandomValues(new Uint8Array(n)));
}

/**
 * Points at whichever draft is "the one currently open" — kept in sync with
 * state.surveyId (see the effect in SurveyProvider below) so a forced fresh
 * reload mid-assessment can find its way back. This exists because of a
 * failure mode that has nothing to do with caching: a client-side
 * navigation (router.push) whose network request fails — confirmed via
 * Next's own console: "Failed to fetch RSC payload... Falling back to
 * browser navigation" — makes Next fall back to a real, fresh page load.
 * Precaching (see public/sw.js) makes that fresh load itself succeed
 * offline, but a fresh load still means a brand new SurveyProvider with
 * nothing in memory — every guarded page's own "no school/not started, bounce to
 * find-school" check would otherwise fire immediately and look exactly like
 * the survey was lost, even though autosave had it safely in IndexedDB the
 * whole time. localStorage (not IndexedDB) specifically because it's read
 * synchronously — nothing here can afford to wait on an async DB open just
 * to know whether an auto-resume attempt is worth making at all.
 */
const ACTIVE_SURVEY_STORAGE_KEY = "mqi-active-survey-id";

/**
 * Same forced-fresh-reload failure mode as ACTIVE_SURVEY_STORAGE_KEY above,
 * but for the one gap that pointer doesn't cover: picking a school happens
 * on find-school, *before* the survey starts, and surveyId (what
 * ACTIVE_SURVEY_STORAGE_KEY keys off) isn't minted until START_SURVEY. A
 * failed router.push("/survey/details") right after selecting a school —
 * confirmed live, offline, exactly this transition — falls back to a fresh
 * page load same as any other client navigation here, which mints a brand
 * new SurveyProvider with school back to null, and /survey/details's own
 * guard bounces straight back to find-school looking exactly like the
 * selection was silently lost. Kept in sync with state.school the same way
 * (write on select, clear on RESET) and restored on mount specifically in
 * the "nothing to resume" branch below — once the survey's started and a real
 * surveyId/draft exists, LOAD_DRAFT already carries school along with
 * everything else and is the more authoritative source.
 */
const PENDING_SCHOOL_STORAGE_KEY = "mqi-pending-school";

/**
 * Forgets "which survey is live" in localStorage without touching React
 * state. For leaving a survey on purpose (Save and exit, see
 * SurveyTimerBar): reset() would also do it, but resetting while the page
 * is still mounted trips every guarded page's "no school → bounce to
 * find-school" check before the navigation lands. Pair this with a full
 * page load so the next mount starts clean.
 */
export function clearActiveSurveyPointers(): void {
  try {
    localStorage.removeItem(ACTIVE_SURVEY_STORAGE_KEY);
    localStorage.removeItem(PENDING_SCHOOL_STORAGE_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}

function initialState(): SurveyState {
  return {
    school: null,
    started: false,
    levels: null,
    asm: "",
    apm: "",
    principal: "",
    powerSupply: "",
    structuralConcern: "",
    buildingStructure: "",
    typeOfStructure: "",
    centerBeam: "",
    drillingCheck: emptyDrillingCheck(),
    siteChecks: emptySiteChecks(),
    reviewPhotos: {},
    complaints: "",
    scoring: { locations: [], current: null },
    surveyId: null,
    lastSurveyId: null,
    startTime: null,
    pausedAt: null,
    pausedSeconds: 0,
  };
}

// Small pure helpers so the add/remove pair doesn't repeat the
// same Record<string, PhotoAsset[]> plumbing over (every
// photo field needs add/remove).
function addPhoto(photos: Record<string, PhotoAsset[]>, name: string, asset: PhotoAsset): Record<string, PhotoAsset[]> {
  return { ...photos, [name]: [...(photos[name] ?? []), asset] };
}
function removePhoto(photos: Record<string, PhotoAsset[]>, name: string, id: string): Record<string, PhotoAsset[]> {
  return { ...photos, [name]: (photos[name] ?? []).filter((p) => p.id !== id) };
}

function emptyCurrentLocation(floorLevel: FloorLevel): CurrentLocation {
  return { floorLevel, type: null, name: "", scores: {}, photos: {}, notes: {} };
}

type Action =
  | { type: "SET_SCHOOL"; school: School }
  | { type: "START_SURVEY" }
  | { type: "SET_RESPONDENT"; asm: string; apm: string; principal: string }
  | { type: "SET_LEVELS"; levels: FloorLevel[] }
  | { type: "SET_POWER_SUPPLY"; value: PowerSupply }
  | { type: "SET_STRUCTURAL_CONCERN"; value: StructuralConcern }
  | { type: "SET_BUILDING_STRUCTURE"; value: BuildingStructure }
  | { type: "SET_CENTER_BEAM"; value: CenterBeam }
  | { type: "SET_TYPE_OF_STRUCTURE"; value: TypeOfStructure }
  | { type: "SET_DRILLING_CHECK"; value: DrillingCheck }
  | { type: "SET_SITE_CHECKS"; value: SiteChecks }
  | { type: "REVIEW_ADD_PHOTO"; name: string; asset: PhotoAsset }
  | { type: "REVIEW_REMOVE_PHOTO"; name: string; id: string }
  | { type: "SET_COMPLAINTS"; value: string }
  | { type: "SET_LAST_SURVEY_ID"; surveyId: string | null }
  | { type: "LOC_SET_FLOOR"; floorLevel: FloorLevel; autoName?: string }
  | { type: "LOC_SET_LOCATION_TYPE"; floorLevel: FloorLevel; locationType: LocationType; autoName?: string }
  | { type: "LOC_SET_LOCATION_NAME"; name: string }
  | { type: "LOC_SET_CLASSROOM"; floorLevel: FloorLevel; grade: string; section: string }
  | { type: "LOC_CURRENT_SET_SCORE"; name: string; value: Condition }
  | { type: "LOC_CURRENT_SET_UNSAFE_PARTS"; name: string; parts: string[] }
  | { type: "LOC_CURRENT_SET_COLUMN_CHECK"; value: ColumnCheck }
  | { type: "LOC_CURRENT_ADD_PHOTO"; name: string; asset: PhotoAsset }
  | { type: "LOC_CURRENT_REMOVE_PHOTO"; name: string; id: string }
  | { type: "LOC_CURRENT_SET_NOTE"; name: string; value: string }
  | { type: "LOC_FINALIZE_CURRENT" }
  | { type: "LOC_DISCARD_CURRENT" }
  | { type: "LOC_RESUME_LOCATION"; id: string }
  | { type: "LOAD_DRAFT"; state: SurveyState }
  | { type: "DISCARD_PROGRESS" }
  | { type: "PAUSE_TIMER" }
  | { type: "RESUME_TIMER" }
  | { type: "RESET" };

function resumeNow(state: SurveyState): SurveyState {
  if (!state.pausedAt) return state;
  const openPauseSeconds = (Date.now() - new Date(state.pausedAt).getTime()) / 1000;
  return { ...state, pausedAt: null, pausedSeconds: state.pausedSeconds + openPauseSeconds };
}

// Actions that don't count as "doing the assessment" — picking a school or
// starting, discarding/resetting everything, and the pause/resume actions
// themselves (which manage pausedAt directly and would otherwise conflict
// with the auto-resume below).
const TIMER_EXEMPT_ACTIONS = new Set<Action["type"]>([
  "SET_SCHOOL",
  "START_SURVEY",
  "SET_LAST_SURVEY_ID",
  "LOAD_DRAFT",
  "DISCARD_PROGRESS",
  "PAUSE_TIMER",
  "RESUME_TIMER",
  "RESET",
]);

function reducer(state: SurveyState, action: Action): SurveyState {
  // Auto-resume on any real interaction while paused — picking a condition,
  // typing a note, choosing a floor/location/work category, editing
  // respondent details, etc. — so a forgotten "Resume" tap doesn't quietly
  // keep excluding real working time from the tally. The explicit
  // Pause/Resume button still exists for someone who wants to resume
  // without doing anything else yet.
  if (state.pausedAt && !TIMER_EXEMPT_ACTIONS.has(action.type)) {
    state = resumeNow(state);
  }

  switch (action.type) {
    case "SET_SCHOOL":
      return { ...state, school: action.school };
    case "START_SURVEY":
      // startTime is set here, not on page load or first item answered — the
      // moment the survey is actually started is what "starting the assessment"
      // means. surveyId is minted here too (Round 3 Task 8) — every photo
      // uploaded from here on carries this id in its Drive path, and submit
      // must reuse the exact same id so photos correlate back to their row.
      return {
        ...state,
        started: true,
        surveyId: newSurveyId(),
        startTime: new Date().toISOString(),
        pausedAt: null,
        pausedSeconds: 0,
      };
    case "SET_LEVELS":
      return { ...state, levels: action.levels };
    case "SET_RESPONDENT":
      return { ...state, asm: action.asm, apm: action.apm, principal: action.principal };
    case "SET_POWER_SUPPLY":
      return { ...state, powerSupply: action.value };
    case "SET_STRUCTURAL_CONCERN":
      return { ...state, structuralConcern: action.value };
    case "SET_BUILDING_STRUCTURE":
      return { ...state, buildingStructure: action.value };
    case "SET_CENTER_BEAM":
      return { ...state, centerBeam: action.value };
    case "SET_TYPE_OF_STRUCTURE":
      return { ...state, typeOfStructure: action.value };
    case "SET_DRILLING_CHECK":
      return { ...state, drillingCheck: action.value };
    case "SET_SITE_CHECKS":
      return { ...state, siteChecks: action.value };
    case "REVIEW_ADD_PHOTO":
      return {
        ...state,
        reviewPhotos: addPhoto(state.reviewPhotos, action.name, action.asset),
      };
    case "REVIEW_REMOVE_PHOTO":
      return { ...state, reviewPhotos: removePhoto(state.reviewPhotos, action.name, action.id) };
    case "SET_COMPLAINTS":
      return { ...state, complaints: action.value };
    case "SET_LAST_SURVEY_ID":
      return { ...state, lastSurveyId: action.surveyId };

    case "LOC_SET_FLOOR": {
      const current = emptyCurrentLocation(action.floorLevel);
      // Roof floor has no Location page — it *is* the location type, auto-named.
      if (action.floorLevel === "Roof") {
        current.type = "Roof";
        current.name = action.autoName ?? "Roof";
      }
      return { ...state, scoring: { ...state.scoring, current } };
    }
    case "LOC_SET_LOCATION_TYPE": {
      // Always builds a fresh current from the explicit floorLevel — doesn't
      // depend on a pre-existing current, so there's no ordering/timing
      // dependency on whatever the previous screen last set.
      const named = UNNAMED_LOCATION_TYPES.includes(action.locationType);
      const current = emptyCurrentLocation(action.floorLevel);
      current.type = action.locationType;
      current.name = named ? (action.autoName ?? action.locationType) : "";
      return { ...state, scoring: { ...state.scoring, current } };
    }
    case "LOC_SET_LOCATION_NAME":
      return state.scoring.current
        ? { ...state, scoring: { ...state.scoring, current: { ...state.scoring.current, name: action.name } } }
        : state;
    case "LOC_SET_CLASSROOM": {
      const current = emptyCurrentLocation(action.floorLevel);
      current.type = "Classroom";
      current.classroomGrade = action.grade;
      current.classroomSection = action.section;
      // Section is optional for single-instance rooms (Library, etc. — see
      // CLASSROOM_GRADES_WITH_OPTIONAL_SECTION) and arrives as "" rather
      // than a real value there, so skip the separator instead of leaving a
      // trailing space in the location name.
      current.name = action.section ? `${action.grade} ${action.section}` : action.grade;
      return { ...state, scoring: { ...state.scoring, current } };
    }
    case "LOC_CURRENT_SET_COLUMN_CHECK":
      return state.scoring.current ? { ...state, scoring: { ...state.scoring, current: { ...state.scoring.current, columnCheck: action.value } } } : state;
    case "LOC_CURRENT_SET_UNSAFE_PARTS": {
      // v2 (W21): any part marked → the item's Unsafe score; none left → unscored again.
      const current = state.scoring.current;
      if (!current) return state;
      const scores = { ...current.scores };
      const unsafeParts = { ...(current.unsafeParts ?? {}) };
      if (action.parts.length) {
        scores[action.name] = "Very Poor";
        unsafeParts[action.name] = action.parts;
      } else {
        delete scores[action.name];
        delete unsafeParts[action.name];
      }
      return { ...state, scoring: { ...state.scoring, current: { ...current, scores, unsafeParts } } };
    }
    case "LOC_CURRENT_SET_SCORE":
      return state.scoring.current
        ? {
            ...state,
            scoring: {
              ...state.scoring,
              current: {
                ...state.scoring.current,
                scores: { ...state.scoring.current.scores, [action.name]: action.value },
                // Picking OK or N/A clears any unsafe parts (W21).
                unsafeParts: Object.fromEntries(Object.entries(state.scoring.current.unsafeParts ?? {}).filter(([k]) => k !== action.name)),
              },
            },
          }
        : state;
    case "LOC_CURRENT_ADD_PHOTO": {
      if (!state.scoring.current) return state;
      const photos = addPhoto(state.scoring.current.photos, action.name, action.asset);
      return { ...state, scoring: { ...state.scoring, current: { ...state.scoring.current, photos } } };
    }
    case "LOC_CURRENT_REMOVE_PHOTO": {
      if (!state.scoring.current) return state;
      const photos = removePhoto(state.scoring.current.photos, action.name, action.id);
      return { ...state, scoring: { ...state.scoring, current: { ...state.scoring.current, photos } } };
    }
    case "LOC_CURRENT_SET_NOTE":
      return state.scoring.current
        ? {
            ...state,
            scoring: {
              ...state.scoring,
              current: { ...state.scoring.current, notes: { ...state.scoring.current.notes, [action.name]: action.value } },
            },
          }
        : state;
    case "LOC_FINALIZE_CURRENT": {
      const current = state.scoring.current;
      if (!current || !current.type || Object.keys(current.scores).length === 0) {
        // Nothing scored yet at this location — nothing to keep.
        return { ...state, scoring: { ...state.scoring, current: null } };
      }
      const location: SurveyLocation = {
        id: `${current.type}-${Date.now()}`,
        floorLevel: current.floorLevel,
        type: current.type,
        name: current.name,
        classroomGrade: current.classroomGrade,
        classroomSection: current.classroomSection,
        scores: current.scores,
        photos: current.photos,
        notes: current.notes,
        ...(current.unsafeParts && Object.keys(current.unsafeParts).length ? { unsafeParts: current.unsafeParts } : {}),
        ...(current.columnCheck ? { columnCheck: current.columnCheck } : {}),
      };
      return { ...state, scoring: { ...state.scoring, locations: [...state.scoring.locations, location], current: null } };
    }
    case "LOC_DISCARD_CURRENT":
      // The explicit "discard" side of the category page's incomplete-work
      // confirmation — unlike LOC_FINALIZE_CURRENT, this never adds a
      // location: whatever's scored on this unfinished location is dropped
      // entirely, not saved as an "Incomplete" entry to come back to later.
      return { ...state, scoring: { ...state.scoring, current: null } };
    case "LOC_RESUME_LOCATION": {
      // Pulls a previously-finalized location back into `current` for
      // editing — the only way to fix an incomplete location (added
      // alongside Task 3's submit-blocking validation: without this, an
      // incomplete location had no path back to completion and would
      // permanently block submission).
      const location = state.scoring.locations.find((l) => l.id === action.id);
      if (!location) return state;
      const current: CurrentLocation = {
        floorLevel: location.floorLevel,
        type: location.type,
        name: location.name,
        classroomGrade: location.classroomGrade,
        classroomSection: location.classroomSection,
        scores: location.scores,
        photos: location.photos,
        notes: location.notes,
        unsafeParts: location.unsafeParts,
        columnCheck: location.columnCheck,
      };
      return {
        ...state,
        scoring: { locations: state.scoring.locations.filter((l) => l.id !== action.id), current },
      };
    }
    case "LOAD_DRAFT":
      // Wholesale replacement — a draft is a full snapshot (Round 3 Task 9),
      // so there's nothing to merge with whatever's currently live (which
      // should be the freshly-initialized state anyway, since resuming only
      // happens from the dedicated /survey/resume page). Laid over
      // initialState() only so a draft saved before a field existed (e.g.
      // structuralConcern) resumes with that field defaulted instead of
      // undefined — every field a draft does carry still wins.
      return { ...initialState(), ...action.state };
    case "PAUSE_TIMER":
      // No-op if the timer isn't running yet, or is already paused — avoids
      // clobbering an earlier pausedAt (which would lose the time already
      // accrued in the open span) on a duplicate click.
      if (!state.startTime || state.pausedAt) return state;
      return { ...state, pausedAt: new Date().toISOString() };
    case "RESUME_TIMER":
      return resumeNow(state);
    case "DISCARD_PROGRESS":
      // Confirmed navigation back to survey details: clear every response
      // entered in this session and the timer — but not school/respondent
      // details (re-typing names would be bad UX for the same screen
      // they're landing back on), and deliberately *not* `started` either:
      // clearing it here races the locations page's own "!state.started"
      // guard effect, which fires on the same still-mounted page before our
      // router.push("/survey/details") completes and redirects to
      // find-school instead. Leaving it as-is is harmless — startSurvey
      // sets it again the moment they start on that screen.
      //
      // `surveyId` *is* nulled, though (no guard reads it, so no equivalent
      // race) — it's what ACTIVE_SURVEY_STORAGE_KEY's sync effect keys off
      // of, and leaving the old one in place meant a discarded attempt
      // could silently reappear on the next cold start (see
      // survey-context.tsx's ACTIVE_SURVEY_STORAGE_KEY) even though the
      // user explicitly walked away from it. A fresh one is minted the
      // moment they start again (START_SURVEY), same as always.
      return {
        ...state,
        scoring: { locations: [], current: null },
        surveyId: null,
        startTime: null,
        pausedAt: null,
        pausedSeconds: 0,
      };
    case "RESET":
      return initialState();
    default:
      return state;
  }
}

interface SurveyContextValue {
  state: SurveyState;
  setSchool: (school: School) => void;
  startSurvey: () => void;
  setRespondent: (asm: string, apm: string, principal: string) => void;
  setLevels: (levels: FloorLevel[]) => void;
  setPowerSupply: (value: PowerSupply) => void;
  setStructuralConcern: (value: StructuralConcern) => void;
  setBuildingStructure: (value: BuildingStructure) => void;
  setCenterBeam: (value: CenterBeam) => void;
  setTypeOfStructure: (value: TypeOfStructure) => void;
  setDrillingCheck: (value: DrillingCheck) => void;
  setSiteChecks: (value: SiteChecks) => void;
  reviewAddPhoto: (name: string, asset: PhotoAsset) => void;
  reviewRemovePhoto: (name: string, id: string) => void;
  setComplaints: (value: string) => void;
  setLastSurveyId: (surveyId: string | null) => void;
  locSetFloor: (floorLevel: FloorLevel, autoName?: string) => void;
  locSetLocationType: (floorLevel: FloorLevel, locationType: LocationType, autoName?: string) => void;
  locSetLocationName: (name: string) => void;
  locSetClassroom: (floorLevel: FloorLevel, grade: string, section: string) => void;
  locCurrentSetScore: (name: string, value: Condition) => void;
  locCurrentSetUnsafeParts: (name: string, parts: string[]) => void;
  locCurrentSetColumnCheck: (value: ColumnCheck) => void;
  locCurrentAddPhoto: (name: string, asset: PhotoAsset) => void;
  locCurrentRemovePhoto: (name: string, id: string) => void;
  locCurrentSetNote: (name: string, value: string) => void;
  locFinalizeCurrent: () => void;
  locDiscardCurrent: () => void;
  locResumeLocation: (id: string) => void;
  loadDraft: (state: SurveyState) => void;
  discardProgress: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  reset: () => void;
  /**
   * False only for the brief window (one async IndexedDB read, at most)
   * right after mount while a possible auto-resume is being attempted — see
   * ACTIVE_SURVEY_STORAGE_KEY. Every page whose own guard effect would
   * otherwise redirect away for "no school/not started" (or, on the locations
   * category page, "no current location") must wait for this to become
   * true first, or it'll win the race and redirect before the resume had a
   * chance to load anything.
   */
  hydrated: boolean;
}

const SurveyContext = createContext<SurveyContextValue | null>(null);

export function SurveyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);

  // Attempt the auto-resume described on ACTIVE_SURVEY_STORAGE_KEY, once,
  // on mount. Runs even when there's no pointer (nothing to resume) — the
  // point isn't just the resume itself, it's that every guarded page needs
  // to know this attempt has *finished* (see `hydrated`) before trusting
  // "no school/not started" to mean "no survey," rather than "haven't checked
  // yet."
  useEffect(() => {
    let cancelled = false;
    const id = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SURVEY_STORAGE_KEY) : null;
    if (!id) {
      // No survey has started yet (no surveyId minted) — the only thing
      // that could still be sitting in memory from before a forced reload
      // is a school picked on find-school but not yet followed by a start
      // choice. See PENDING_SCHOOL_STORAGE_KEY for why this needs its own
      // recovery path separate from the draft/surveyId one below.
      const pending = typeof window !== "undefined" ? localStorage.getItem(PENDING_SCHOOL_STORAGE_KEY) : null;
      if (pending) {
        try {
          dispatch({ type: "SET_SCHOOL", school: JSON.parse(pending) });
        } catch {
          localStorage.removeItem(PENDING_SCHOOL_STORAGE_KEY);
        }
      }
      setHydrated(true);
      return;
    }
    getDraft(id)
      .then((draft) => {
        if (cancelled) return;
        if (draft) dispatch({ type: "LOAD_DRAFT", state: draft.state });
      })
      .catch(() => {
        // IndexedDB unavailable, or something malformed — fall through to
        // the normal "nothing to resume" guards rather than getting stuck.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately mount-only — this is a one-time recovery attempt, not a
    // live subscription to localStorage.
     
  }, []);

  // Keeps the pointer current with whichever survey is actually live in
  // memory right now — set the moment one starts (START_SURVEY) or resumes
  // (LOAD_DRAFT), cleared the moment one ends (submitted — see
  // review.tsx's clearDraft/reset chain — or discarded/reset).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.surveyId) localStorage.setItem(ACTIVE_SURVEY_STORAGE_KEY, state.surveyId);
    else localStorage.removeItem(ACTIVE_SURVEY_STORAGE_KEY);
  }, [state.surveyId]);

  // See PENDING_SCHOOL_STORAGE_KEY — self-cleaning: cleared automatically
  // once RESET nulls school back out (submit success, or discard-all-the-
  // way-back), no separate cleanup call needed anywhere else.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.school) localStorage.setItem(PENDING_SCHOOL_STORAGE_KEY, JSON.stringify(state.school));
    else localStorage.removeItem(PENDING_SCHOOL_STORAGE_KEY);
  }, [state.school]);

  const value = useMemo<SurveyContextValue>(
    () => ({
      state,
      hydrated,
      setSchool: (school) => dispatch({ type: "SET_SCHOOL", school }),
      startSurvey: () => dispatch({ type: "START_SURVEY" }),
      setRespondent: (asm, apm, principal) => dispatch({ type: "SET_RESPONDENT", asm, apm, principal }),
      setLevels: (levels) => dispatch({ type: "SET_LEVELS", levels }),
      setPowerSupply: (value) => dispatch({ type: "SET_POWER_SUPPLY", value }),
      setStructuralConcern: (value) => dispatch({ type: "SET_STRUCTURAL_CONCERN", value }),
      setBuildingStructure: (value) => dispatch({ type: "SET_BUILDING_STRUCTURE", value }),
      setCenterBeam: (value) => dispatch({ type: "SET_CENTER_BEAM", value }),
      setTypeOfStructure: (value) => dispatch({ type: "SET_TYPE_OF_STRUCTURE", value }),
      setDrillingCheck: (value) => dispatch({ type: "SET_DRILLING_CHECK", value }),
      setSiteChecks: (value) => dispatch({ type: "SET_SITE_CHECKS", value }),
      reviewAddPhoto: (name, asset) => dispatch({ type: "REVIEW_ADD_PHOTO", name, asset }),
      reviewRemovePhoto: (name, id) => dispatch({ type: "REVIEW_REMOVE_PHOTO", name, id }),
      setComplaints: (value) => dispatch({ type: "SET_COMPLAINTS", value }),
      setLastSurveyId: (surveyId) => dispatch({ type: "SET_LAST_SURVEY_ID", surveyId }),
      locSetFloor: (floorLevel, autoName) => dispatch({ type: "LOC_SET_FLOOR", floorLevel, autoName }),
      locSetLocationType: (floorLevel, locationType, autoName) =>
        dispatch({ type: "LOC_SET_LOCATION_TYPE", floorLevel, locationType, autoName }),
      locSetLocationName: (name) => dispatch({ type: "LOC_SET_LOCATION_NAME", name }),
      locSetClassroom: (floorLevel, grade, section) => dispatch({ type: "LOC_SET_CLASSROOM", floorLevel, grade, section }),
      locCurrentSetScore: (name, value) => dispatch({ type: "LOC_CURRENT_SET_SCORE", name, value }),
      locCurrentSetUnsafeParts: (name, parts) => dispatch({ type: "LOC_CURRENT_SET_UNSAFE_PARTS", name, parts }),
      locCurrentSetColumnCheck: (value) => dispatch({ type: "LOC_CURRENT_SET_COLUMN_CHECK", value }),
      locCurrentAddPhoto: (name, asset) => dispatch({ type: "LOC_CURRENT_ADD_PHOTO", name, asset }),
      locCurrentRemovePhoto: (name, id) => dispatch({ type: "LOC_CURRENT_REMOVE_PHOTO", name, id }),
      locCurrentSetNote: (name, value) => dispatch({ type: "LOC_CURRENT_SET_NOTE", name, value }),
      locFinalizeCurrent: () => dispatch({ type: "LOC_FINALIZE_CURRENT" }),
      locDiscardCurrent: () => dispatch({ type: "LOC_DISCARD_CURRENT" }),
      locResumeLocation: (id) => dispatch({ type: "LOC_RESUME_LOCATION", id }),
      loadDraft: (draftState) => dispatch({ type: "LOAD_DRAFT", state: draftState }),
      discardProgress: () => dispatch({ type: "DISCARD_PROGRESS" }),
      pauseTimer: () => dispatch({ type: "PAUSE_TIMER" }),
      resumeTimer: () => dispatch({ type: "RESUME_TIMER" }),
      reset: () => dispatch({ type: "RESET" }),
    }),
    [state, hydrated]
  );

  return <SurveyContext.Provider value={value}>{children}</SurveyContext.Provider>;
}

export function useSurvey() {
  const ctx = useContext(SurveyContext);
  if (!ctx) throw new Error("useSurvey must be used within SurveyProvider");
  return ctx;
}
