import PptxGenJS from 'pptxgenjs';
import { listAssumptions } from '@mqi/shared';
import type { Book } from './book';
import { CAP_STATUS_TEXT, bookTitle, campusLines, categoryRows, tbdLines } from './book';
import { int, rs } from '../lib/format';

/** Budget book, PowerPoint (16:9): one table per slide, long lists continue on further slides. */

const BRAND = '0E5C4D';
const DEEP = '123D24';
const SOFT = '4B5C50';
type Cell = { text: string; options?: Record<string, unknown> };
type Row = Cell[];

const head = (cols: string[]): Row => cols.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: BRAND } } }));
const cells = (vals: (string | number)[], opts: Record<string, unknown> = {}): Row => vals.map((v) => ({ text: String(v ?? ''), options: opts }));

export async function budgetPptx(book: Book): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `Budget book — ${bookTitle(book)}`;
  pptx.defineSlideMaster({
    title: 'BOOK',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: 0.12, fill: { color: BRAND } } },
      { text: { text: `TCF R&M Budget — ${bookTitle(book)}`, options: { x: 0.4, y: 7.05, w: 10, h: 0.3, fontSize: 9, color: SOFT } } },
    ],
    slideNumber: { x: 12.4, y: 7.05, fontSize: 9, color: SOFT },
  });

  const titleSlide = pptx.addSlide({ masterName: 'BOOK' });
  titleSlide.addText('TCF R&M Budget', { x: 0.6, y: 2.0, w: 12, h: 0.8, fontSize: 36, bold: true, color: DEEP });
  titleSlide.addText(`Budget book — ${bookTitle(book)}`, { x: 0.6, y: 2.9, w: 12, h: 0.6, fontSize: 22, color: BRAND });
  titleSlide.addText(`MQI surveys ${book.cycle.surveyFrom} to ${book.cycle.surveyTo} (latest per campus) · Rs million · generated ${book.generatedAt.slice(0, 10)}`, { x: 0.6, y: 3.6, w: 12, h: 0.4, fontSize: 13, color: SOFT });

  const table = (title: string, rows: Row[], colW: number[], note?: string) => {
    const slide = pptx.addSlide({ masterName: 'BOOK' });
    slide.addText(title, { x: 0.4, y: 0.25, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: DEEP });
    if (note) slide.addText(note, { x: 0.4, y: 0.75, w: 12.5, h: 0.35, fontSize: 11, color: SOFT });
    slide.addTable(rows as never, {
      x: 0.4,
      y: note ? 1.15 : 0.9,
      w: colW.reduce((a, b) => a + b, 0),
      colW,
      fontSize: 10,
      border: { type: 'solid', pt: 0.5, color: 'DDE5D9' },
      autoPage: true,
      autoPageRepeatHeader: true,
      autoPageHeaderRows: 1,
      autoPageSlideStartY: 0.6,
      newSlideStartY: 0.6,
      margin: 0.04,
    } as never);
  };

  for (const s of book.scenarios) {
    const res = s.result;
    const last = res.lastYearTotal;
    const cats = categoryRows(res);
    const R = { align: 'right' };
    table(
      `${s.scenario.name}: categories`,
      [
        head(['#', 'Category', 'Campuses', 'Siblings', 'TBD', 'Anticipated', 'Rate (Rs M)', 'Budget (Rs M)', 'Cap status', 'Waitlist']),
        ...cats.map((c) => [
          ...cells([c.precedence ?? '', c.name]),
          ...cells([c.kind === 'campus' ? int(c.campuses) : '', c.kind === 'campus' ? int(c.siblings) : '', c.kind === 'campus' ? int(c.tbd) : '', c.kind === 'anticipated' ? (c.lump ? 'Lump sum' : int(c.anticipated)) : '', rs(c.rate), rs(c.budget)], R),
          ...cells([CAP_STATUS_TEXT[c.capStatus] ?? '']),
          ...cells([c.waitlist ? int(c.waitlist) : ''], R),
        ]),
        [
          ...cells(['', 'Total'], { bold: true }),
          ...cells([int(cats.reduce((n, c) => n + c.campuses, 0)), int(cats.reduce((n, c) => n + c.siblings, 0)), int(cats.reduce((n, c) => n + c.tbd, 0)), '', '', rs(res.total)], { ...R, bold: true }),
          ...cells(['', '']),
        ],
      ],
      [0.4, 3.2, 1.0, 0.9, 0.7, 1.1, 1.1, 1.3, 1.8, 0.9],
      `Total Rs ${rs(res.total)}M${last ? ` · last year Rs ${rs(last)}M · change ${res.total - last >= 0 ? '+' : '-'}${rs(Math.abs(res.total - last))}M` : ''}${res.ceiling ? ` · ceiling Rs ${rs(res.ceiling.ceilingRs)}M${res.ceiling.overrun > 0 ? `, over by ${rs(res.ceiling.overrun)}M` : ', within'}` : ''}`,
    );
    if (res.warnings.length) {
      const slide = pptx.addSlide({ masterName: 'BOOK' });
      slide.addText(`${s.scenario.name}: warnings`, { x: 0.4, y: 0.25, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: 'B23A3A' });
      slide.addText(res.warnings.map((w) => ({ text: w, options: { bullet: true } })), { x: 0.4, y: 0.9, w: 12.5, h: 5.8, fontSize: 13, color: '1B241D', valign: 'top' });
    }
    table(
      `${s.scenario.name}: by region and zone`,
      [
        head(['Region', 'Zone', 'Campuses', 'TBD', 'Budget (Rs M)']),
        ...res.regions.map((r) => [...cells([r.region, r.zone]), ...cells([r.campuses ? int(r.campuses) : '', r.tbd ? int(r.tbd) : '', rs(r.budget)], R)]),
        head(['Zone', '', 'Campuses', 'TBD', 'Budget (Rs M)']),
        ...res.zones.map((z) => [...cells([z.zone, '']), ...cells([z.campuses ? int(z.campuses) : '', z.tbd ? int(z.tbd) : '', rs(z.budget)], R)]),
      ],
      [3.5, 2.5, 1.3, 1.0, 1.6],
    );
    const lines = campusLines(res, 'selected', book.zoneOf);
    const tbd = tbdLines(res);
    const ccols = ['Unit', 'Campus', 'ID', 'MQI', 'Band', 'Unsafe', 'Region', 'E-compound', 'Tag', 'Rs M'];
    const cw = [0.5, 3.4, 0.6, 0.7, 0.9, 1.5, 1.4, 1.1, 1.8, 0.7];
    for (const c of res.categories.filter((x) => x.category.kind === 'campus')) {
      const mine = lines.filter((l) => l.category === c.category.name);
      const slots = tbd.filter((t) => t.category === c.category.name);
      if (!mine.length && !slots.length) continue;
      table(
        `${c.category.name}`,
        [
          head(ccols),
          ...mine.map((l) => [...cells([l.unit, l.name, l.campusId]), ...cells([l.score === null ? 'No survey' : `${l.score}%`], R), ...cells([l.band, l.unsafe, l.region, l.eCompoundNo, l.tag]), ...cells([rs(l.rate)], R)]),
          ...slots.map((t) => [...cells(['', t.label, '', '', '', '', '', '', 'TBD'], { italic: true }), ...cells([rs(t.rate)], R)]),
        ],
        cw,
        `${s.scenario.name} · ${int(c.primaries)} campuses, ${int(c.siblings)} siblings, ${int(c.tbd)} TBD · Rs ${rs(c.budget)}M`,
      );
    }
    const waiting = campusLines(res, 'waitlist', book.zoneOf);
    if (waiting.length) {
      table(
        `${s.scenario.name}: waitlist (below the cut-off line)`,
        [head(['Category', ...ccols.slice(0, 8), 'Rs M']), ...waiting.map((l) => [...cells([l.category, l.unit, l.name, l.campusId, l.score === null ? 'No survey' : `${l.score}%`, l.band, l.unsafe, l.region, l.eCompoundNo]), ...cells([rs(l.rate)], R)])],
        [2.0, 0.5, 3.0, 0.6, 0.7, 0.9, 1.4, 1.3, 1.1, 0.7],
      );
    }
    table(
      `${s.scenario.name}: assumption register`,
      [head(['Item', 'Value', 'Source', 'Owner', 'Date', 'Note']), ...listAssumptions(s.scenario.config).map((a) => cells([a.item, a.value, a.meta.source, a.meta.owner, a.meta.date, a.meta.note]))],
      [3.4, 1.3, 2.4, 1.5, 1.1, 2.8],
    );
  }

  if (book.comparison) {
    const cmp = book.comparison;
    const hl = { fill: { color: 'FBEEE1' } };
    const block = (title: string, rows: typeof cmp.budgetByCategory, money: boolean): Row[] => [
      cells([title, ...cmp.names.map(() => '')], { bold: true, color: DEEP }),
      ...rows.map((r) => [...cells([r.label], r.differs ? hl : {}), ...cells(r.values.map((v) => (money ? rs(v) : int(v))), { align: 'right', ...(r.differs ? hl : {}) })]),
    ];
    table(
      'Scenario comparison',
      [
        head(['', ...cmp.names]),
        ...block('Total (Rs M)', [cmp.totals], true),
        ...block('Budget by category (Rs M)', cmp.budgetByCategory, true),
        ...block('Campuses by category', cmp.campusesByCategory, false),
        ...block('Campuses by region', cmp.campusesByRegion, false),
        ...block('Budget by region (Rs M)', cmp.budgetByRegion, true),
      ],
      [4.5, ...cmp.names.map(() => 2.2)],
      'Rows that differ are highlighted.',
    );
  }
  const out = (await pptx.write({ outputType: 'blob', compression: true })) as Blob;
  return out;
}
