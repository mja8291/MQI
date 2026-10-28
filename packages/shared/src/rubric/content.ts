import type {
  BuildingStructure,
  CenterBeam,
  Category,
  OverflowDisposal,
  PowerSupply,
  RoofAccessType,
  StructuralConcern,
  TypeOfStructure,
} from "../types";

export const OATH_TEXT =
  "I undertake to affirm that I am the Administration & Support Manager of the above mentioned school and that the responses provided in the assessment form are in accordance with the provided instructions and guidance. The provided ratings are, to the best of my knowledge, a true and actual representation of the school condition.";

export const POWER_SUPPLY_OPTIONS: PowerSupply[] = [
  "Grid (Wapda/K.E/LESCO etc.)",
  "Solar",
  "Hybrid (Both Grid & Solar)",
  "No Power",
  "Other",
];

export const STRUCTURAL_CONCERN_QUESTION =
  "Did you observe any sign of being structurally sensitive or dangerous in the building?";
export const STRUCTURAL_CONCERN_OPTIONS: StructuralConcern[] = ["YES", "NO"];

// Items 2 and 3 of the rubric workbook's "Safety Related" tab, each under its
// "Visual Inspection" option header. Type of Structure is the *observed* type;
// BUILDING_STRUCTURE_* below is the separate "suggest" question with its own
// five options.
export const TYPE_OF_STRUCTURE_QUESTION = "Type of Structure (visual inspection)";
export const TYPE_OF_STRUCTURE_OPTIONS: TypeOfStructure[] = ["RCC (Frame)", "Load-bearing", "Hybrid", "N/A"];

export const CENTER_BEAM_QUESTION = "Center Beam in Classrooms (visual inspection)";
export const CENTER_BEAM_OPTIONS: CenterBeam[] = ["YES", "NO", "N/A"];

// Slab / roof-screeding drilling check — "Drilling & Observation" block of
// the rubric workbook's "Safety Related" tab (wording of the first item is
// the sheet's own). Recorded only, never scored.
export const DRILLING_DONE_QUESTION = "Was a drilling check of slab and roof screeding thickness carried out?";
export const DRILLING_POINT_QUESTION = "Drilling point marked on slab by APM (clear of beams, electrical point etc.)";
export const DRILLING_POINT_OPTIONS = ["Ok", "Unsafe"] as const;
export const SLAB_THICKNESS_LABEL = "Slab thickness recorded (mm)";
export const SCREED_THICKNESS_LABEL = "Roof screeding thickness recorded (mm)";
export const DRILLING_REPAIR_QUESTION = "Was the drilled hole repaired with grout/epoxy?";
export const SLAB_ASSESSMENT_QUESTION = "Slab thickness assessment";

// "Structural Checks Recorded Alongside Condition" slide (TCF Engineering):
// the visual-inspection, roof & drainage and building-proximity questions
// that aren't Type of Structure / Center Beam / the drilling check above.
export const ROOF_ACCESS_TYPE_QUESTION = "Access to roof area / tanks (type of access)";
export const ROOF_ACCESS_TYPE_OPTIONS: RoofAccessType[] = ["Proper staircase", "Ladder", "None", "N/A"];
export const OVERFLOW_QUESTION = "Overflow disposal system";
export const OVERFLOW_OPTIONS: OverflowDisposal[] = ["Provided", "Not provided"];
export const YES_NO_OPTIONS = ["Yes", "No"] as const;
export const RISK_FACTOR_QUESTION = "Building proximity: risk factors (mark any that apply)";
export const RISK_FACTOR_OTHER = "Any other";
export const RISK_FACTOR_OPTIONS = [
  "Compromised construction quality",
  "Deteriorative environment (e.g. salinity)",
  "Poor soil condition",
  "Coastal area",
  "Without plinth beam",
  "Plinth protection missing",
  RISK_FACTOR_OTHER,
];

export const BUILDING_STRUCTURE_QUESTION ="Please suggest structural type of the building.";
export const BUILDING_STRUCTURE_OPTIONS: BuildingStructure[] = [
  "Load-Bearing",
  "RCC",
  "Precast",
  "Hybrid (RCC+Precast)",
  "Hybrid (Load-Bearing+RCC)",
  "Unknown",
];

interface RatingDefinition {
  en: string;
  ur: string;
}

/** Bilingual condition definitions, verbatim from TCF's existing production copy — reuse, don't retranslate. */
export const RATING_DEFINITIONS: Record<Category, Record<"Good" | "Ok" | "Poor" | "Very Poor", RatingDefinition>> = {
  Functionality: {
    Good: {
      en: "The item works perfectly and serves its purpose effectively.",
      ur: "چیز بہترین طریقے سے کام کر رہی ہے۔",
    },
    Ok: {
      en: "The item works adequately, but there might be occasional minor issues.",
      ur: "چیز معمولی طریقے سے کام کرتی ہے۔",
    },
    Poor: {
      en: "The item works with limitations and might hinder its intended purpose.",
      ur: "چیز محدود طریقے سے کام کرتی ہے اور کچھ مشکلات پیدا کرتی ہے۔",
    },
    "Very Poor": {
      en: "The item is non-functional or severely limits its intended purpose.",
      ur: "چیز کام نہیں کرتی ہے یا کام کرنے میں رکاوٹ پیدا کرتی ہے۔",
    },
  },
  Safety: {
    Good: {
      en: "The item poses no safety concerns and meets all relevant standards.",
      ur: "چیز کو کوئی خطرہ نہیں ہے۔",
    },
    Ok: {
      en: "The item generally meets safety standards but might have minor concerns.",
      ur: "چیز معمولی حفاظتی معیارات پر پوری اترتی ہے۔",
    },
    Poor: {
      en: "The item has safety concerns that need attention.",
      ur: "چیز معمولی حفاظتی خطرات پیدا کرتی ہے۔",
    },
    "Very Poor": {
      en: "The item poses serious safety risks and requires immediate action.",
      ur: "چیز سنگین حفاظتی خطرات پیدا کرتی ہے اور فوری مرمت کی ضرورت ہوتی ہے۔",
    },
  },
  Aesthetics: {
    Good: {
      en: "The item is well-maintained with no visible damage or signs of wear.",
      ur: "چیز میں کوئی نقصان نہیں ہے۔",
    },
    Ok: {
      en: "The item shows minor cosmetic imperfections with acceptable appearance.",
      ur: "چیز میں تھوڑا نقصان ہے۔",
    },
    Poor: {
      en: "The item displays noticeable damage or wear that affects its appearance.",
      ur: "چیز میں نقصان ہے جو دیکھنے میں آتا ہے۔",
    },
    "Very Poor": {
      en: "The item is extensively damaged, with an unpleasant appearance.",
      ur: "چیز بہت زیادہ نقصان میں ہے۔",
    },
  },
};

/** "Thumb rule" guidance for items with multiple physical instances — judgment guidance for the surveyor, not something the app computes. */
export const THUMB_RULE: { rating: string; guidance: string }[] = [
  { rating: "Good", guidance: "At least 80% of the instances are Good and/or OK" },
  { rating: "OK", guidance: "60-79% of the instances are Good and/or OK" },
  {
    rating: "Poor",
    guidance: "Very Poor instances are 30% or less, and Poor + Very Poor together are under 70%",
  },
  {
    rating: "Very Poor",
    guidance: "Very Poor instances exceed 30%, or Poor + Very Poor together exceed 70%",
  },
];
