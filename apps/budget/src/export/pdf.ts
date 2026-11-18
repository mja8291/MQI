import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { listAssumptions } from '@mqi/shared';
import type { Book } from './book';
import { CAP_STATUS_TEXT, bookTitle, campusLines, categoryRows, tbdLines } from './book';
import { int, rs } from '../lib/format';

/** Budget book, PDF (A4 landscape): the same tables as the Excel and the dashboard. */

const W = 842;
const H = 595;
const M = 36;
const BRAND = rgb(0.055, 0.36, 0.3);
const INK = rgb(0.1, 0.14, 0.11);
const SOFT = rgb(0.3, 0.36, 0.31);
const LINE = rgb(0.87, 0.9, 0.85);
const AMBER = rgb(0.98, 0.93, 0.88);

/** Standard fonts only encode WinAnsi: replace what they can't draw. */
function safe(s: string): string {
  return s
    .replace(/[−]/g, '-')
    .replace(/[→]/g, '->')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\u00D7]/g, '?');
}

interface Col {
  title: string;
  width: number;
  align?: 'right';
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.y = H - M;
    this.page.drawText(safe(this.footer), { x: M, y: 18, size: 7.5, font: this.font, color: SOFT });
    this.page.drawText(`Page ${this.doc.getPageCount()}`, { x: W - M - 40, y: 18, size: 7.5, font: this.font, color: SOFT });
  }
  ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }
  text(s: string, size = 9, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    this.ensure(size + 4);
    this.page.drawText(safe(s), { x: M, y: this.y - size, size, font: opts.bold ? this.bold : this.font, color: opts.color ?? INK, maxWidth: W - 2 * M });
    this.y -= size + (opts.gap ?? 5);
  }
  heading(s: string) {
    this.ensure(60);
    this.y -= 6;
    this.text(s, 13, { bold: true, color: BRAND, gap: 8 });
  }
  private clip(s: string, width: number, size: number, f: PDFFont): string {
    let t = safe(s);
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > width - 6) t = t.slice(0, -2) + '…';
    return t;
  }
  table(cols: Col[], rows: (string | number)[][], opts: { boldLast?: boolean; highlight?: (i: number) => boolean } = {}) {
    const size = 8;
    const rowH = 13;
    const drawHead = () => {
      this.ensure(rowH * 2);
      let x = M;
      this.page.drawRectangle({ x: M, y: this.y - rowH, width: cols.reduce((n, c) => n + c.width, 0), height: rowH, color: BRAND });
      for (const c of cols) {
        const t = this.clip(c.title, c.width, size, this.bold);
        const tx = c.align === 'right' ? x + c.width - 3 - this.bold.widthOfTextAtSize(t, size) : x + 3;
        this.page.drawText(t, { x: tx, y: this.y - rowH + 4, size, font: this.bold, color: rgb(1, 1, 1) });
        x += c.width;
      }
      this.y -= rowH;
    };
    drawHead();
    rows.forEach((r, i) => {
      if (this.y - rowH < M) {
        this.newPage();
        drawHead();
      }
      const isBold = opts.boldLast && i === rows.length - 1;
      const f = isBold ? this.bold : this.font;
      const total = cols.reduce((n, c) => n + c.width, 0);
      if (opts.highlight?.(i)) this.page.drawRectangle({ x: M, y: this.y - rowH, width: total, height: rowH, color: AMBER });
      let x = M;
      cols.forEach((c, j) => {
        const t = this.clip(String(r[j] ?? ''), c.width, size, f);
        const tx = c.align === 'right' ? x + c.width - 3 - f.widthOfTextAtSize(t, size) : x + 3;
        this.page.drawText(t, { x: tx, y: this.y - rowH + 4, size, font: f, color: INK });
        x += c.width;
      });
      this.page.drawLine({ start: { x: M, y: this.y - rowH }, end: { x: M + total, y: this.y - rowH }, thickness: 0.5, color: LINE });
      this.y -= rowH;
    });
    this.y -= 8;
  }
}

