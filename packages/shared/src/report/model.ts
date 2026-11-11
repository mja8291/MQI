import type { FoundSurvey } from "../api";
import { RISK_FACTOR_OPTIONS, RISK_FACTOR_OTHER } from "../rubric/content";
import { withDerivedScores } from "../rubric/derived";
import { FLOOR_LEVELS, LOCATION_TYPES, OVERFLOW_ITEM, RUBRIC_GROUPS, RUBRIC_SECTIONS, SLAB_ASSESSMENT_ITEM, cellCondition } from "../rubric/items";
import { RUBRIC_VERSION } from "../rubric/rubric-version";
import { rubricGroupsFor } from "../rubric/versions";
import { CATEGORY_WEIGHT, CONDITION_SCORE, aggregateLocations, groupConditionScore, ratingBand, scoreItemSet } from "../scoring";
import {
  COLUMN_ITEM,
  SITE_PHOTO_RAIN_SPOUTS,
  SITE_PHOTO_ROOF_CLEAN,
  itemLabel,
  type Category,
  type ColumnCheck,
  type Condition,
  type DrillingCheck,
  type LocationType,
  type RatingBand,
  type RubricGroup,
  type SiteChecks,
} from "../types";
import { REPORT_THRESHOLDS, REPORT_TOP_LOSSES, REPORT_TOP_STRENGTHS, UNSAFE_SOLID_EXCEPTIONS } from "./config";

/**
 * MQI PDF report (W66): one plain object holding everything the report shows. The renderer
 * (apps/web/src/lib/export/report-pdf.ts) only draws it. The model is built the same way from
 * a submitted survey (reportSourceFromFound) and from a draft on the phone (the offline
 * "Download PDF" fallback), and always scores with the current rubric (RUBRIC_VERSION), as the
 * rubric owner decided on 2026-11-10; a survey submitted under an older rubric is re-scored and
 * the data-quality flags say so.
 */

// ---------- input ----------

export interface ReportLocationInput {
  floorLevel: string;
  type: string;
  name: string;
  scores: Record<string, Condition>;
  /** Parts marked unsafe (e.g. Wall/Column → ["Column"]). */
  unsafeParts?: Record<string, string[]>;
  columnCheck?: ColumnCheck;
}

export interface ReportPhotoInput {
  /** Attachment id; the renderer loads the bytes. */
  id: string;
  itemName: string;
  /** "" for photos of the last page's questions (roof cleanliness, drilling point …). */
  locationName: string;
}

export interface ReportSource {
  surveyId: string;
  campusName: string;
  region: string;
  area: string;
  /** ISO timestamp, or a label such as "Not yet submitted (draft export)". */
  submittedAt: string;
  startTime: string;
  endTime: string;
  timeTakenSeconds: number | null;
  apm: string;
  asm: string;
  principal: string;
  powerSupply: string;
  structuralConcern: string;
  buildingStructure: string;
  typeOfStructure: string;
  centerBeam: string;
  drillingCheck: DrillingCheck;
  siteChecks: SiteChecks;
  complaints: string;
  /** Survey Purpose ("Actual assessment" / "Checking/Training"); "" when not recorded. */
  purpose: string;
  /** The rubric the survey was submitted under ("" = before 2026-10-27). */
  submittedRubricVersion: string;
  /** The scores stored with the survey (sheet), to show when re-scoring changed them. */
  storedScores?: { overall: number | null; functionality: number | null; safety: number | null; aesthetics: number | null };
  draft: boolean;
  locations: ReportLocationInput[];
  photos: ReportPhotoInput[];
}

// ---------- output ----------

export type GroupStatus = "scored" | "na" | "unrecorded" | "notAssessed";

export interface ReportGroup {
  name: string;
  /** Display name (Window Shades (Chajja) …). */
  label: string;
  category: Category;
  /** Weight within its category, %. */
  weight: number;
  aggregation: "worst" | "average";
  binary: boolean;
  /** Aggregated score 0–100; null when not scored. */
  score: number | null;
  status: GroupStatus;
  /** Why a group without a score has none. */
  statusNote: string;
  /** "Unsafe"/"OK", "Not available", "No" … for binary groups; the band for the rest; "N/A" otherwise. */
  ratingLabel: string;
  band: RatingBand | null;
  /** A binary group at its Unsafe answer. */
  unsafe: boolean;
  /** Unsafe, but its line-graph segments stay solid (UNSAFE_SOLID_EXCEPTIONS). */
  solidWhenUnsafe: boolean;
  /** Points of the overall score lost on this group (all groups' losses add up to 100 − overall). */
  pointsLost: number;
  /** W68: a "*" item group — minor, maintained by the school itself (rubric principalMaintained). */
  minor: boolean;
}

