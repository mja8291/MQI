// Not type-checked (tools/fixtures/tsconfig.json excludes it): it loads v1 modules from reference/,
// whose Next.js and googleapis dependencies are not installed here. Vitest runs it as is.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type ExcelJS from 'exceljs';
import { PDFArray, PDFDocument, decodePDFRawStream } from 'pdf-lib';
import type { PDFRawStream } from 'pdf-lib';
import { API_VERSION, RESPONSES_TAB, RUBRIC_VERSION, buildDashboard, foundSurveyFromRows, scoreSurveyFor, uuidv7 } from '@mqi/shared';
import type { SurveyLocation, SheetRow, SubmittedSurvey, WhoAmI } from '@mqi/shared';
import { createMemoryEnv } from '../../../apps/gas/src/adapters/memory';
import { DEV_PASSWORD, seedDevEnv } from '../../../apps/gas/src/dev/server';
import { handleRequest } from '../../../apps/gas/src/core/router';
// v2 (the web app's builders and its surveys.get → builder mapping)
import { buildSingleSurveyWorkbook as v2Workbook } from '../../../apps/web/src/lib/export/single-survey-workbook';
import { buildSingleSurveyPdf as v2Pdf } from '../../../apps/web/src/lib/export/single-survey-pdf';
import { pdfInput, workbookInput } from '../../../apps/web/src/lib/export/submitted';

/**
 * Phase 5 exit: v2's downloads and dashboard equal v1's, except that v2 no longer shows a survey
 * "method" (parity-notes D15): the Excel drops v1's Method row (O3/P3; the rows below move up
 * one) and the PDF drops the "Method 2 · " prefix before the date. Everything else must match. v1's own modules run from the read-only
 * reference clone (master 0a4a75c) with only its Google read layer replaced by the same rows,
 * so any difference in logic shows up here. Skipped when reference/ is absent.
 */

const V1_PRESENT = process.env.MQI_V1_PRESENT === '1';

// ---- the rows both apps read ----

const sample = JSON.parse(readFileSync(resolve(import.meta.dirname, '../data/sample-rows.json'), 'utf8')) as {
  headerAtoCD: string[];
  headerTail: string[];
  rows: string[][];
};
const HEADER = [...sample.headerAtoCD, ...sample.headerTail];
const toRow = (cells: readonly unknown[]): SheetRow => Object.fromEntries(HEADER.map((h, i) => [h, cells[i] === undefined ? '' : String(cells[i])]));
const productionRows: SheetRow[] = sample.rows.map(toRow);

