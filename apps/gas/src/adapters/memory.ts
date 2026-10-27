import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Cell } from '@mqi/shared';
import type { CachePort, CryptoPort, DrivePort, Env, LockPort, PropsPort, ResponsesPort, SchoolsPort, SystemDbPort, TablePort } from '../core/ports';

/**
 * In-memory implementations of the ports: the server tests and the local dev API run the real
 * core against these. Faults can be injected to test idempotency and recovery.
 */

class MemoryTable implements TablePort {
  rows: string[][] = [];
  constructor(readonly name: string) {}
  header(): string[] {
    return [...(this.rows[0] ?? [])];
  }
  setHeader(cols: string[]): void {
    this.rows[0] = [...cols];
  }
  lastRow(): number {
    return this.rows.length;
  }
  read(startRow: number, numRows: number, width: number): string[][] {
    return this.rows.slice(startRow - 1, startRow - 1 + numRows).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  }
  write(startRow: number, rows: string[][]): void {
    rows.forEach((r, i) => (this.rows[startRow - 1 + i] = [...r]));
  }
  append(rows: string[][]): number {
    const first = this.rows.length + 1;
    this.rows.push(...rows.map((r) => [...r]));
    return first;
  }
}

export class MemorySystemDb implements SystemDbPort {
  tables = new Map<string, MemoryTable>();
  table(name: string): TablePort | null {
    return this.tables.get(name) ?? null;
  }
  createTable(name: string, header: string[]): TablePort {
    const t = new MemoryTable(name);
    t.setHeader(header);
    this.tables.set(name, t);
    return t;
  }
}

export class MemoryResponses implements ResponsesPort {
  tabs = new Map<string, Cell[][]>();
  appendCalls = 0;
  /** Simulates a lost response: the next append lands, then the call throws. */
  failAfterNextAppend = false;
  /** Simulates the RAW write mode: every cell is stored exactly as sent. */
  rawWrites: { tab: string; rows: Cell[][] }[] = [];

  header(tab: string): string[] | null {
    const t = this.tabs.get(tab);
    return t ? (t[0] ?? []).map(String) : null;
  }
  createTab(tab: string, header: string[]): void {
    this.tabs.set(tab, [[...header]]);
  }
  addColumns(tab: string, columns: string[]): void {
    const t = this.tabs.get(tab);
    if (!t) throw new Error(`No tab ${tab}`);
    t[0] = [...(t[0] ?? []), ...columns];
  }
  appendRaw(tab: string, rows: Cell[][]): void {
    const t = this.tabs.get(tab);
    if (!t) throw new Error(`No tab ${tab}`);
    this.appendCalls++;
    t.push(...rows.map((r) => [...r]));
    this.rawWrites.push({ tab, rows });
    if (this.failAfterNextAppend) {
      this.failAfterNextAppend = false;
      throw new Error('Simulated timeout after the append landed');
    }
  }
  lastRow(tab: string): number {
    return this.tabs.get(tab)?.length ?? 0;
  }
  readRows(tab: string, startRow: number, numRows: number): string[][] {
    const t = this.tabs.get(tab) ?? [];
    const width = (t[0] ?? []).length;
    return t.slice(startRow - 1, startRow - 1 + numRows).map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? '' : String(r[i]))));
  }
  readColumn(tab: string, col: number, startRow: number, numRows: number): string[] {
    return this.readRows(tab, startRow, numRows).map((r) => r[col - 1] ?? '');
  }
  /** Header-keyed view of a tab, for assertions. */
  objects(tab: string): Record<string, Cell>[] {
    const [head, ...rows] = this.tabs.get(tab) ?? [];
    return rows.map((r) => Object.fromEntries((head ?? []).map((h, i) => [String(h), r[i] ?? ''])));
  }
}

