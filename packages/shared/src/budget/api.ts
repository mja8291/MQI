import { z } from 'zod';
import type { BudgetCampus, BudgetCycle, RegionZone, Scenario } from './types';
import type { ImportSummary } from './source';

/** Budget site actions (Cost Manager and Admin only; the permission is 'budget'). */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd.');
const money = z.number().finite().min(0).max(1_000_000);
const count = z.number().int().min(0).max(100_000);
const bands = z.enum(['Excellent', 'Good', 'Average', 'Poor']);

const ruleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unsafe'), level: z.enum(['critical', 'partial']) }),
  z.object({ type: z.literal('band'), bands: z.array(bands).min(1) }),
  z.object({ type: z.literal('scoreRange'), min: z.number().min(0).max(100), max: z.number().min(0).max(100) }),
  z.object({ type: z.literal('bottomN'), band: bands, n: count }),
  z.object({ type: z.literal('manual'), campusIds: z.array(z.string().max(20)).max(3000) }),
]);

export const categorySchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['campus', 'anticipated']),
  rule: ruleSchema.optional(),
  lastYearRate: money.nullable(),
  inflationPct: z.number().min(-100).max(1000).nullable().optional(),
  count: count.optional(),
  lumpSum: money.nullable().optional(),
  tbdCount: count.optional(),
  tbdByRegion: z.record(z.string().max(80), count).optional(),
  capCount: count.nullable().optional(),
  capRs: money.nullable().optional(),
  colour: z.string().max(20).optional(),
  // W91: list adjustments (funding source removed; old saves drop it).
  includeIds: z.array(z.string().max(20)).max(3000).optional(),
  excludeIds: z.array(z.string().max(20)).max(3000).optional(),
  siblingLastYearRate: money.nullable().optional(),
});

const metaSchema = z.object({ source: z.string().max(300), owner: z.string().max(120), date: z.string().max(20), note: z.string().max(1000) });

export const scenarioConfigSchema = z.object({
  inflationPct: z.number().min(-100).max(1000),
  ceilingRs: money.nullable().optional(),
  lastYearTotal: money.nullable().optional(),
  categories: z.array(categorySchema).min(1).max(40),
  assumptions: z.record(z.string().max(120), metaSchema),
  siblingBandRates: z.record(z.string().max(20), money.nullable()).optional(),
  budgetCut: money.nullable().optional(),
  rmPlanSiblings: z
    .object({ otherLastYearRate: money.nullable().optional(), unknownLastYearRate: money.nullable().optional(), rates: z.record(z.string().max(80), money.nullable()).optional() })
    .optional(),
});

export const budgetCycleSavePayload = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(40),
  surveyFrom: isoDate,
  surveyTo: isoDate,
});

export const budgetScenarioSavePayload = z.object({
  id: z.string().max(64).optional(),
  cycleId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  config: scenarioConfigSchema,
  /** The updatedAt the client last saw; a newer save by someone else is refused (CONFLICT). */
  baseUpdatedAt: z.string().max(40).optional(),
});

export const budgetIdPayload = z.object({ id: z.string().min(1).max(64) });

export const budgetZonesSavePayload = z.object({
  rows: z.array(z.object({ region: z.string().trim().min(1).max(80), zone: z.string().trim().max(80) })).max(200),
});

/** W91: `fresh` = "Pull latest MQI categories": the dashboard's figures are worked out again first. */
export const budgetCampusesPayload = z.object({ cycleId: z.string().min(1).max(64), fresh: z.boolean().optional() });

export interface BudgetState {
  cycles: BudgetCycle[];
  scenarios: Scenario[];
  regionZones: RegionZone[];
  master: { campuses: number; importedAt: string; importedBy: string; source: string; regions: string[] };
}

export interface BudgetCampusesResult {
  campuses: BudgetCampus[];
  summary: ImportSummary;
  /** The dashboard copy the MQI figures came from. */
  generatedAt: string;
}

export interface BudgetImportResult {
  campuses: number;
  noECompound: number;
  importedAt: string;
  source: string;
}