/** W68: how one rating of a minor item reads in the report (worst first). */
export type MinorLevel = "veryPoor" | "poor" | "ok" | "good" | "na" | "unrecorded";
export interface ReportMinor {
  /** Major (Engineering) and minor (school) scores, same formula restricted to each set. */
  major: { score: number | null; band: RatingBand | null };
  minor: { score: number | null; band: RatingBand | null };
  /** Every minor group with its campus score and how many locations got each rating. */
  groups: { name: string; label: string; category: Category; weight: number; score: number | null; band: RatingBand | null; counts: Record<MinorLevel, number> }[];
  /** Every location that has minor items, with each item's rating. */
  byLocation: { label: string; score: number | null; items: { label: string; rating: string; level: MinorLevel }[] }[];
  /** Ratings of Poor or worse across all locations. */
  shortcomings: number;
}

/** W68: the legacy "ACM individual form" table — one row per item group, per division. */
export interface QuestionnaireRow {
  division: Category;
  sno: number;
  label: string;
  minor: boolean;
  /** The campus rating ticked: the condition nearest the combined score; null when not scored. */
  tick: Exclude<Condition, "N/A"> | null;
  score: number | null;
  /** Division (category) weight, %. */
  divisionWeight: number;
  /** Weight within the division, %. */
  groupWeight: number;
  /** Division weight × group weight, % of the whole. */
  cumulative: number;
  /** Cumulative weight × score; null when not scored. */
  scored: number | null;
}
export interface ReportQuestionnaire {
  rows: QuestionnaireRow[];
  divisions: { division: Category; weight: number; score: number | null; contribution: number | null }[];
  total: number | null;
}

export type CellKind = "condition" | "binaryOk" | "binaryUnsafe" | "na" | "unrecorded" | "blank";
export interface ReportCell {
  kind: CellKind;
  condition?: Exclude<Condition, "N/A">;
  /** Full answer, e.g. "Very Poor", "Unsafe (Column)". */
  text: string;
}

export interface ReportColumn {
  key: string;
  floor: string;
  type: string;
  /** Short type name ("Other Room", "Lab"). */
  typeLabel: string;
  name: string;
  /** "Ground · Classroom — KG A". */
  label: string;
  /** The location's weighted score (same formula as the campus score, this location only). */
  score: number | null;
  band: RatingBand | null;
}

export interface ReportMatrix {
  columns: ReportColumn[];
  /** In rubric order (Safety, Functionality, Aesthetics); cells follow `columns`. */
  rows: { group: string; cells: ReportCell[] }[];
}

export interface DrillHoleView {
  label: string;
  slabMm: number | null;
  screedMm: number | null;
  totalMm: number | null;
  /** False when the total wasn't typed and is slab + screed. */
  totalMeasured: boolean;
  assessment: string;
  totalWithinLimit: boolean | null;
  screedWithinLimit: boolean | null;
}

export interface ReportStructural {
  building: { label: string; value: string }[];
  drilling: { done: string; pointMarked: string; holeRepaired: string; unitTyped: string; holes: DrillHoleView[] };
  columns: { location: string; parts: string; crackOver3mm: string; hammerAvailable: string; reading: string; highlight: boolean }[];
  roof: { label: string; value: string; bad: boolean; photo: boolean }[];
  risks: { label: string; selected: boolean }[];
  riskOther: string;
}

export interface ReportPhoto {
  id: string;
  caption: string;
  locationName: string;
  itemName: string;
  /** 0 Unsafe, 1 Very Poor, 2 Poor, 3 other ratings, 4 last-page questions. */
  severity: number;
}

export interface ReportModel {
  rubricVersion: string;
  submittedRubricVersion: string;
  header: {
    campusName: string;
    regionArea: string;
    surveyId: string;
    date: string;
    method: string;
    staff: string;
    asm: string;
    principal: string;
    start: string;
    finish: string;
    timeTaken: string;
    itemsCovered: string;
    draft: boolean;
  };
  alerts: string[];
  overall: { score: number | null; band: RatingBand | null };
  categories: { category: Category; weight: number; score: number | null; band: RatingBand | null }[];
  narrative: string[];
  groups: ReportGroup[];
  losses: { name: string; label: string; category: Category; pointsLost: number }[];
  strengths: { label: string; category: Category; weight: number }[];
  notAssessed: { label: string; note: string }[];
  matrix: ReportMatrix;
  structural: ReportStructural;
  photos: ReportPhoto[];
  complaints: string;
  flags: string[];
  /** W68: major vs minor ("*", school-maintained) items. */
  minor: ReportMinor;
  /** W68: the legacy-format questionnaire and scoring table. */
  questionnaire: ReportQuestionnaire;
}

