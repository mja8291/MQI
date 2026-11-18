import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { defaultScenarioConfig } from '@mqi/shared';
import type { BudgetCampus, BudgetCampusesResult, Scenario } from '@mqi/shared';
import { buildBook } from './book';
import { budgetXlsx } from './xlsx';
import { budgetPdf } from './pdf';
import { budgetPptx } from './pptx';

const campus = (campusId: string, score: number | null, band: BudgetCampus['band'], extra: Partial<BudgetCampus> = {}): BudgetCampus => ({
  campusId,
  name: `Campus ${campusId}`,
  region: 'South',
  area: 'Area',
  eCompoundNo: '',
  score,
  band,
  unsafe: null,
  ...extra,
});

const campuses: BudgetCampusesResult = {
  campuses: [
    campus('1', 30, 'Poor', { eCompoundNo: 'EC1' }),
    campus('2', 90, 'Excellent', { eCompoundNo: 'EC1' }),
    campus('3', 60, 'Average', { region: 'North' }),
    campus('4', 70, 'Good', { unsafe: 'critical' }),
    campus('5', 55, 'Average'),
  ],
  summary: { campuses: 5, noECompound: 3, noSurvey: 0, surveyedNotInMaster: 0 },
  generatedAt: '2026-11-18T00:00:00.000Z',
};

function scenario(name: string, poorRate: number): Scenario {
  const config = defaultScenarioConfig();
  const set = (id: string, v: number) => (config.categories.find((c) => c.id === id)!.lastYearRate = v);
  set('critical', 6.5);
  set('poor', poorRate);
  set('average', 1.8);
  config.categories.find((c) => c.id === 'average')!.capCount = 1;
  config.categories.find((c) => c.id === 'poor')!.tbdCount = 2;
  config.categories.find((c) => c.id === 'emergencies')!.count = 10;
  set('emergencies', 0.75);
  config.categories.find((c) => c.id === 'special')!.lumpSum = 20;
  config.inflationPct = 10;
  return { id: name, cycleId: 'c', name, status: 'Draft', config };
}

const cycle = { id: 'c', name: 'FY 2027-28', surveyFrom: '2026-07-01', surveyTo: '2027-06-30' };

describe('budget book', () => {
  const book = buildBook(cycle, [scenario('Base', 2.5), scenario('Lean', 2)], campuses, [{ region: 'South', zone: 'Zone S' }]);
  const base = book.scenarios[0]!.result;

  it('Excel: category budgets are live formulas whose cached results match the dashboard', async () => {
    const blob = await budgetXlsx(book);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(['S1 Summary', 'S1 Campuses', 'S1 Regions', 'S1 Waitlist', 'S1 Assumptions', 'S2 Summary', 'Comparison']));
    const ws = wb.getWorksheet('S1 Summary')!;
    const rows = new Map<string, ExcelJS.Row>();
    ws.eachRow((r) => rows.set(String(r.getCell(1).value), r));
    for (const c of base.categories) {
      const r = rows.get(c.category.name)!;
      const budget = r.getCell(8).value as { formula: string; result: number };
      expect(budget.formula).toMatch(/^\(C\d+\+D\d+\+E\d+\+F\d+\)\*G\d+$/);
      // exceljs drops a cached result of 0; Excel recalculates on open (fullCalcOnLoad).
      expect(budget.result ?? 0).toBeCloseTo(c.budget, 2);
    }
    const total = rows.get('Total')!.getCell(8).value as { formula: string; result: number };
    expect(total.formula).toMatch(/^SUM\(H5:H\d+\)$/);
    expect(total.result).toBeCloseTo(base.total, 2);
    // Campus counts come from the Campuses sheet; the sibling is counted as a sibling.
    const poor = rows.get('Poor')!;
    expect((poor.getCell(3).value as { formula: string }).formula).toContain("COUNTIFS('S1 Campuses'!$A:$A");
    expect((poor.getCell(4).value as { result: number }).result).toBe(1);
    expect((poor.getCell(5).value as { result: number }).result).toBe(2);
    // The waitlisted Average campus is on the Waitlist sheet.
    const wl = wb.getWorksheet('S1 Waitlist')!;
    const waitIds: string[] = [];
    wl.eachRow((r, n) => n > 4 && waitIds.push(String(r.getCell(3).value)));
    expect(waitIds).toEqual(['3']);
  });

  it('PDF and PowerPoint build', async () => {
    const pdf = await PDFDocument.load(await (await budgetPdf(book)).arrayBuffer());
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    const pptx = await budgetPptx(book);
    expect(pptx.size).toBeGreaterThan(20_000);
  });
});
