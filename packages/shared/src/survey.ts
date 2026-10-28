import { z } from 'zod';
import { RISK_FACTOR_OPTIONS } from './rubric/content';
import { FLOOR_LEVELS, LOCATION_TYPES, isLocationComplete } from './rubric/items';
import { rubricGroupsFor } from './rubric/versions';
import {
  SITE_PHOTO_DRILLING_POINT,
  SITE_PHOTO_RAIN_SPOUTS,
  SITE_PHOTO_ROOF_CLEAN,
  SITE_PHOTO_SLAB_THICKNESS,
  isDrillingCheckComplete,
  isSiteChecksComplete,
} from './types';
import type { Condition, DrillingCheck, FloorLevel, LocationType, SiteChecks } from './types';

/**
 * The one MQI v2 entity the phone writes: a survey, plus its attachments (photo
 * metadata; the bytes travel separately through files.upload). Field names follow v1's
 * SubmitPayload / survey state so the sheet mapping (sheets.ts) reads like v1's responses.ts.
 */

const condition = z.enum(['Good', 'Ok', 'Poor', 'Very Poor', 'N/A']) satisfies z.ZodType<Condition>;
const conditionMap = z.record(z.string().max(120), condition);
const text = (max: number) => z.string().max(max);
const blankOr = <const T extends [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal('')]);

export const ID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'Not a UUID v7');

export const schoolSchema = z.object({
  schoolId: text(64).min(1),
  name: text(200).min(1),
  region: text(120),
  area: text(120),
});

export const locationSchema = z.object({
  id: text(64).min(1),
  floorLevel: z.enum(FLOOR_LEVELS as [FloorLevel, ...FloorLevel[]]),
  type: z.enum(LOCATION_TYPES as [LocationType, ...LocationType[]]),
  name: text(120).min(1),
  classroomGrade: text(60).optional(),
  classroomSection: text(30).optional(),
  scores: conditionMap,
  /** item name → attachment ids */
  photos: z.record(z.string().max(120), z.array(ID).max(20)),
  notes: z.record(z.string().max(120), text(2000)),
});

export const drillingCheckSchema = z.object({
  done: blankOr(['YES', 'NO']),
  pointMarked: blankOr(['Ok', 'Unsafe']),
  slabAssessment: blankOr(['Ok', 'Unsafe']).optional(),
  slabThicknessMm: text(20),
  screedThicknessMm: text(20),
  holeRepaired: blankOr(['YES', 'NO']),
}) satisfies z.ZodType<DrillingCheck>;

export const siteChecksSchema = z.object({
  roofAccessType: blankOr(['Proper staircase', 'Ladder', 'None', 'N/A']),
  overflowDisposal: blankOr(['Provided', 'Not provided']),
  roofClean: blankOr(['Yes', 'No']),
  rainSpoutsClear: blankOr(['Yes', 'No']),
  riskFactors: z.array(z.enum(RISK_FACTOR_OPTIONS as [string, ...string[]])).max(RISK_FACTOR_OPTIONS.length),
  riskFactorOther: text(500),
}) satisfies z.ZodType<SiteChecks>;

export const scoreResultSchema = z.object({
  overall: z.number().nullable(),
  functionality: z.number().nullable(),
  safety: z.number().nullable(),
  aesthetics: z.number().nullable(),
  major: z.number().nullable(),
  minor: z.number().nullable(),
  criticalItems: z.record(z.string(), z.number().nullable()),
});
export type SurveyScores = z.infer<typeof scoreResultSchema>;

/** A submitted survey as pushed to the server (sync.push). Drafts never leave the phone. */
export const submittedSurveySchema = z.object({
  id: ID,
  rubricVersion: text(20),
  school: schoolSchema,
  asm: text(120),
  apm: text(120),
  principal: text(120),
  powerSupply: blankOr(['Grid (Wapda/K.E/LESCO etc.)', 'Solar', 'Hybrid (Both Grid & Solar)', 'No Power', 'Other']),
  structuralConcern: blankOr(['YES', 'NO']),
  buildingStructure: blankOr(['Load-Bearing', 'RCC', 'Precast', 'Hybrid (RCC+Precast)', 'Hybrid (Load-Bearing+RCC)']),
  typeOfStructure: blankOr(['RCC (Frame)', 'Load-bearing', 'Hybrid', 'N/A']),
  centerBeam: blankOr(['YES', 'NO', 'N/A']),
  drillingCheck: drillingCheckSchema,
  siteChecks: siteChecksSchema,
  complaints: text(5000),
  declaration: z.literal(true),
  locations: z.array(locationSchema).min(1).max(300),
  /** Last-page photos: question text → attachment ids. */
  reviewPhotos: z.record(z.string().max(200), z.array(ID).max(20)),
  startTime: z.string().max(40).nullable(),
  endTime: z.string().max(40),
  timeTakenSeconds: z.number().int().min(0).nullable(),
  pausedSeconds: z.number().int().min(0),
  scores: scoreResultSchema,
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
});
export type SubmittedSurvey = z.infer<typeof submittedSurveySchema>;

