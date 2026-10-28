export type Category = "Functionality" | "Safety" | "Aesthetics";

export type Condition = "Good" | "Ok" | "Poor" | "Very Poor" | "N/A";

export type PowerSupply =
  | "Grid (Wapda/K.E/LESCO etc.)"
  | "Solar"
  | "Hybrid (Both Grid & Solar)"
  | "No Power"
  | "Other";

export type StructuralConcern = "YES" | "NO";

export type BuildingStructure =
  | "Load-Bearing"
  | "RCC"
  | "Precast"
  | "Hybrid (RCC+Precast)"
  | "Hybrid (Load-Bearing+RCC)";

export type CenterBeam = "YES" | "NO" | "N/A";

export type TypeOfStructure = "RCC (Frame)" | "Load-bearing" | "Hybrid" | "N/A";

/**
 * The slab / roof-screeding drilling check from the rubric workbook's
 * "Safety Related" tab (items 18-19, "Drilling & Observation"), plus roof
 * screeding thickness. Recorded on the last page only — it doesn't feed any
 * score. Everything after `done` only applies when done === "YES". The
 * thicknesses are kept as the text typed (validated as positive numbers at
 * submit) so a half-typed value survives a draft save.
 */
export interface DrillingCheck {
  done: "YES" | "NO" | "";
  pointMarked: "Ok" | "Unsafe" | "";
  /** The slide's "Slab thickness recorded" Ok / Unsafe — whether the measured thickness is acceptable. Absent on a draft saved before it existed. */
  slabAssessment?: "Ok" | "Unsafe" | "";
  slabThicknessMm: string;
  screedThicknessMm: string;
  holeRepaired: "YES" | "NO" | "";
}

export function emptyDrillingCheck(): DrillingCheck {
  return {
    done: "",
    pointMarked: "",
    slabAssessment: "",
    slabThicknessMm: "",
    screedThicknessMm: "",
    holeRepaired: "",
  };
}

/** True when the check is answered: "NO", or "YES" with every detail filled in and both thicknesses positive numbers. */
export function isDrillingCheckComplete(c: DrillingCheck): boolean {
  if (c.done === "NO") return true;
  if (c.done !== "YES") return false;
  const positive = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
  return (
    Boolean(c.pointMarked) &&
    Boolean(c.slabAssessment) &&
    Boolean(c.holeRepaired) &&
    positive(c.slabThicknessMm) &&
    positive(c.screedThicknessMm)
  );
}

export type RoofAccessType = "Proper staircase" | "Ladder" | "None" | "N/A";
export type OverflowDisposal = "Provided" | "Not provided";

/**
 * The "Structural Checks Recorded Alongside Condition" questions from the
 * TCF Engineering slide that aren't already covered by their own field
 * (Type of Structure, Center Beam, and the drilling check have theirs):
 * roof access type, roof & drainage, and building-proximity risk factors.
 * Recorded on the last page only — none of it feeds a score. "No" on the two
 * roof-cleanliness questions needs a photo (see isSiteChecksComplete).
 */
export interface SiteChecks {
  roofAccessType: RoofAccessType | "";
  overflowDisposal: OverflowDisposal | "";
  roofClean: "Yes" | "No" | "";
  rainSpoutsClear: "Yes" | "No" | "";
  /** Any of RISK_FACTOR_OPTIONS (content.ts) — "mark any that apply", so empty is a valid answer. */
  riskFactors: string[];
  /** Free text, only meaningful when "Any other" is among riskFactors. */
  riskFactorOther: string;
}

export function emptySiteChecks(): SiteChecks {
  return { roofAccessType: "", overflowDisposal: "", roofClean: "", rainSpoutsClear: "", riskFactors: [], riskFactorOther: "" };
}

/** Photo-bearing questions on the last page, keyed by the question text used as the photo's item name (Drive path + attachments row). */
export const SITE_PHOTO_ROOF_CLEAN = "Roof clean of dirt and vegetation";
export const SITE_PHOTO_RAIN_SPOUTS = "Rain spouts clear";
export const SITE_PHOTO_DRILLING_POINT = "Drilling point marked on slab by APM";
export const SITE_PHOTO_SLAB_THICKNESS = "Slab thickness recorded (mm)";

/**
 * Every answer given, and a photo attached wherever the slide says "No — take
 * picture". A photo that failed to upload still counts: it's queued with the
 * submission (see PendingPhotoUpload), same as every other photo in the app.
 */