/** Rows v2 writes, read back as the sheet's formatted strings. */
function v2WrittenRows(): SheetRow[] {
  const env = createMemoryEnv();
  seedDevEnv(env);
  const call = (action: string, payload: unknown, session?: string) =>
    handleRequest(env, JSON.stringify({ action, apiVersion: API_VERSION, auth: session ? { session } : undefined, payload }));
  const login = call('auth.login', { email: 'surveyor@tcf.test', password: DEV_PASSWORD });
  if (!login.ok) throw new Error('login');
  const session = (login.data as WhoAmI).sessionToken;
  const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const loc = (name: string, type: SurveyLocation['type'], floorLevel: SurveyLocation['floorLevel'], scores: SurveyLocation['scores']) =>
    ({ id: name, floorLevel, type, name, scores, photos: {}, notes: {} }) as SubmittedSurvey['locations'][number];
  const locations = [
    loc('Roof 1', 'Roof', 'Roof', { 'Access to roof area /tanks': 'Very Poor', 'Roof Screeding/roof drainage': 'Good', 'Water Storage (Overhead Tank)': 'Poor', 'External Plumbing': 'Ok', 'Grill Gate': 'N/A', 'Solar Panels/Inverter/Batteries': 'Good', Plaster: 'Poor', Masonry: 'Ok' }),
    loc('KG A', 'Classroom', 'Ground', {
      'Concrete/Plaster Soundness': 'Good',
      'Ceiling Condition i.e. cracks & seepage': 'Very Poor',
      'Wall/Column Condition i.e. cracks': 'Good',
      'Green board/Softboard/Cabinet': 'Ok',
      'Electrical Fixtures + Switch/Dimmer Sheet': 'Poor',
      'Internal Flooring condition': 'Good',
      'Furniture Condition': 'Ok',
      'Door/Windows/Ventilators': 'Very Poor',
      Paint: 'Ok',
      Plaster: 'Good',
    }),
  ];
  const r = scoreSurveyFor(locations as SurveyLocation[], RUBRIC_VERSION);
  const survey: SubmittedSurvey = {
    id: uuidv7(rnd),
    rubricVersion: RUBRIC_VERSION,
    school: { schoolId: '947', name: 'OGS Trust Campus', region: 'South West', area: 'Gadap West I' },
    asm: 'A',
    apm: 'B',
    principal: 'C',
    powerSupply: 'Hybrid (Both Grid & Solar)',
    structuralConcern: 'YES',
    buildingStructure: 'Hybrid (RCC+Precast)',
    typeOfStructure: 'Hybrid',
    centerBeam: 'N/A',
    drillingCheck: { done: 'YES', pointMarked: 'Unsafe', slabAssessment: 'Ok', slabThicknessMm: '125', screedThicknessMm: '40', holeRepaired: 'NO' },
    siteChecks: { roofAccessType: 'Ladder', overflowDisposal: 'Not provided', roofClean: 'Yes', rainSpoutsClear: 'Yes', riskFactors: ['Coastal area', 'Any other'], riskFactorOther: 'Next to a nala' },
    complaints: 'Leaking tank; =SUM(A1)',
    declaration: true,
    locations,
    reviewPhotos: {},
    startTime: '2026-10-28T04:00:00.000Z',
    endTime: '2026-10-28T05:10:00.000Z',
    timeTakenSeconds: 4100,
    pausedSeconds: 100,
    scores: {
      overall: r.overall,
      functionality: r.categories.Functionality.score,
      safety: r.categories.Safety.score,
      aesthetics: r.categories.Aesthetics.score,
      major: r.major,
      minor: r.minor,
      criticalItems: r.criticalItems,
    },
    createdAt: '2026-10-28T04:00:00.000Z',
    updatedAt: '2026-10-28T05:10:00.000Z',
  };
  const pushed = call('sync.push', { items: [{ outboxId: 1, survey, attachments: [] }] }, session);
  if (!pushed.ok) throw new Error(JSON.stringify(pushed.error));
  const header = env.responses.header(RESPONSES_TAB)!;
  return env.responses.readRows(RESPONSES_TAB, 2, env.responses.lastRow(RESPONSES_TAB) - 1).map((cells) =>
    Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])),
  );
}

const writtenRows = v2WrittenRows();
const ALL_M2: SheetRow[] = [...productionRows, ...writtenRows];
const surveyIds = [...new Set(ALL_M2.map((r) => r['Survey ID']!))];
const SCHOOLS = [
  { schoolId: '947', name: 'OGS Trust Campus', region: 'South West', area: 'Gadap West I' },
  { schoolId: '499', name: 'Alfalah Campus', region: 'Lower Sindh', area: 'Hyderabad 1' },
  { schoolId: '107', name: 'Fazalillahi Campus-I', region: 'South West', area: 'Baldia Town 2' },
  { schoolId: '1306', name: 'Zia & Faiza Bhutta Family Foundation Campus', region: 'North', area: 'Sheikhupura' },
  { schoolId: '2000', name: 'Not yet surveyed', region: 'Central', area: 'Lahore 3' },
];

// ---- v1's read layer, replaced by the same rows ----

vi.mock('../../../reference/src/lib/sheets/read', () => ({
  readRowsByHeader: async (_id: string, tab: string) => (tab === 'Method 2 Responses' ? ALL_M2 : []),
}));
vi.mock('../../../reference/src/lib/sheets/client', () => ({ sheetsConfigured: () => true, getSheetsClient: async () => ({}) }));
vi.mock('../../../reference/src/lib/sheets/schools', () => ({ getSchools: async () => SCHOOLS }));

/** v1's Excel with its Method row removed and the info rows below it moved up one (D15). */
function withoutMethodRow(v1: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v1)) {
    const m = /^(.*)!R(\d+)C(15|16)$/.exec(key);
    if (!m) {
      out[key] = value;
      continue;
    }
    const row = Number(m[2]);
    if (row === 3) continue;
    out[row > 3 && row <= 7 ? `${m[1]}!R${row - 1}C${m[3]}` : key] = value;
  }
  return out;
}

/** A PDF's page content with every text string decoded, so two PDFs can be compared by what they draw. */
async function pdfContent(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  return doc
    .getPages()
    .map((page) => {
      const contents = page.node.Contents()!;
      const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
      return streams.map((st) => Buffer.from(decodePDFRawStream(st as PDFRawStream).decode()).toString('latin1')).join('\n');
    })
    .join('\f')
    .replace(/<([0-9A-Fa-f]*)>/g, (_m, hex: string) => `(${Buffer.from(hex, 'hex').toString('latin1')})`);
}