/** Photo metadata, pushed with its survey. The file uploads only once the server has the parent. */
export const attachmentSchema = z.object({
  id: ID,
  surveyId: ID,
  itemName: text(200).min(1),
  /** '' for last-page photos, as in v1. */
  locationName: text(120),
  location: z.object({ floorLevel: text(20), type: text(80), name: text(120) }).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().min(1).max(15 * 1024 * 1024),
});
export type AttachmentMeta = z.infer<typeof attachmentSchema>;

// ---- cross-field rules (FR-SVY-9/10, FR-CHK-1…4, Appendix C) ----

export interface RuleIssue {
  path: string;
  message: string;
}

const positive = (v: string) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;

/** Every rule a survey must pass before it can be submitted. Shared so phone and server agree. */
export function submissionIssues(s: SubmittedSurvey, attachmentIds?: ReadonlySet<string>): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) issues.push({ path, message });
  };
  need(!!s.apm.trim(), 'apm', 'Enter the accompanying APM.');
  need(!!s.asm.trim(), 'asm', 'Enter the responding ASM.');
  need(!!s.principal.trim(), 'principal', 'Enter the school principal.');
  need(!!s.powerSupply, 'powerSupply', 'Choose the power supply.');
  need(!!s.structuralConcern, 'structuralConcern', 'Answer the structural concern question.');
  need(!!s.buildingStructure, 'buildingStructure', 'Suggest the structural type of the building.');
  need(!!s.typeOfStructure, 'typeOfStructure', 'Choose the type of structure.');
  need(!!s.centerBeam, 'centerBeam', 'Answer the centre beam question.');
  need(isDrillingCheckComplete(s.drillingCheck), 'drillingCheck', 'Complete the drilling check (thicknesses must be positive numbers).');
  if (s.drillingCheck.done === 'YES') {
    need(positive(s.drillingCheck.slabThicknessMm), 'drillingCheck.slabThicknessMm', 'Slab thickness must be a positive number.');
    need(positive(s.drillingCheck.screedThicknessMm), 'drillingCheck.screedThicknessMm', 'Screeding thickness must be a positive number.');
  }
  need(isSiteChecksComplete(s.siteChecks, s.reviewPhotos), 'siteChecks', 'Answer every roof and drainage question; "No" needs a photo.');
  if (s.siteChecks.riskFactors.includes('Any other')) {
    need(!!s.siteChecks.riskFactorOther.trim(), 'siteChecks.riskFactorOther', 'Specify the other risk factor.');
  }
  need(s.declaration === true, 'declaration', 'Tick the declaration.');

  const groups = rubricGroupsFor(s.rubricVersion);
  const groupNames = new Set(groups.map((g) => g.name));
  const names = new Set<string>();
  s.locations.forEach((loc, i) => {
    need(!names.has(loc.name), `locations.${i}.name`, `Two locations are both named "${loc.name}".`);
    names.add(loc.name);
    need(isLocationComplete(loc), `locations.${i}`, `Score every item at ${loc.name}.`);
    for (const item of Object.keys(loc.scores)) need(groupNames.has(item), `locations.${i}.scores`, `Unknown item "${item}" at ${loc.name}.`);
    if (attachmentIds) {
      for (const ids of Object.values(loc.photos)) for (const id of ids) need(attachmentIds.has(id), `locations.${i}.photos`, 'A photo is missing its attachment record.');
    }
  });
  if (attachmentIds) {
    for (const ids of Object.values(s.reviewPhotos)) for (const id of ids) need(attachmentIds.has(id), 'reviewPhotos', 'A photo is missing its attachment record.');
  }
  return issues;
}

/** The last-page photo questions whose photos are kept for the answers given (v1 review/page.tsx). */
export function applicableReviewPhotoKeys(s: Pick<SubmittedSurvey, 'siteChecks' | 'drillingCheck'>): string[] {
  const keys: string[] = [];
  if (s.siteChecks.roofClean === 'No') keys.push(SITE_PHOTO_ROOF_CLEAN);
  if (s.siteChecks.rainSpoutsClear === 'No') keys.push(SITE_PHOTO_RAIN_SPOUTS);
  if (s.drillingCheck.done === 'YES') keys.push(SITE_PHOTO_DRILLING_POINT, SITE_PHOTO_SLAB_THICKNESS);
  return keys;
}
