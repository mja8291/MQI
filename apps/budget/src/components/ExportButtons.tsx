import { useState } from 'react';
import type { BudgetCampusesResult, BudgetCycle, RegionZone, Scenario } from '@mqi/shared';
import { buildBook } from '../export/book';
import { download, slug } from '../lib/format';
import { errorText } from '../lib/api';

type Format = 'xlsx' | 'pptx' | 'pdf';

/** Budget book in Excel, PowerPoint or PDF. The builders load only when used. */
export function ExportButtons({ cycle, scenarios, campuses, zones }: { cycle: BudgetCycle; scenarios: Scenario[]; campuses: BudgetCampusesResult; zones: RegionZone[] }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [msg, setMsg] = useState('');
  const run = async (f: Format) => {
    setBusy(f);
    setMsg('');
    try {
      const book = buildBook(cycle, scenarios, campuses, zones);
      const name = `Budget-book-${slug(cycle.name)}-${slug(scenarios.map((s) => s.name).join('-vs-'))}`.slice(0, 120);
      const blob =
        f === 'xlsx'
          ? await (await import('../export/xlsx')).budgetXlsx(book)
          : f === 'pptx'
            ? await (await import('../export/pptx')).budgetPptx(book)
            : await (await import('../export/pdf')).budgetPdf(book);
      download(blob, `${name}.${f}`);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-[12.5px] text-ink-soft mr-1">Budget book:</span>
      {(['xlsx', 'pptx', 'pdf'] as Format[]).map((f) => (
        <button key={f} type="button" className="btn" disabled={busy !== null} onClick={() => run(f)} data-testid={`export-${f}`}>
          {busy === f ? 'Building…' : f === 'xlsx' ? 'Excel' : f === 'pptx' ? 'PowerPoint' : 'PDF'}
        </button>
      ))}
      {msg ? <span className="text-warn text-[12.5px]">{msg}</span> : null}
    </span>
  );
}