export function isSiteChecksComplete(s: SiteChecks, photos: Record<string, readonly unknown[]>): boolean {
  if (!s.roofAccessType || !s.overflowDisposal || !s.roofClean || !s.rainSpoutsClear) return false;
  if (s.roofClean === "No" && (photos[SITE_PHOTO_ROOF_CLEAN]?.length ?? 0) === 0) return false;
  if (s.rainSpoutsClear === "No" && (photos[SITE_PHOTO_RAIN_SPOUTS]?.length ?? 0) === 0) return false;
  return true;
}

export interface RubricItem {
  /** Canonical item name — used as the key in scores/photos/notes maps and as the Sheets column/attachment key. */
  name: string;
  category: Category;
  /** Weight within its category, as a percentage (category's weights sum to 100). */
  weight: number;
  /** Maintained by School Principal/Area Office rather than Engineering/R&M. Display-only marker. */
  principalMaintained?: boolean;
  /**
   * Restricts the item's picker to a subset of Condition values with custom
   * display text, for items whose rubric sheet defines fewer than the usual
   * 4 condition states. E.g. "Access to roof area /tanks" only offers two
   * states in the rubric ("Roof Access Available" / "Roof Access Not
   * Available"), mapped onto the existing Ok/Poor slots — same
   * CONDITION_SCORE values and 0-100% scale as every other item, just a
   * narrower, relabeled set of buttons. N/A remains selectable regardless.
   */
  conditionOverride?: { condition: Exclude<Condition, "N/A">; label: string }[];
  /** Drops N/A from the picker entirely — for an item where "not applicable" never makes sense (e.g. "Access to roof area /tanks": you're standing at the roof access, so it's either there or it isn't). */
  hideNA?: boolean;
}

export interface RubricGroup extends RubricItem {
  /** Safety items aggregate by worst-case (minimum); Functionality/Aesthetics aggregate by average. */
  aggregation: "worst" | "average";
  /** Which location types this item group is scored at. */
  locations: LocationType[];
}

export type LocationType =
  | "Classroom"
  | "Corridor & Stairs"
  | "Toilet"
  | "Exterior Facade"
  | "External Development"
  | "Roof"
  | "Other Room (Staff, Principal, Admin, Store etc.)"
  | "Lab (Wet/Dry/DLP)";

/** The first pick — which floor the location being scored is on. */
export type FloorLevel = "External" | "Ground" | "First" | "Second" | "Third" | "Fourth" | "Roof";

export interface ItemState {
  scores: Record<string, Condition>;
  photos: Record<string, string>;
  notes: Record<string, string>;
}

export function emptyItemState(): ItemState {
  return { scores: {}, photos: {}, notes: {} };
}

/**
 * v2: a photo is referred to by its attachment id. The bytes stay in the
 * phone's IndexedDB until uploaded (apps/web/src/files), so shared code never
 * touches a browser File.
 */
export type PhotoRef = string;

export interface SurveyLocation {
  id: string;
  floorLevel: FloorLevel;
  type: LocationType;
  name: string;
  /** Only set for Classroom locations — also queryable as their own columns in the response sheet. */
  classroomGrade?: string;
  classroomSection?: string;
  scores: Record<string, Condition>;
  /** Multiple photos per item are allowed; each is an attachment id (see PhotoRef). */
  photos: Record<string, readonly unknown[]>;
  notes: Record<string, string>;
}

export interface School {
  schoolId: string;
  name: string;
  region: string;
  area: string;
}

export interface RespondentDetails {
  asm: string;
  apm: string;
  principal: string;
}

export interface CategoryScoreResult {
  category: Category;
  score: number | null;
  answeredWeight: number;
  totalWeight: number;
}

export interface ScoreResult {
  overall: number | null;
  /** Engineering Department's responsibility -- items without "*" in their name, renormalized to their own 100%. */
  major: number | null;
  /** School staff's own routine-maintenance responsibility -- items with "*" in their name, renormalized to their own 100%. */
  minor: number | null;
  categories: Record<Category, CategoryScoreResult>;
  /** Fixed 7-item watchlist (see scoring.ts CRITICAL_ITEMS), individual/unaggregated. */
  criticalItems: Record<string, number | null>;
}

export type RatingBand = "Poor" | "Average" | "Good" | "Excellent";

export interface SurveySubmission {
  surveyId: string;
  school: School;
  asm: string;
  apm: string;
  principal: string;
  powerSupply: PowerSupply;
  complaints: string;
  submittedAt: string;
  overall: number | null;
  functionality: number | null;
  safety: number | null;
  aesthetics: number | null;
  ratingBand: RatingBand | null;
  scores: Record<string, Condition>;
  locations?: SurveyLocation[];
  attachments: { itemName: string; locationName: string; photoUrl?: string; note?: string }[];
}