/** Every cell of every sheet: address → value (formulas included). */
function cells(wb: ExcelJS.Workbook): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  wb.eachSheet((ws) =>
    ws.eachRow({ includeEmpty: false }, (row, r) =>
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        out[`${ws.name}!R${r}C${c}`] = JSON.parse(JSON.stringify(cell.value));
      }),
    ),
  );
  return out;
}

describe.skipIf(!V1_PRESENT)('v1 ⇄ v2 parity (exports and dashboard)', () => {
  beforeAll(() => {
    process.env.MQI_SPREADSHEET_ID = 'parity';
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  test.each(surveyIds.map((id) => [id]))('Excel for %s: every cell and formula matches v1 (less the Method row)', async (id) => {
    const { findSurvey } = await import('../../../reference/src/lib/export/find-survey');
    const { buildSingleSurveyWorkbook: v1Workbook } = await import('../../../reference/src/lib/export/single-survey-workbook');
    const found = (await findSurvey('parity', id))!;
    // v1 /api/export/survey/[surveyId] route, verbatim.
    const v1 = v1Workbook({
      surveyId: id,
      campusName: found.campusName,
      method: found.method,
      submittedAt: found.submittedAt,
      startTime: found.startTime,
      endTime: found.endTime,
      timeTakenSeconds: found.timeTakenSeconds,
      conditions: found.conditions,
      aggregatedScores: found.aggregatedScores,
      items: found.items,
    });
    const v2Found = foundSurveyFromRows(id, ALL_M2.filter((r) => r['Survey ID'] === id))!;
    expect(cells(v2Workbook(workbookInput(v2Found)))).toEqual(withoutMethodRow(cells(v1)));
  });

  test.each(surveyIds.map((id) => [id]))('PDF for %s: draws exactly what v1 draws (less the Method label)', async (id) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T06:00:00.000Z'));
    const { findSurvey } = await import('../../../reference/src/lib/export/find-survey');
    const { buildSingleSurveyPdf: v1Pdf } = await import('../../../reference/src/lib/export/single-survey-pdf');
    const found = (await findSurvey('parity', id))!;
    // v1 /api/export/survey/[surveyId]/pdf route, verbatim.
    const itemValues: Record<string, string> =
      found.method === 1
        ? found.conditions
        : Object.fromEntries(Object.entries(found.aggregatedScores ?? {}).map(([name, score]) => [name, `Aggregated (${Math.round(score)}%)`]));
    const v1 = await v1Pdf({
      surveyId: id,
      campusName: found.campusName,
      region: found.region,
      area: found.area,
      method: found.method,
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
      overall: found.overall,
      functionality: found.functionality,
      safety: found.safety,
      aesthetics: found.aesthetics,
      ratingBand: found.ratingBandLabel,
      itemValues,
      items: found.items,
    });
    const v2Found = foundSurveyFromRows(id, ALL_M2.filter((r) => r['Survey ID'] === id))!;
    const v2 = await v2Pdf(pdfInput(v2Found));
    vi.useRealTimers();
    const v1Content = await pdfContent(v1);
    expect(v1Content).toContain('(Method 2 \u00b7 ');
    expect(await pdfContent(v2)).toEqual(v1Content.replace('(Method 2 \u00b7 ', '('));
  });

  test('dashboard figures match v1', async () => {
    const { getDashboardData } = await import('../../../reference/src/lib/sheets/dashboard');
    const v1 = await getDashboardData();
    const v2 = buildDashboard(SCHOOLS.length, ALL_M2);
    // v1 tags each campus with its method; v2 has no methods (D15).
    expect(v2).toEqual({ ...v1, schools: v1.schools.map(({ method: _method, ...rest }: { method: number }) => rest) });
    expect(v2.captured).toBe(3); // 947 (three surveys, latest wins), 499, 107
  });

  test('v2 rows are read by v1 exactly like v1 rows (Source App and RAW typing are invisible to v1)', async () => {
    const id = writtenRows[0]!['Survey ID']!;
    const { findSurvey } = await import('../../../reference/src/lib/export/find-survey');
    const found = (await findSurvey('parity', id))!;
    expect(found.rubricVersion === undefined).toBe(true); // v1's FoundSurvey has no such field…
    expect(found.items).toHaveLength(31); // …but picked the 2026-10-28 list from the row
    expect(found.complaints).toBe('Leaking tank; =SUM(A1)');
    expect(found.siteChecks.riskFactors).toEqual(['Coastal area', 'Any other']);
  });
});