// ---------- helpers ----------

const pct = (n: number) => `${Math.round(n)}%`;
const SHORT_TYPE: Partial<Record<string, string>> = {
  "Other Room (Staff, Principal, Admin, Store etc.)": "Other Room",
  "Lab (Wet/Dry/DLP)": "Lab",
};
const shortType = (t: string) => SHORT_TYPE[t] ?? t;
/** Shorter names for alert lines. */
const ALERT_NAME: Record<string, string> = {
  "Ceiling Condition i.e. cracks & seepage": "Ceiling cracks/seepage",
  [COLUMN_ITEM]: "Wall/Column cracks",
  "Roof Screeding/roof drainage": "Roof screeding/drainage",
  [SLAB_ASSESSMENT_ITEM]: "Slab + Screeding/Waterproofing thickness",
};

const isBinary = (g: Pick<RubricGroup, "conditionOverride">) => (g.conditionOverride?.length ?? 0) === 2;
/** The label of a binary group's answer ("OK", "Unsafe", "Roof Access Not Available" …), shortened for print. */
function binaryLabel(g: RubricGroup, c: Condition): string {
  const label = g.conditionOverride?.find((o) => o.condition === c)?.label ?? c;
  return label.replace(/^Roof Access /, "").replace("Not Available", "Not available");
}

/** W68: a rating as the surveyor saw it ("Ladder" for Access to roof area), else the rating itself. */
export function optionLabel(g: Pick<RubricGroup, "conditionOverride">, c: Condition): string {
  return g.conditionOverride?.find((o) => o.condition === c)?.label ?? c;
}