export class MemoryCache implements CachePort {
  private m = new Map<string, { v: string; exp: number }>();
  constructor(private now: () => number) {}
  get(k: string): string | null {
    const e = this.m.get(k);
    if (!e || e.exp < this.now()) return null;
    return e.v;
  }
  getAll(keys: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = this.get(k);
      if (v !== null) out[k] = v;
    }
    return out;
  }
  put(k: string, v: string, ttl: number): void {
    if (v.length > 100_000) throw new Error('CacheService value over 100 KB');
    this.m.set(k, { v, exp: this.now() + ttl * 1000 });
  }
  putAll(values: Record<string, string>, ttl: number): void {
    for (const [k, v] of Object.entries(values)) this.put(k, v, ttl);
  }
  remove(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

export class MemoryLock implements LockPort {
  held = false;
  /** Makes tryLock fail, as when another execution holds the script lock. */
  busy = false;
  tryLock(): boolean {
    if (this.busy || this.held) return false;
    this.held = true;
    return true;
  }
  release(): void {
    this.held = false;
  }
}

export class MemoryProps implements PropsPort {
  m = new Map<string, string>();
  get(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  set(k: string, v: string): void {
    this.m.set(k, v);
  }
}

export const nodeCrypto: CryptoPort = {
  hmacSha256: (key, message) => new Uint8Array(createHmac('sha256', key).update(message).digest()),
  sha256: (message) => new Uint8Array(createHash('sha256').update(message).digest()),
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
};

export class MemoryDrive implements DrivePort {
  folders = new Map<string, string>(); // path → id
  files = new Map<string, { folderId: string; name: string; mime: string; bytes: Uint8Array }>();
  private sessions = new Map<string, { folderId: string; name: string; mime: string; total: number; parts: Uint8Array[]; size: number }>();
  private seq = 0;
  createdFiles = 0;

  ensureFolder(path: string[]): string {
    const key = path.join('/');
    let id = this.folders.get(key);
    if (!id) {
      id = `folder-${++this.seq}`;
      this.folders.set(key, id);
    }
    return id;
  }
  createFile(folderId: string, name: string, mime: string, bytes: Uint8Array): string {
    const id = `file-${++this.seq}`;
    this.files.set(id, { folderId, name, mime, bytes });
    this.createdFiles++;
    return id;
  }
  startResumable(folderId: string, name: string, mime: string, totalBytes: number): string {
    const s = `session-${++this.seq}`;
    this.sessions.set(s, { folderId, name, mime, total: totalBytes, parts: [], size: 0 });
    return s;
  }
  putChunk(session: string, bytes: Uint8Array, start: number, totalBytes: number): { done: boolean; fileId?: string } {
    const s = this.sessions.get(session);
    if (!s) throw new Error('Unknown upload session');
    if (start !== s.size) throw new Error(`Chunk at ${start}, expected ${s.size}`);
    s.parts.push(bytes);
    s.size += bytes.length;
    if (s.size < totalBytes) return { done: false };
    const all = new Uint8Array(s.size);
    let o = 0;
    for (const p of s.parts) {
      all.set(p, o);
      o += p.length;
    }
    this.sessions.delete(session);
    return { done: true, fileId: this.createFile(s.folderId, s.name, s.mime, all) };
  }
  read(fileId: string): { mime: string; bytes: Uint8Array } {
    const f = this.files.get(fileId);
    if (!f) throw new Error('No such file');
    return { mime: f.mime, bytes: f.bytes };
  }
  viewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
}

export class StaticSchools implements SchoolsPort {
  constructor(public rows: string[][]) {}
  grid(): string[][] {
    return this.rows;
  }
}

export interface MemoryEnv extends Env {
  system: MemorySystemDb;
  responses: MemoryResponses;
  schools: StaticSchools;
  cache: MemoryCache;
  lock: MemoryLock;
  props: MemoryProps;
  drive: MemoryDrive;
  clock: { now: number };
  logs: string[];
}

export const SAMPLE_SCHOOLS: string[][] = [
  ['Region', 'Area', 'Campus', 'Campus ID', 'Unit Status'],
  ['South West', 'Gadap West I', 'OGS Trust Campus', '947', 'Active'],
  ['North', 'Sheikhupura', 'Zia & Faiza Bhutta Family Foundation Campus', '1306', 'Active'],
  ['Lower Sindh', 'Hyderabad 1', 'Alfalah Campus', '499', 'Active'],
  ['South West', 'Baldia Town 2', 'Fazalillahi Campus-I', '107', 'Active'],
  ['Central', 'Lahore 3', 'Closed Campus', '2000', 'Closed'],
];

export function createMemoryEnv(opts: { now?: number; schools?: string[][] } = {}): MemoryEnv {
  const clock = { now: opts.now ?? Date.UTC(2026, 9, 28, 5, 0, 0) };
  const now = () => clock.now;
  const logs: string[] = [];
  return {
    system: new MemorySystemDb(),
    responses: new MemoryResponses(),
    schools: new StaticSchools(opts.schools ?? SAMPLE_SCHOOLS),
    cache: new MemoryCache(now),
    lock: new MemoryLock(),
    props: new MemoryProps(),
    crypto: nodeCrypto,
    drive: new MemoryDrive(),
    now,
    log: (m) => logs.push(m),
    clock,
    logs,
  };
}
