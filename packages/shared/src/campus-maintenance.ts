/**
 * W81 (2026-11-20): each campus's last maintenance, for the report, from the engineering team's
 * "Last Maintenance" job sheet (one row per job). The server reads only the columns below and keeps one
 * entry per campus; phones get a campus's entry only when a report is made (campus.details).
 *
 * Counted jobs: Closed & Paid, Closed, Execution (queued / assessment / review / approval / awarding are
 * not maintenance yet). The last maintenance is the campus's job of the latest fiscal year. When that job
 * is an Emergency, the latest Regular or Special job is given too.
 */

export const MAINTENANCE_COLUMNS = ['Campus ID', 'Fiscal Year', 'Job Category', 'Status', 'Contractor', 'Assigned Engineer'] as const;

const COUNTED = new Set(['closed & paid', 'closed', 'execution']);

export interface MaintenanceJob {
  year: string;
  category: string;
  /** "Completed" or "In execution". */
  status: string;
  contractor: string;
  engineer: string;
}

export interface LastMaintenance extends MaintenanceJob {
  /** When the last job was an Emergency: the latest Regular or Special job (absent if none on record). */
  regular?: MaintenanceJob;
}

const get = (r: Record<string, string>, k: string) => String(r[k] ?? '').trim();
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].slice(0, 3).join('; ');

interface Job extends MaintenanceJob {
  order: number;
}

function latestJob(jobs: Job[]): MaintenanceJob | undefined {
  if (!jobs.length) return undefined;
  const year = jobs.map((j) => j.year).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!;
  const inYear = jobs.filter((j) => j.year === year).sort((a, b) => a.order - b.order);
  const last = inYear.at(-1)!;
  // Several jobs of that year and category (one per unit, say): their contractors and engineers together.
  const same = inYear.filter((j) => j.category === last.category);
  return {
    year,
    category: last.category,
    status: same.some((j) => j.status === 'In execution') ? 'In execution' : 'Completed',
    contractor: uniq(same.map((j) => j.contractor)),
    engineer: uniq(same.map((j) => j.engineer)),
  };
}

/** One entry per Campus ID from the job sheet's rows (by header name). */
export function summarizeMaintenance(rows: readonly Record<string, string>[]): Record<string, LastMaintenance> {
  const byCampus = new Map<string, Job[]>();
  rows.forEach((r, order) => {
    const id = get(r, 'Campus ID');
    const year = get(r, 'Fiscal Year');
    const status = get(r, 'Status').toLowerCase();
    if (!id || !year || !COUNTED.has(status)) return;
    const list = byCampus.get(id) ?? [];
    list.push({
      order,
      year,
      category: get(r, 'Job Category'),
      status: status === 'execution' ? 'In execution' : 'Completed',
      contractor: get(r, 'Contractor'),
      engineer: get(r, 'Assigned Engineer'),
    });
    byCampus.set(id, list);
  });
  const out: Record<string, LastMaintenance> = {};
  for (const [id, jobs] of byCampus) {
    const last = latestJob(jobs)!;
    const entry: LastMaintenance = { ...last };
    if (/^emergency$/i.test(last.category)) {
      const regular = latestJob(jobs.filter((j) => !/^emergency$/i.test(j.category)));
      if (regular) entry.regular = regular;
    }
    out[id] = entry;
  }
  return out;
}

/** "2025-26 Emergency (in execution) · Contractor · Engineer: X" for the report. */
export function maintenanceText(j: MaintenanceJob | undefined): string {
  if (!j) return '';
  const head = [j.year, j.category].filter(Boolean).join(' ') + (j.status && j.status !== 'Completed' ? ` (${j.status.toLowerCase()})` : '');
  return [head, j.contractor, j.engineer && `Engineer: ${j.engineer}`].filter(Boolean).join(' · ');
}