function num(text: string | undefined): number | null {
  if (text == null || text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function localTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function duration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function locationPlace(loc: { name: string; floorLevel: string }): string {
  return loc.floorLevel === "External" || loc.floorLevel === "Roof" ? loc.name : `${loc.name} (${loc.floorLevel})`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------- the model ----------

export function buildReportModel(src: ReportSource): ReportModel {
  const groups = RUBRIC_GROUPS;
  // Derived items (slab assessment, overflow) are written onto every Roof location, as at submission.
  const locations = withDerivedScores(
    src.locations.map((l) => ({ ...l, type: l.type as LocationType })),
    src.drillingCheck,
    src.siteChecks,
  );
  const aggregated = aggregateLocations(locations as never, groups);
  const result = scoreItemSet(groups, (g) => aggregated[g.name]);

  // Effective weights of the scored groups, for points lost (they add up to 100 − overall).
  const effective = (g: RubricGroup) => CATEGORY_WEIGHT[g.category] * g.weight;
  const scoredWeight = groups.reduce((s, g) => (aggregated[g.name] === undefined ? s : s + effective(g)), 0);

  const reportGroups: ReportGroup[] = RUBRIC_SECTIONS.flatMap((cat) => groups.filter((g) => g.category === cat)).map((g) => {
    const score = aggregated[g.name] ?? null;
    const applicable = locations.filter((l) => g.locations.includes(l.type));
    let status: GroupStatus = "scored";
    let statusNote = "";
    if (score === null) {
      if (applicable.some((l) => l.scores[g.name] === "N/A")) {
        status = "na";
        statusNote = "Rated N/A";
      } else if (g.derived) {
        status = "notAssessed";
        statusNote = g.name === SLAB_ASSESSMENT_ITEM ? "No drilling check" : "Not answered";
      } else if (applicable.length) {
        status = "unrecorded";
        statusNote = "Applicable but not recorded";
      } else {
        status = "notAssessed";
        statusNote = `No ${joinList([...new Set(g.locations.map(shortType))].slice(0, 3))} location recorded`;
      }
    }
    const binary = isBinary(g);
    const unsafe = binary && score !== null && score <= CONDITION_SCORE["Very Poor"];
    return {
      name: g.name,
      label: itemLabel(g),
      category: g.category,
      weight: g.weight,
      aggregation: g.aggregation,
      binary,
      score,
      status,
      statusNote,
      ratingLabel: score === null ? "N/A" : binary ? binaryLabel(g, score >= 100 ? "Good" : "Very Poor") : (ratingBand(score) ?? ""),
      band: ratingBand(score),
      unsafe,
      solidWhenUnsafe: UNSAFE_SOLID_EXCEPTIONS.includes(g.name),
      pointsLost: score === null || scoredWeight === 0 ? 0 : (effective(g) / scoredWeight) * (100 - score),
      minor: Boolean(g.principalMaintained),
    };
  });

  // ---- matrix ----
  const floorIndex = (f: string) => {
    const i = FLOOR_LEVELS.indexOf(f as never);
    return i < 0 ? 99 : i;
  };
  const typeIndex = (t: string) => {
    const i = LOCATION_TYPES.indexOf(t as LocationType);
    return i < 0 ? 99 : i;
  };
  const ordered = locations
    .map((l, i) => ({ l, i }))
    .sort((a, b) => floorIndex(a.l.floorLevel) - floorIndex(b.l.floorLevel) || typeIndex(a.l.type) - typeIndex(b.l.type) || naturalCompare(a.l.name, b.l.name))
    .map(({ l }) => l);
  const columns: ReportColumn[] = ordered.map((l, i) => {
    const here = new Set(groups.filter((g) => g.locations.includes(l.type)).map((g) => g.name));
    const score = scoreItemSet(groups, (g) => (here.has(g.name) ? groupConditionScore(g, l.scores[g.name]) : undefined)).overall;
    return {
      key: `${i}`,
      floor: l.floorLevel,
      type: l.type,
      typeLabel: shortType(l.type),
      name: l.name,
      label: `${l.floorLevel} · ${shortType(l.type)} — ${l.name}`,
      score,
      band: ratingBand(score),
    };
  });
  const groupByName = new Map(groups.map((g) => [g.name, g]));
  const rows = reportGroups.map((rg) => {
    const g = groupByName.get(rg.name)!;
    return {
      group: rg.name,
      cells: ordered.map((l): ReportCell => {
        if (!g.locations.includes(l.type)) return { kind: "blank", text: "" };
        const c = l.scores[g.name];
        if (!c) return { kind: "unrecorded", text: "Not recorded" };
        if (c === "N/A") return { kind: "na", text: "N/A" };
        if (isBinary(g)) {
          const parts = l.unsafeParts?.[g.name] ?? [];
          const bad = c === "Very Poor";
          return { kind: bad ? "binaryUnsafe" : "binaryOk", condition: c, text: `${binaryLabel(g, c)}${bad && parts.length ? ` (${parts.join(", ")})` : ""}` };
        }
        return { kind: "condition", condition: c, text: optionLabel(g, c) };
      }),
    };
  });

  // ---- alerts (safety first) ----
  const alerts: string[] = [];
  for (const g of groups.filter((x) => x.category === "Safety" && isBinary(x))) {
    const bad = ordered.filter((l) => g.locations.includes(l.type) && l.scores[g.name] === "Very Poor");
    if (!bad.length) continue;
    if (g.name === COLUMN_ITEM) {
      for (const l of bad) {
        const parts = l.unsafeParts?.[g.name] ?? [];
        const cc = l.columnCheck;
        const extra = [
          parts.length ? parts.join(" & ") : "",
          cc?.crackOver3mm === "YES" ? `crack > ${REPORT_THRESHOLDS.crackMm} mm` : cc?.crackOver3mm === "NO" ? `crack up to ${REPORT_THRESHOLDS.crackMm} mm` : "",
          cc?.crackOver3mm === "YES" ? (cc.hammerAvailable === "YES" && cc.reading.trim() ? `Schmidt Hammer ${cc.reading.trim()} N/mm²` : "no Schmidt Hammer reading") : "",
        ].filter(Boolean);
        alerts.push(`${ALERT_NAME[g.name]} unsafe in ${locationPlace(l)}${extra.length ? `: ${extra.join(", ")}` : ""}`);
      }
    } else if (g.name === SLAB_ASSESSMENT_ITEM) {
      const holes = [src.drillingCheck.slabAssessment ?? "", ...(src.drillingCheck.extraHoles ?? []).map((h) => h.slabAssessment)];
      const which = holes.map((a, i) => (a === "Unsafe" ? `hole ${i + 1}` : "")).filter(Boolean);
      alerts.push(`Slab + Screeding/Waterproofing thickness assessed Unsafe${which.length ? ` (${which.join(", ")})` : ""}`);
    } else if (g.name === OVERFLOW_ITEM) {
      alerts.push("No proper overflow disposal system on the roof");
    } else if (g.name === "Access to roof area /tanks") {
      alerts.push(`Roof access not available (${joinList(bad.map(locationPlace))})`);
    } else {
      alerts.push(`${ALERT_NAME[g.name] ?? itemLabel(g)} unsafe in ${joinList(bad.map(locationPlace))}`);
    }
  }
  if (src.structuralConcern === "YES") alerts.push("Structural concern observed: YES");

  // ---- structural panel ----
  const d = src.drillingCheck;
  const holeInputs = d.done === "YES" ? [{ totalDepthMm: d.totalDepthMm, slabThicknessMm: d.slabThicknessMm, screedThicknessMm: d.screedThicknessMm, slabAssessment: d.slabAssessment ?? "" }, ...(d.extraHoles ?? [])] : [];
  const holes: DrillHoleView[] = holeInputs.map((h, i) => {
    const slab = num(h.slabThicknessMm);
    const screed = num(h.screedThicknessMm);
    const typed = num(h.totalDepthMm);
    const total = typed ?? (slab !== null && screed !== null ? slab + screed : null);
    return {
      label: `Hole ${i + 1}`,
      slabMm: slab,
      screedMm: screed,
      totalMm: total,
      totalMeasured: typed !== null,
      assessment: h.slabAssessment || "—",
      totalWithinLimit: total === null ? null : total <= REPORT_THRESHOLDS.totalDepthMm,
      screedWithinLimit: screed === null ? null : screed < REPORT_THRESHOLDS.screedMm,
    };
  });
  holes.forEach((h) => {
    if (h.totalWithinLimit === false) alerts.push(`${h.label}: total depth ${h.totalMm} mm is over ${REPORT_THRESHOLDS.totalDepthMm} mm, remove the roof screed and inspect`);
    if (h.screedWithinLimit === false) alerts.push(`${h.label}: screed ${h.screedMm} mm is ${REPORT_THRESHOLDS.screedMm} mm or more, Roof Screeding is Unsafe`);
  });

  const photoItems = new Set(src.photos.map((p) => p.itemName));
  const s = src.siteChecks;
  const structural: ReportStructural = {
    building: [
      { label: "Suggested structural type", value: src.buildingStructure || "—" },
      ...(src.typeOfStructure ? [{ label: "Type of structure (visual)", value: src.typeOfStructure }] : []),
      { label: "Centre beam in classrooms", value: src.centerBeam || "—" },
      { label: "Power supply", value: src.powerSupply || "—" },
      { label: "Roof access type", value: s.roofAccessType || "—" },
      { label: "Structural concern observed", value: src.structuralConcern || "—" },
    ],
    drilling: {
      done: d.done || "—",
      pointMarked: d.pointMarked || "—",
      holeRepaired: d.holeRepaired || "—",
      unitTyped: d.unit === "in" ? "inches (stored in mm)" : "mm",
      holes,
    },
    columns: ordered
      .filter((l) => l.columnCheck?.crackOver3mm)
      .map((l) => ({
        location: locationPlace(l),
        parts: (l.unsafeParts?.[COLUMN_ITEM] ?? []).join(", ") || "—",
        crackOver3mm: l.columnCheck!.crackOver3mm,
        hammerAvailable: l.columnCheck!.hammerAvailable || "—",
        reading: l.columnCheck!.hammerAvailable === "YES" && l.columnCheck!.reading.trim() ? `${l.columnCheck!.reading.trim()} N/mm²` : "—",
        highlight: l.columnCheck!.crackOver3mm === "YES",
      })),
    roof: [
      { label: "Overflow disposal system", value: s.overflowDisposal || "—", bad: s.overflowDisposal === "Not provided", photo: false },
      { label: "Roof clean of dirt and vegetation", value: s.roofClean || "—", bad: s.roofClean === "No", photo: photoItems.has(SITE_PHOTO_ROOF_CLEAN) },
      { label: "Rain spouts clear", value: s.rainSpoutsClear || "—", bad: s.rainSpoutsClear === "No", photo: photoItems.has(SITE_PHOTO_RAIN_SPOUTS) },
    ],
    risks: RISK_FACTOR_OPTIONS.map((label) => ({ label, selected: s.riskFactors.includes(label) })),
    riskOther: s.riskFactors.includes(RISK_FACTOR_OTHER) ? s.riskFactorOther : "",
  };

  // ---- summary pieces ----
  const categories = (["Functionality", "Safety", "Aesthetics"] as Category[]).map((category) => {
    const score = result.categories[category].score;
    return { category, weight: CATEGORY_WEIGHT[category], score, band: ratingBand(score) };
  });
  const losses = reportGroups
    .filter((g) => g.pointsLost > 0.005)
    .sort((a, b) => b.pointsLost - a.pointsLost)
    .slice(0, REPORT_TOP_LOSSES)
    .map((g) => ({ name: g.name, label: g.label, category: g.category, pointsLost: g.pointsLost }));
  const strengths = reportGroups
    .filter((g) => g.score === 100)
    .sort((a, b) => CATEGORY_WEIGHT[b.category] * b.weight - CATEGORY_WEIGHT[a.category] * a.weight)
    .slice(0, REPORT_TOP_STRENGTHS)
    .map((g) => ({ label: g.label, category: g.category, weight: g.weight }));
  const notAssessed = reportGroups.filter((g) => g.score === null).map((g) => ({ label: g.label, note: g.statusNote }));

  // ---- narrative (templates only; every number comes from above) ----
  const narrative: string[] = [];
  const overall = result.overall;
  const safety = result.categories.Safety.score;
  const unsafeGroups = reportGroups.filter((g) => g.unsafe);
  if (overall !== null) {
    const safetyWord = (sc: number) => ({ Excellent: "strong", Good: "good", Average: "weak", Poor: "poor" })[ratingBand(sc)!];
    const first = `Overall condition is ${ratingBand(overall)} (${pct(overall)})`;
    if (alerts.length) {
      const causes = [
        unsafeGroups.length ? `${unsafeGroups.length} safety item${unsafeGroups.length === 1 ? " is" : "s are"} rated unsafe` : "",
        src.structuralConcern === "YES" ? "a structural concern was observed" : "",
      ].filter(Boolean);
      narrative.push(
        `${first}, but ${alerts.length} safety alert${alerts.length === 1 ? " needs" : "s need"} action${causes.length ? `: ${joinList(causes)}` : ""}.${safety !== null ? ` Safety scores ${pct(safety)}.` : ""}`,
      );
    } else if (safety !== null) narrative.push(`${first}, and Safety is ${safetyWord(safety)} (${pct(safety)}) with no safety alerts.`);
    else narrative.push(`${first}.`);
  }
  if (losses.length) narrative.push(`Most points were lost on ${joinList(losses.slice(0, 3).map((l) => l.label))}.`);
  // Locations scoring below the campus as a whole, the lowest two.
  const worstCols = columns.filter((c) => c.score !== null && overall !== null && c.score < overall).sort((a, b) => a.score! - b.score!).slice(0, 2);
  if (worstCols.length)
    narrative.push(
      `${joinList(worstCols.map((c) => (c.floor === "External" || c.floor === "Roof" ? c.name : `${c.name} (${c.floor})`)))} ${worstCols.length === 1 ? "shows" : "show"} the poorest condition (${worstCols
        .map((c) => pct(c.score!))
        .join(" and ")}).`,
    );

  // ---- photos ----
  const locByName = new Map(ordered.map((l) => [l.name, l]));
  const photos: ReportPhoto[] = src.photos
    .map((p) => {
      const loc = p.locationName ? locByName.get(p.locationName) : undefined;
      const g = groupByName.get(p.itemName);
      const c = loc?.scores[p.itemName];
      let severity = 4;
      let rating = "";
      if (g && c) {
        if (isBinary(g)) {
          rating = binaryLabel(g, c);
          severity = c === "Very Poor" ? 0 : 3;
        } else {
          rating = optionLabel(g, c);
          severity = c === "Very Poor" ? 1 : c === "Poor" ? 2 : 3;
        }
      } else if (loc) severity = 3;
      const item = g ? itemLabel(g, loc?.type) : p.itemName;
      return {
        id: p.id,
        itemName: p.itemName,
        locationName: p.locationName,
        severity,
        caption: [loc ? locationPlace(loc) : p.locationName || "Site checks", item, rating].filter(Boolean).join(" · "),
      };
    })
    .sort((a, b) => a.severity - b.severity || naturalCompare(a.caption, b.caption));

  // ---- data quality ----
  const coverage = itemsCoveredNow(locations);
  const flags: string[] = [];
  if (src.draft) flags.push("Draft export: this survey has not been submitted yet.");
  if (/training|checking/i.test(src.purpose)) flags.push(`Survey purpose is "${src.purpose}": it is left off the dashboard.`);
  if (coverage.percent < 100) flags.push(`Items covered: ${coverage.covered} of ${coverage.total} item groups (${pct(coverage.percent)}).`);
  const missing = [
    !src.apm.trim() && "Engineering staff",
    !src.asm.trim() && "ASM",
    !src.principal.trim() && "Principal",
  ].filter(Boolean) as string[];
  if (missing.length) flags.push(`Team fields left blank: ${joinList(missing)}.`);
  const unrecorded = rows.flatMap((r, ri) => r.cells.map((c, ci) => (c.kind === "unrecorded" ? `${reportGroups[ri]!.label} at ${columns[ci]!.name}` : ""))).filter(Boolean);
  if (unrecorded.length)
    flags.push(`${unrecorded.length} applicable item/location pair${unrecorded.length === 1 ? " was" : "s were"} left unrecorded: ${unrecorded.slice(0, 6).join("; ")}${unrecorded.length > 6 ? "; …" : ""}.`);
  flags.push(...rubricDifferences(src));

  // ---- W68: minor ("*") items and the legacy questionnaire table ----
  const levelOf = (c: Condition | undefined): MinorLevel => (!c ? "unrecorded" : c === "N/A" ? "na" : c === "Very Poor" ? "veryPoor" : c === "Poor" ? "poor" : c === "Ok" ? "ok" : "good");
  const emptyCounts = (): Record<MinorLevel, number> => ({ veryPoor: 0, poor: 0, ok: 0, good: 0, na: 0, unrecorded: 0 });
  const minorGroups = groups.filter((g) => g.principalMaintained);
  const minorByLocation = ordered
    .map((l, i) => ({
      label: columns[i]!.label,
      score: scoreItemSet(minorGroups, (g) => ((g as RubricGroup).locations.includes(l.type) ? groupConditionScore(g, l.scores[g.name]) : undefined)).overall,
      items: minorGroups
        .filter((g) => g.locations.includes(l.type))
        .map((g) => {
          const c = l.scores[g.name];
          return { label: itemLabel(g, l.type), rating: !c ? "Not recorded" : c === "N/A" ? "N/A" : optionLabel(g, c), level: levelOf(c) };
        }),
    }))
    .filter((x) => x.items.length);
  const minorModel: ReportMinor = {
    major: { score: result.major, band: ratingBand(result.major) },
    minor: { score: result.minor, band: ratingBand(result.minor) },
    groups: minorGroups.map((g) => {
      const counts = emptyCounts();
      for (const l of ordered) if (g.locations.includes(l.type)) counts[levelOf(l.scores[g.name])]++;
      const score = aggregated[g.name] ?? null;
      return { name: g.name, label: itemLabel(g), category: g.category, weight: g.weight, score, band: ratingBand(score), counts };
    }),
    byLocation: minorByLocation,
    shortcomings: minorByLocation.reduce((n, l) => n + l.items.filter((it) => it.level === "poor" || it.level === "veryPoor").length, 0),
  };
  const nearest = (score: number): Exclude<Condition, "N/A"> => (score >= 87.5 ? "Good" : score >= 62.5 ? "Ok" : score >= 37.5 ? "Poor" : "Very Poor");
  const LEGACY_ORDER: Category[] = ["Functionality", "Safety", "Aesthetics"];
  const questionnaire: ReportQuestionnaire = {
    rows: LEGACY_ORDER.flatMap((cat) =>
      groups
        .filter((g) => g.category === cat)
        .map((g, i): QuestionnaireRow => {
          const score = aggregated[g.name] ?? null;
          const cumulative = (CATEGORY_WEIGHT[cat] * g.weight) / 100;
          return { division: cat, sno: i + 1, label: itemLabel(g), minor: Boolean(g.principalMaintained), tick: score === null ? null : nearest(score), score, divisionWeight: CATEGORY_WEIGHT[cat], groupWeight: g.weight, cumulative, scored: score === null ? null : (cumulative * score) / 100 };
        }),
    ),
    divisions: LEGACY_ORDER.map((cat) => {
      const sc = result.categories[cat].score;
      return { division: cat, weight: CATEGORY_WEIGHT[cat], score: sc, contribution: sc === null ? null : (sc * CATEGORY_WEIGHT[cat]) / 100 };
    }),
    total: overall,
  };

  const dateIso = src.submittedAt && !Number.isNaN(new Date(src.submittedAt).getTime()) ? src.submittedAt : "";
  return {
    rubricVersion: RUBRIC_VERSION,
    submittedRubricVersion: src.submittedRubricVersion,
    header: {
      campusName: src.campusName || "—",
      regionArea: [src.region, src.area].filter(Boolean).join(" · ") || "—",
      surveyId: src.surveyId,
      date: dateIso ? localTime(dateIso).replace(/,? \d{1,2}:\d{2}.*$/, "") : src.submittedAt || "—",
      method: `MQI App survey${src.purpose ? ` · ${src.purpose}` : ""}`,
      staff: src.apm || "—",
      asm: src.asm || "—",
      principal: src.principal || "—",
      start: localTime(src.startTime),
      finish: localTime(src.endTime),
      timeTaken: duration(src.timeTakenSeconds),
      itemsCovered: pct(coverage.percent),
      draft: src.draft,
    },
    alerts,
    overall: { score: overall, band: ratingBand(overall) },
    categories,
    narrative,
    groups: reportGroups,
    losses,
    strengths,
    notAssessed,
    matrix: { columns, rows },
    structural,
    photos,
    complaints: src.complaints.trim(),
    flags,
    minor: minorModel,
    questionnaire,
  };
}

/** Coverage against the current rubric (the report's own scoring), not the stored percentage. */
function itemsCoveredNow(locations: readonly { scores: Record<string, Condition> }[]) {
  const scored = new Set<string>();
  for (const l of locations) for (const [n, v] of Object.entries(l.scores)) if (v && v !== "N/A") scored.add(n);
  const covered = RUBRIC_GROUPS.filter((g) => scored.has(g.name)).length;
  return { covered, total: RUBRIC_GROUPS.length, percent: (covered / RUBRIC_GROUPS.length) * 100 };
}

/** Flags for a survey submitted under an older rubric: what changed, and the scores stored with it. */
function rubricDifferences(src: ReportSource): string[] {
  if (src.submittedRubricVersion === RUBRIC_VERSION) return [];
  const old = rubricGroupsFor(src.submittedRubricVersion);
  const oldByName = new Map(old.map((g) => [g.name, g]));
  const changed = RUBRIC_GROUPS.filter((g) => oldByName.has(g.name) && oldByName.get(g.name)!.weight !== g.weight).map(
    (g) => `${itemLabel(g)} ${oldByName.get(g.name)!.weight}→${g.weight}`,
  );
  const added = RUBRIC_GROUPS.filter((g) => !oldByName.has(g.name)).map((g) => itemLabel(g));
  const removed = old.filter((g) => !RUBRIC_GROUPS.some((n) => n.name === g.name)).map((g) => g.name);
  const out = [
    `Submitted under rubric ${src.submittedRubricVersion || "before 2026-10-27"}; this report re-scores it with the current rubric ${RUBRIC_VERSION}.`,
  ];
  if (changed.length) out.push(`Weights changed since then: ${changed.join(", ")}.`);
  if (added.length) out.push(`Groups added since then: ${added.join(", ")}${added.some((a) => a.startsWith("Slab") || a.startsWith("Proper")) ? " (scored from the drilling and overflow answers)" : ""}.`);
  if (removed.length) out.push(`Groups in the older rubric that the current one doesn't have (not scored here): ${removed.join(", ")}.`);
  const st = src.storedScores;
  if (st && st.overall !== null) {
    const f = (n: number | null) => (n === null ? "—" : pct(n));
    out.push(`Scores stored with the survey (old rubric): overall ${f(st.overall)}, Functionality ${f(st.functionality)}, Safety ${f(st.safety)}, Aesthetics ${f(st.aesthetics)}.`);
  }
  return out;
}

/** A submitted survey (surveys.get) as report input. */
export function reportSourceFromFound(found: FoundSurvey): ReportSource {
  return {
    surveyId: found.surveyId,
    campusName: found.campusName,
    region: found.region,
    area: found.area,
    submittedAt: found.submittedAt,
    startTime: found.startTime,
    endTime: found.endTime,
    timeTakenSeconds: found.timeTakenSeconds,
    apm: found.apm,
    asm: found.asm,
    principal: found.principal,
    powerSupply: found.powerSupply,
    structuralConcern: found.structuralConcern,
    buildingStructure: found.buildingStructure,
    typeOfStructure: found.typeOfStructure,
    centerBeam: found.centerBeam,
    drillingCheck: found.drillingCheck,
    siteChecks: found.siteChecks,
    complaints: found.complaints,
    purpose: found.purpose ?? "",
    submittedRubricVersion: found.rubricVersion,
    storedScores: { overall: found.overall, functionality: found.functionality, safety: found.safety, aesthetics: found.aesthetics },
    draft: false,
    locations: (found.locations ?? []).map((l) => {
      const scores: Record<string, Condition> = {};
      for (const [name, value] of Object.entries(l.scores)) {
        const c = cellCondition(value);
        if (c) scores[name] = c;
      }
      return {
        floorLevel: l.floorLevel,
        type: l.type,
        name: l.name,
        scores,
        unsafeParts: l.unsafeParts,
        columnCheck: l.columnCrackOver3mm
          ? { crackOver3mm: l.columnCrackOver3mm as ColumnCheck["crackOver3mm"], hammerAvailable: (l.schmidtAvailable ?? "") as ColumnCheck["hammerAvailable"], reading: l.schmidtReading ?? "" }
          : undefined,
      };
    }),
    photos: (found.photos ?? []).map((p) => ({ id: p.attachmentId, itemName: p.itemName, locationName: p.locationName })),
  };
}
