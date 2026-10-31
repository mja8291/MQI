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
  | "Hybrid (Load-Bearing+RCC)"
  | "Unknown";

export type CenterBeam = "YES" | "NO" | "Somewhere present, somewhere absent" | "N/A";

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
  /** v2 (W35): YES / NO; older surveys answered Ok / Unsafe. */
  pointMarked: "YES" | "NO" | "Ok" | "Unsafe" | "";
  /** The slide's "Slab thickness recorded" Ok / Unsafe — whether the measured thickness is acceptable. Absent on a draft saved before it existed. */
  slabAssessment?: "Ok" | "Unsafe" | "";
  /** v2 (W45): the first reading, total depth of slab + roof screed/waterproofing. Absent on surveys from before it existed. */
  totalDepthMm?: string;
  slabThicknessMm: string;
  screedThicknessMm: string;
  holeRepaired: "YES" | "NO" | "";
  /** v2 (W36): holes drilled after the first one, each with its own readings. */
  extraHoles?: DrillHole[];
}

/** One additional drill hole and its readings (v2, W36). */
export interface DrillHole {
  /** v2 (W45): total depth of slab + roof screed/waterproofing. */
  totalDepthMm?: string;
  slabThicknessMm: string;
  screedThicknessMm: string;
  slabAssessment: "Ok" | "Unsafe" | "";
}

/** "Hole 2: slab 120 mm, screed 40 mm, Ok; Hole 3: …" — the sheet text for additional holes. */
export function drillHolesText(holes: readonly DrillHole[] | undefined): string {
  return (holes ?? [])
    .map((h, i) => `Hole ${i + 2}: ${h.totalDepthMm?.trim() ? `total depth ${h.totalDepthMm.trim()} mm, ` : ""}slab ${h.slabThicknessMm.trim()} mm, screed ${h.screedThicknessMm.trim()} mm${h.slabAssessment ? `, ${h.slabAssessment}` : ""}`)
    .join("; ");
}

export function emptyDrillingCheck(): DrillingCheck {
  return {
    done: "",
    pointMarked: "",
    slabAssessment: "",
    totalDepthMm: "",
    slabThicknessMm: "",
    screedThicknessMm: "",
    holeRepaired: "",
  };
}

/** v2 (W45): a screed this thick or more marks "Roof Screeding/roof drainage" Unsafe (the surveyor can change it back). */
export const SCREED_UNSAFE_MM = 110;
export const SCREED_ITEM = "Roof Screeding/roof drainage";

/** The thickest screed reading across every drill hole, or 0 when none is a number. */
export function maxScreedMm(c: DrillingCheck): number {
  const values = [c.screedThicknessMm, ...(c.extraHoles ?? []).map((h) => h.screedThicknessMm)].map(Number).filter((n) => Number.isFinite(n));
  return values.length ? Math.max(0, ...values) : 0;
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
    positive(c.screedThicknessMm) &&
    // W45: total depth is required wherever the field exists (surveys sent by older app versions don't have it).
    (c.totalDepthMm === undefined || positive(c.totalDepthMm)) &&
    // W36: every additional hole needs both readings and its assessment.
    (c.extraHoles ?? []).every(
      (h) => positive(h.slabThicknessMm) && positive(h.screedThicknessMm) && Boolean(h.slabAssessment) && (h.totalDepthMm === undefined || positive(h.totalDepthMm)),
    )
  );
}

export type RoofAccessType = "Proper staircase" | "Ladder" | "None" | "N/A";
export type OverflowDisposal = "Provided" | "Not provided";

/**
 * The "Structural Checks Recorded Alongside Condition" questions from the
 * TCF Engineering slide that aren't already covered by their own field
 * (Type of Structure, Center Beam, and the drilling check have theirs):
 * roof access type, roof & drainage, and building and area features (risk factors).
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
  /**
   * v2 (W21): the item's Unsafe is split into parts that can be picked together, e.g. Column and
   * Wall. Any part scores as the item's Unsafe; the sheet shows "Column Unsafe, Wall Unsafe".
   */
  unsafeParts?: string[];
  /** v2 (W20): name shown on screen when it differs from the column name, e.g. "Window Shades (Chajja)". */
  label?: string;
  /** v2 (W44): name shown on screen for particular location types; the column stays the same. */
  locationLabels?: Partial<Record<LocationType, string>>;
  /** v2 (W12): an instruction shown under the item name, e.g. how to test it on site. */
  guidance?: string;
  /** Drops N/A from the picker entirely — for an item where "not applicable" never makes sense (e.g. "Access to roof area /tanks": you're standing at the roof access, so it's either there or it isn't). */
  hideNA?: boolean;
}