export async function budgetPdf(book: Book): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Budget book — ${bookTitle(book)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, `TCF R&M Budget — ${bookTitle(book)} — generated ${book.generatedAt.slice(0, 10)}`);

  w.text('TCF R&M Budget', 20, { bold: true, color: BRAND, gap: 10 });
  w.text(`Budget book — ${bookTitle(book)}`, 14, { bold: true, gap: 8 });
  w.text(`MQI surveys from ${book.cycle.surveyFrom} to ${book.cycle.surveyTo} (latest per campus). MQI figures as of ${book.mqiAsOf.slice(0, 16).replace('T', ' ')}. Amounts in Rs million.`, 9, { color: SOFT });

  for (const s of book.scenarios) {
    const res = s.result;
    w.heading(`Scenario: ${s.scenario.name}`);
    const last = res.lastYearTotal;
    w.text(`Total budget Rs ${rs(res.total)}M${last ? ` · last year Rs ${rs(last)}M · change ${res.total - last >= 0 ? '+' : '-'}${rs(Math.abs(res.total - last))}M` : ''}${res.ceiling ? ` · ceiling Rs ${rs(res.ceiling.ceilingRs)}M${res.ceiling.overrun > 0 ? ` (over by ${rs(res.ceiling.overrun)}M)` : ' (within)'}` : ''}`, 10, { bold: true });
    for (const warn of res.warnings) w.text(`! ${warn}`, 8.5, { color: rgb(0.7, 0.23, 0.23) });
    const cats = categoryRows(res);
    w.table(
      [
        { title: '#', width: 22 },
        { title: 'Category', width: 170 },
        { title: 'Campuses', width: 58, align: 'right' },
        { title: 'Siblings', width: 52, align: 'right' },
        { title: 'TBD', width: 40, align: 'right' },
        { title: 'Anticipated', width: 62, align: 'right' },
        { title: 'Rate (Rs M)', width: 66, align: 'right' },
        { title: 'Budget (Rs M)', width: 76, align: 'right' },
        { title: 'Cap', width: 90 },
        { title: 'Cap status', width: 100 },
        { title: 'Waitlist', width: 50, align: 'right' },
      ],
      [
        ...cats.map((c) => [
          c.precedence ?? '',
          c.name,
          c.kind === 'campus' ? int(c.campuses) : '',
          c.kind === 'campus' ? int(c.siblings) : '',
          c.kind === 'campus' ? int(c.tbd) : '',
          c.kind === 'anticipated' ? (c.lump ? 'Lump sum' : int(c.anticipated)) : '',
          rs(c.rate),
          rs(c.budget),
          [c.capCount != null ? `${c.capCount} projects` : '', c.capRs != null ? `Rs ${rs(c.capRs)}M` : ''].filter(Boolean).join(' / '),
          CAP_STATUS_TEXT[c.capStatus] ?? '',
          c.waitlist ? int(c.waitlist) : '',
        ]),
        ['', 'Total', int(cats.reduce((n, c) => n + c.campuses, 0)), int(cats.reduce((n, c) => n + c.siblings, 0)), int(cats.reduce((n, c) => n + c.tbd, 0)), '', '', rs(res.total), '', '', ''],
      ],
      { boldLast: true },
    );

    w.heading(`Region and zone breakdown — ${s.scenario.name}`);
    w.table(
      [
        { title: 'Region', width: 200 },
        { title: 'Zone', width: 140 },
        { title: 'Campuses', width: 70, align: 'right' },
        { title: 'TBD', width: 60, align: 'right' },
        { title: 'Budget (Rs M)', width: 90, align: 'right' },
      ],
      res.regions.map((r) => [r.region, r.zone, r.campuses ? int(r.campuses) : '', r.tbd ? int(r.tbd) : '', rs(r.budget)]),
    );
    w.table(
      [
        { title: 'Zone', width: 340 },
        { title: 'Campuses', width: 70, align: 'right' },
        { title: 'TBD', width: 60, align: 'right' },
        { title: 'Budget (Rs M)', width: 90, align: 'right' },
      ],
      res.zones.map((z) => [z.zone, z.campuses ? int(z.campuses) : '', z.tbd ? int(z.tbd) : '', rs(z.budget)]),
    );

    const campusCols: Col[] = [
      { title: 'Unit', width: 30, align: 'right' },
      { title: 'Campus', width: 200 },
      { title: 'ID', width: 40 },
      { title: 'MQI', width: 40, align: 'right' },
      { title: 'Band', width: 55 },
      { title: 'Unsafe', width: 90 },
      { title: 'Region', width: 85 },
      { title: 'E-compound', width: 65 },
      { title: 'Tag', width: 120 },
      { title: 'Rs M', width: 45, align: 'right' },
    ];
    const lines = campusLines(res, 'selected', book.zoneOf);
    const tbd = tbdLines(res);
    for (const c of res.categories.filter((x) => x.category.kind === 'campus')) {
      const mine = lines.filter((l) => l.category === c.category.name);
      const slots = tbd.filter((t) => t.category === c.category.name);
      if (!mine.length && !slots.length) continue;
      w.heading(`${c.category.name} — ${int(c.primaries)} campuses, ${int(c.siblings)} siblings, ${int(c.tbd)} TBD — Rs ${rs(c.budget)}M`);
      w.table(campusCols, [
        ...mine.map((l) => [l.unit, l.name, l.campusId, l.score === null ? 'No survey' : `${l.score}%`, l.band, l.unsafe, l.region, l.eCompoundNo, l.tag, rs(l.rate)]),
        ...slots.map((t) => ['', t.label, '', '', '', '', '', '', 'TBD', rs(t.rate)]),
      ]);
    }
    const waiting = campusLines(res, 'waitlist', book.zoneOf);
    if (waiting.length) {
      w.heading(`Waitlist (below the cut-off line) — ${s.scenario.name}`);
      w.table([{ title: 'Category', width: 120 }, ...campusCols.slice(0, 8), { title: 'Rs M', width: 45, align: 'right' }], waiting.map((l) => [l.category, l.unit, l.name, l.campusId, l.score === null ? 'No survey' : `${l.score}%`, l.band, l.unsafe, l.region, l.eCompoundNo, rs(l.rate)]));
    }
    w.heading(`Assumption register — ${s.scenario.name}`);
    w.table(
      [
        { title: 'Item', width: 220 },
        { title: 'Value', width: 80 },
        { title: 'Source', width: 150 },
        { title: 'Owner', width: 90 },
        { title: 'Date', width: 60 },
        { title: 'Note', width: 170 },
      ],
      listAssumptions(s.scenario.config).map((a) => [a.item, a.value, a.meta.source, a.meta.owner, a.meta.date, a.meta.note]),
    );
  }

  if (book.comparison) {
    const cmp = book.comparison;
    w.heading('Scenario comparison (rows that differ are highlighted)');
    const cols: Col[] = [{ title: '', width: 260 }, ...cmp.names.map((n) => ({ title: n, width: 120, align: 'right' as const }))];
    const block = (title: string, rows: typeof cmp.budgetByCategory, money: boolean) => {
      w.text(title, 9.5, { bold: true, color: BRAND });
      w.table(cols, rows.map((r) => [r.label, ...r.values.map((v) => (money ? rs(v) : int(v)))]), { highlight: (i) => rows[i]!.differs });
    };
    block('Total (Rs M)', [cmp.totals], true);
    block('Budget by category (Rs M)', cmp.budgetByCategory, true);
    block('Campuses by category (incl. siblings and TBD)', cmp.campusesByCategory, false);
    block('Campuses by region', cmp.campusesByRegion, false);
    block('Budget by region (Rs M)', cmp.budgetByRegion, true);
  }
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
