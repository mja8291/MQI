import ExcelJS from 'exceljs';
import { listAssumptions } from '@mqi/shared';
import type { Book, BookScenario } from './book';
import { CAP_STATUS_TEXT, bookTitle, campusLines, categoryRows, r2, tbdLines } from './book';

/**
 * Budget book, Excel. The category table keeps live formulas (campus counts from the Campuses sheet,
 * budget = (campuses + siblings + TBD + anticipated count) × rate, totals and change vs last year),
 * so finance can change a rate or remove a campus in the meeting and the totals follow.
 */

const HEAD: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E5C4D' } },
  alignment: { vertical: 'middle', wrapText: true },
};
const MONEY = '#,##0.00';

function header(ws: ExcelJS.Worksheet, row: number, cols: string[]) {
  const r = ws.getRow(row);
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1);
    cell.value = c;
    Object.assign(cell, { style: HEAD });
  });
  r.height = 30;
}

function title(ws: ExcelJS.Worksheet, text: string, sub: string) {
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF123D24' } };
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF4B5C50' } };
}

const q = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

function scenarioSheets(wb: ExcelJS.Workbook, book: Book, s: BookScenario, prefix: string) {
  const res = s.result;
  const names = { summary: `${prefix}Summary`, campuses: `${prefix}Campuses`, regions: `${prefix}Regions`, waitlist: `${prefix}Waitlist`, assumptions: `${prefix}Assumptions` };
  const sub = `${book.cycle.name} · scenario "${s.scenario.name}" · MQI surveys ${book.cycle.surveyFrom} to ${book.cycle.surveyTo} · Rs million`;

  // Summary is the first tab; its counts are filled from the Campuses sheet below.
  const ws = wb.addWorksheet(names.summary, { views: [{ state: 'frozen', ySplit: 4 }] });
  const cw = wb.addWorksheet(names.campuses, { views: [{ state: 'frozen', ySplit: 4 }] });
  title(cw, `Campuses per category — ${s.scenario.name}`, sub);
  const ccols = ['Category', 'Unit', 'Campus ID', 'Campus', 'Region', 'Zone', 'Area', 'E-compound', 'MQI %', 'Band', 'Unsafe', 'Role', 'Tag', 'Rate (Rs M)'];
  header(cw, 4, ccols);
  const lines = campusLines(res, 'selected', book.zoneOf);
  const tbd = tbdLines(res);
  let row = 5;
  for (const l of lines) {
    cw.getRow(row).values = [l.category, l.unit, l.campusId, l.name, l.region, l.zone, l.area, l.eCompoundNo, l.score ?? 'No survey', l.band, l.unsafe, l.role, l.tag];
    cw.getCell(row, 14).value = { formula: `VLOOKUP(A${row},${q(names.summary)}!$A:$G,7,FALSE)`, result: r2(l.rate) };
    cw.getCell(row, 14).numFmt = MONEY;
    row++;
  }
  for (const t of tbd) {
    cw.getRow(row).values = [t.category, '', '', t.label, '', '', '', '', '', '', '', 'TBD', 'TBD'];
    cw.getCell(row, 14).value = { formula: `VLOOKUP(A${row},${q(names.summary)}!$A:$G,7,FALSE)`, result: r2(t.rate) };
    cw.getCell(row, 14).numFmt = MONEY;
    row++;
  }
  [26, 6, 10, 38, 16, 12, 18, 12, 8, 10, 18, 9, 26, 12].forEach((w, i) => (cw.getColumn(i + 1).width = w));

  // Summary with live formulas.
  title(ws, `Budget book — ${bookTitle(book)}`, sub);
  const cols = ['Category', 'Precedence', 'Campuses', 'Siblings', 'TBD', 'Anticipated count', 'Rate (Rs M)', 'Budget (Rs M)', 'Cap (projects)', 'Cap (Rs M)', 'Cap status', 'Waitlist'];
  header(ws, 4, cols);
  const cats = categoryRows(res);
  const C = q(names.campuses);
  cats.forEach((c, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = c.name;
    ws.getCell(r, 2).value = c.precedence ?? '';
    if (c.kind === 'campus') {
      ws.getCell(r, 3).value = { formula: `COUNTIFS(${C}!$A:$A,$A${r},${C}!$L:$L,"Primary")`, result: c.campuses };
      ws.getCell(r, 4).value = { formula: `COUNTIFS(${C}!$A:$A,$A${r},${C}!$L:$L,"Sibling")`, result: c.siblings };
      ws.getCell(r, 5).value = { formula: `COUNTIFS(${C}!$A:$A,$A${r},${C}!$L:$L,"TBD")`, result: c.tbd };
      ws.getCell(r, 6).value = 0;
    } else {
      ws.getCell(r, 3).value = 0;
      ws.getCell(r, 4).value = 0;
      ws.getCell(r, 5).value = 0;
      ws.getCell(r, 6).value = c.anticipated;
    }
    ws.getCell(r, 7).value = r2(c.rate);
    ws.getCell(r, 7).numFmt = MONEY;
    ws.getCell(r, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } };
    ws.getCell(r, 8).value = { formula: `(C${r}+D${r}+E${r}+F${r})*G${r}`, result: r2(c.budget) };
    ws.getCell(r, 8).numFmt = MONEY;
    ws.getCell(r, 9).value = c.capCount ?? '';
    ws.getCell(r, 10).value = c.capRs ?? '';
    ws.getCell(r, 11).value = CAP_STATUS_TEXT[c.capStatus] ?? '';
    ws.getCell(r, 12).value = c.waitlist || '';
  });
  const first = 5;
  const last = 4 + cats.length;
  const tr = last + 1;
  ws.getCell(tr, 1).value = 'Total';
  for (const col of [3, 4, 5, 6, 8]) {
    const L = String.fromCharCode(64 + col);
    const total = col === 8 ? r2(res.total) : cats.reduce((n, c) => n + (col === 3 ? c.campuses : col === 4 ? c.siblings : col === 5 ? c.tbd : c.anticipated), 0);
    ws.getCell(tr, col).value = { formula: `SUM(${L}${first}:${L}${last})`, result: total };
    if (col === 8) ws.getCell(tr, col).numFmt = MONEY;
  }
  ws.getRow(tr).font = { bold: true };
  const lyRow = tr + 2;
  ws.getCell(lyRow, 1).value = "Last year's total (Rs M)";
  ws.getCell(lyRow, 8).value = res.lastYearTotal ?? 0;
  ws.getCell(lyRow, 8).numFmt = MONEY;
  ws.getCell(lyRow + 1, 1).value = 'Change vs last year (Rs M)';
  ws.getCell(lyRow + 1, 8).value = { formula: `H${tr}-H${lyRow}`, result: r2(res.total - (res.lastYearTotal ?? 0)) };
  ws.getCell(lyRow + 1, 8).numFmt = MONEY;
  if (res.ceiling) {
    ws.getCell(lyRow + 2, 1).value = 'Overall ceiling (Rs M)';
    ws.getCell(lyRow + 2, 8).value = res.ceiling.ceilingRs;
    ws.getCell(lyRow + 3, 1).value = 'Over the ceiling (Rs M)';
    ws.getCell(lyRow + 3, 8).value = { formula: `MAX(0,H${tr}-H${lyRow + 2})`, result: r2(res.ceiling.overrun) };
    ws.getCell(lyRow + 3, 8).numFmt = MONEY;
  }
  ws.getCell(lyRow + 5, 1).value = 'Rates (yellow) can be changed: counts come from the Campuses sheet and budgets recalculate. Siblings are costed at their host category\'s rate.';
  ws.getCell(lyRow + 5, 1).font = { italic: true, color: { argb: 'FF4B5C50' } };
  if (res.warnings.length) {
    ws.getCell(lyRow + 7, 1).value = 'Warnings';
    ws.getCell(lyRow + 7, 1).font = { bold: true, color: { argb: 'FFB23A3A' } };
    res.warnings.forEach((w, i) => (ws.getCell(lyRow + 8 + i, 1).value = w));
  }
  [34, 11, 11, 10, 8, 12, 12, 14, 12, 12, 20, 10, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Regions and zones.
  const rw = wb.addWorksheet(names.regions);
  title(rw, `Region and zone breakdown — ${s.scenario.name}`, sub);
  header(rw, 4, ['Region', 'Zone', 'Campuses', 'TBD', 'Budget (Rs M)']);
  res.regions.forEach((r, i) => {
    rw.getRow(5 + i).values = [r.region, r.zone, r.campuses, r.tbd, r2(r.budget)];
    rw.getCell(5 + i, 5).numFmt = MONEY;
  });
  const zr = 7 + res.regions.length;
  header(rw, zr, ['Zone', '', 'Campuses', 'TBD', 'Budget (Rs M)']);
  res.zones.forEach((z, i) => {
    rw.getRow(zr + 1 + i).values = [z.zone, '', z.campuses, z.tbd, r2(z.budget)];
    rw.getCell(zr + 1 + i, 5).numFmt = MONEY;
  });
  [28, 16, 11, 8, 14].forEach((w, i) => (rw.getColumn(i + 1).width = w));

  // Waitlist.
  const wl = wb.addWorksheet(names.waitlist);
  title(wl, `Waitlist (below the cut-off line) — ${s.scenario.name}`, sub);
  header(wl, 4, ['Category', 'Unit', 'Campus ID', 'Campus', 'Region', 'Zone', 'E-compound', 'MQI %', 'Band', 'Role', 'Tag', 'Rate (Rs M)']);
  campusLines(res, 'waitlist', book.zoneOf).forEach((l, i) => {
    wl.getRow(5 + i).values = [l.category, l.unit, l.campusId, l.name, l.region, l.zone, l.eCompoundNo, l.score ?? 'No survey', l.band, l.role, l.tag, r2(l.rate)];
  });
  [26, 6, 10, 38, 16, 12, 12, 8, 10, 9, 26, 12].forEach((w, i) => (wl.getColumn(i + 1).width = w));

  // Assumption register.
  const aw = wb.addWorksheet(names.assumptions);
  title(aw, `Assumption register — ${s.scenario.name}`, sub);
  header(aw, 4, ['Item', 'Value', 'Source', 'Owner', 'Date', 'Note']);
  listAssumptions(s.scenario.config).forEach((a, i) => {
    aw.getRow(5 + i).values = [a.item, a.value, a.meta.source, a.meta.owner, a.meta.date, a.meta.note];
  });
  [40, 16, 30, 18, 12, 40].forEach((w, i) => (aw.getColumn(i + 1).width = w));
}