export interface RubricGroup extends RubricItem {
  /** Safety items aggregate by worst-case (minimum); Functionality/Aesthetics aggregate by average. */
  aggregation: "worst" | "average";
  /** Which location types this item group is scored at. */
  locations: LocationType[];
}

/** The item name shown on screen at this location type (W44), else its label or name. */
export function itemLabel(item: Pick<RubricItem, "name" | "label" | "locationLabels">, type?: LocationType): string {
  return (type && item.locationLabels?.[type]) || item.label || item.name;
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
  /** v2 (W21): which parts were marked unsafe, for items with RubricItem.unsafeParts (e.g. ["Column", "Wall"]). */
  unsafeParts?: Record<string, string[]>;
  /** v2 (W41): follow-up when a column is marked unsafe. */
  columnCheck?: ColumnCheck;
}

/**
 * v2 (W41): asked when Wall/Column is marked "Column Unsafe": a crack wider than 3 mm calls for a
 * Schmidt Hammer test on the exposed concrete; if a hammer is available, its reading and a photo
 * of the hammer showing it.
 */
export interface ColumnCheck {
  crackOver3mm: "YES" | "NO" | "";
  hammerAvailable: "YES" | "NO" | "";
  /** Rebound number as typed. */
  reading: string;
}

export const COLUMN_ITEM = "Wall/Column Condition i.e. cracks";
/** Photo key (in the location's photos) for the Schmidt Hammer test photo. */
export const SCHMIDT_PHOTO = "Schmidt Hammer Test";

export function emptyColumnCheck(): ColumnCheck {
  return { crackOver3mm: "", hammerAvailable: "", reading: "" };
}

/** True when this location has Column Unsafe, i.e. the follow-up applies. */
export function columnCheckApplies(loc: { unsafeParts?: Record<string, string[]> }): boolean {
  return Boolean(loc.unsafeParts?.[COLUMN_ITEM]?.includes("Column"));
}

/** What is still missing in the follow-up (empty = complete or not applicable). */
export function columnCheckIssues(loc: {
  unsafeParts?: Record<string, string[]>;
  columnCheck?: ColumnCheck;
  photos: Record<string, readonly unknown[]>;
}): string[] {
  if (!columnCheckApplies(loc)) return [];
  const c = loc.columnCheck ?? emptyColumnCheck();
  const issues: string[] = [];
  if (!c.crackOver3mm) issues.push("Answer whether the column crack is wider than 3 mm.");
  else if (c.crackOver3mm === "YES") {
    if (!c.hammerAvailable) issues.push("Answer whether a Schmidt Hammer is available.");
    else if (c.hammerAvailable === "YES") {
      const n = Number(c.reading);
      if (!c.reading.trim() || !Number.isFinite(n) || n <= 0) issues.push("Enter the Schmidt Hammer reading (a positive number).");
      if (!loc.photos[SCHMIDT_PHOTO]?.length) issues.push("Attach a photo of the Schmidt Hammer test with the reading visible.");
    }
  }
  return issues;
}

export interface School {
  schoolId: string;
  name: string;
  region: string;
  area: string;
  /** v2 campus details for Find school (school list only; never written to the response tabs). */
  town?: string;
  city?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  /** eCompound No from Schools_Standardized, e.g. "GP/13/16"; campuses sharing it are siblings. */
  eCompoundNo?: string;
  /** Name from the E-Compound Spreadsheet, e.g. "102 RB Budha Chak (N/124/12)". */
  eCompoundName?: string;
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

/** v2 (W41): one location's Column Unsafe follow-up as text, e.g. "KG A: crack > 3 mm, Schmidt Hammer 32". */
export function columnCheckLine(name: string, crackOver3mm: string, hammerAvailable: string, reading: string): string {
  if (!crackOver3mm) return "";
  if (crackOver3mm !== "YES") return `${name}: crack up to 3 mm`;
  if (hammerAvailable === "YES") return `${name}: crack > 3 mm, Schmidt Hammer ${reading.trim()}`;
  return `${name}: crack > 3 mm, no Schmidt Hammer available`;
}
