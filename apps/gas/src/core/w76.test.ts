import { describe, expect, test } from 'vitest';
import { MemorySystemDb } from '../adapters/memory';
import { Table } from './system';

/** W76 (2026-11-17): one-row lookups for photo reads, without reading the whole Files register. */
describe('Table.lookup', () => {
  const db = new MemorySystemDb();
  const port = db.createTable('Files', ['attachmentId', 'surveyId', 'driveFileId']);
  port.append(Array.from({ length: 50 }, (_, i) => [`a${i}`, `s${i % 3}`, `d${i}`]));

  test('finds the row, or nothing, reading only that row', () => {
    let reads = 0;
    const counting = { ...port, header: () => port.header(), lastRow: () => port.lastRow(), findRow: (c: number, v: string) => port.findRow(c, v), removeRow: (r: number) => port.removeRow(r), write: (r: number, x: string[][]) => port.write(r, x), append: (x: string[][]) => port.append(x), setHeader: (h: string[]) => port.setHeader(h), name: port.name, read: (r: number, n: number, w: number) => ((reads += n), port.read(r, n, w)) };
    const t = new Table(counting, 'attachmentId');
    expect(t.lookup('a37')).toEqual({ attachmentId: 'a37', surveyId: 's1', driveFileId: 'd37' });
    expect(reads).toBe(1);
    expect(t.lookup('nope')).toBeUndefined();
    expect(t.lookup('a3')).toEqual({ attachmentId: 'a3', surveyId: 's0', driveFileId: 'd3' }); // exact match, not "a37"
  });

  test('matches get() for every key', () => {
    const a = new Table(port, 'attachmentId');
    for (let i = 0; i < 50; i += 7) expect(new Table(port, 'attachmentId').lookup(`a${i}`)).toEqual(a.get(`a${i}`));
  });
});

describe('W81 campus.details', () => {
  test('one campus with its details and last maintenance; the phones\' campus list stays lean', async () => {
    const { API_VERSION } = await import('@mqi/shared');
    const { createMemoryEnv } = await import('../adapters/memory');
    const { DEV_PASSWORD, seedDevEnv } = await import('../dev/server');
    const { handleRequest } = await import('./router');
    const env = createMemoryEnv();
    seedDevEnv(env);
    env.schools.maintenance = [
      { 'Campus ID': '947', 'Fiscal Year': '2023-24', 'Job Category': 'Regular', Status: 'Closed & Paid', Contractor: 'A', 'Assigned Engineer': 'X' },
      { 'Campus ID': '947', 'Fiscal Year': '2025-26', 'Job Category': 'Emergency', Status: 'Closed', Contractor: 'B', 'Assigned Engineer': 'Y' },
    ];
    const call = (action: string, payload: unknown, session?: string) =>
      handleRequest(env, JSON.stringify({ action, apiVersion: API_VERSION, auth: session ? { session } : undefined, payload })) as unknown as { ok: boolean; data: never };
    const s = (call('auth.login', { email: 'surveyor@tcf.test', password: DEV_PASSWORD }).data as { sessionToken: string }).sessionToken;
    const d = call('campus.details', { schoolId: '947' }, s).data as { campus: Record<string, string> };
    expect(d.campus).toMatchObject({ eCompoundNo: 'S/1/10', lastMaintenance: '2025-26 Emergency · B · Engineer: Y', lastRegular: '2023-24 Regular · A · Engineer: X' });
    expect(d.campus.siblings).toContain('OGS Trust Campus II');
    const list = (call('schools.list', {}, s).data as { schools: Record<string, unknown>[] }).schools;
    expect(list.some((x) => 'cluster' in x || 'buildDonor' in x || 'schoolTypes' in x)).toBe(false);
  });
});