export async function budgetXlsx(book: Book): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TCF R&M Budget';
  wb.created = new Date(book.generatedAt);
  wb.calcProperties.fullCalcOnLoad = true;
  book.scenarios.forEach((s, i) => scenarioSheets(wb, book, s, book.scenarios.length > 1 ? `S${i + 1} ` : ''));
  if (book.comparison) {
    const cmp = book.comparison;
    const ws = wb.addWorksheet('Comparison');
    title(ws, `Scenario comparison — ${book.cycle.name}`, `Rows that differ are highlighted · Rs million`);
    header(ws, 4, ['', ...cmp.names]);
    let r = 5;
    const block = (heading: string, rows: typeof cmp.budgetByCategory, money: boolean) => {
      ws.getCell(r, 1).value = heading;
      ws.getCell(r, 1).font = { bold: true, color: { argb: 'FF123D24' } };
      r++;
      for (const x of rows) {
        ws.getRow(r).values = [x.label, ...x.values.map((v) => (money ? r2(v) : v))];
        if (money) x.values.forEach((_, i) => (ws.getCell(r, i + 2).numFmt = MONEY));
        if (x.differs) ws.getRow(r).eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBEEE1' } }));
        r++;
      }
      r++;
    };
    block('Total', [cmp.totals], true);
    block('Budget by category (Rs M)', cmp.budgetByCategory, true);
    block('Campuses by category (incl. siblings and TBD)', cmp.campusesByCategory, false);
    block('Campuses by region', cmp.campusesByRegion, false);
    block('Budget by region (Rs M)', cmp.budgetByRegion, true);
    ws.getColumn(1).width = 40;
    cmp.names.forEach((_, i) => (ws.getColumn(i + 2).width = 18));
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
