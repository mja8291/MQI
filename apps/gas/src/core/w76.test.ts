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
