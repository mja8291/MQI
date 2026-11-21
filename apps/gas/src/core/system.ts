import type { Env, TablePort } from './ports';

/**
 * Tabs of the v2-only "MQI v2 System" spreadsheet (docs/parity-notes.md D3). Columns are
 * matched by header name, so people may reorder them; new columns are added at the end.
 */
export const SYSTEM_TABS = {
  USERS: ['Users v2', ['id', 'email', 'name', 'role', 'status', 'createdAt', 'approvedAt', 'approvedBy', 'lastLoginAt', 'updatedAt']],
  CREDENTIALS: [
    'Credentials',
    ['userId', 'hash', 'salt', 'iterations', 'mustChange', 'failedAttempts', 'lockedUntil', 'tokenVersion', 'updatedAt'],
  ],
  SURVEYS: [
    'Surveys',
    ['surveyId', 'ownerId', 'schoolId', 'campusName', 'region', 'submittedAt', 'locations', 'overall', 'ratingBand', 'state', 'rowsWritten', 'notesWritten', 'updatedAt'],
  ],
  FILES: [
    'Files',
    [
      'attachmentId',
      'surveyId',
      'ownerId',
      'itemName',
      'locationName',
      'floorLevel',
      'locationType',
      'locationLabel',
      'mimeType',
      'size',
      'state',
      'session',
      'received',
      'driveFileId',
      'url',
      'createdAt',
      'updatedAt',
    ],
  ],
  CHANGELOG: ['ChangeLog', ['at', 'requestId', 'userId', 'action', 'entity', 'entityId', 'detail']],
  AUDITLOG: ['AuditLog', ['at', 'requestId', 'actorId', 'action', 'targetId', 'detail']],
  ERRORLOG: ['ErrorLog', ['at', 'source', 'requestId', 'action', 'userId', 'code', 'message', 'stack', 'route', 'appVersion']],
} as const satisfies Record<string, readonly [string, readonly string[]]>;

export type TabKey = keyof typeof SYSTEM_TABS;
export type Row = Record<string, string>;

export function ensureSystemTabs(env: Env): string[] {
  const created: string[] = [];
  for (const [name, cols] of Object.values(SYSTEM_TABS)) {
    const t = env.system.table(name);
    if (!t) {
      env.system.createTable(name, [...cols]);
      created.push(name);
      continue;
    }
    const existing = t.header();
    const missing = cols.filter((c) => !existing.includes(c));
    if (missing.length) t.setHeader([...existing, ...missing]);
  }
  return created;
}

/**
 * A System tab read once per request and addressed by its key column. Small tabs (users, a
 * survey ledger, a file ledger) keep this simple; every write is one contiguous setValues.
 */
export class Table {
  private header: string[] = [];
  private rows: Row[] = [];
  private rowIndex = new Map<string, number>();
  private loaded = false;

  constructor(
    private readonly port: TablePort,
    private readonly key: string,
  ) {}

  static of(env: Env, tab: TabKey, key: string): Table {
    const [name] = SYSTEM_TABS[tab];
    const port = env.system.table(name);
    if (!port) throw new Error(`System tab "${name}" is missing. Run setup().`);
    return new Table(port, key);
  }

  private load(): void {
    if (this.loaded) return;
    this.header = this.port.header();
    const last = this.port.lastRow();
    const grid = last > 1 ? this.port.read(2, last - 1, this.header.length) : [];
    this.rows = grid.map((r) => Object.fromEntries(this.header.map((h, i) => [h, r[i] ?? ''])));
    this.rows.forEach((r, i) => {
      const k = r[this.key];
      if (k) this.rowIndex.set(k, i);
    });
    this.loaded = true;
  }

  all(): Row[] {
    this.load();
    return this.rows;
  }

  get(key: string): Row | undefined {
    this.load();
    const i = this.rowIndex.get(key);
    return i === undefined ? undefined : this.rows[i];
  }

  /**
   * W76: one row by its key without reading the whole tab (a sheet text search on the key column,
   * then that one row). files.get used to read the ~2,600-row Files register for every photo, so
   * reports of big surveys timed out on some photos. Uses the loaded rows when they are already here.
   */
  lookup(key: string): Row | undefined {
    if (this.loaded) return this.get(key);
    const header = this.port.header();
    const col = header.indexOf(this.key) + 1;
    if (!col) return this.get(key);
    const row = this.port.findRow(col, key);
    if (!row) return undefined;
    const cells = this.port.read(row, 1, header.length)[0] ?? [];
    const r: Row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
    return r[this.key] === key ? r : this.get(key);
  }

  /**
   * W83: changes one row found by its key, reading and writing only that row (a sheet text search on
   * the key column). Photo uploads used to read the whole Files register (7,500 rows by 21 Nov) up to
   * four times per photo, mostly under the lock: uploads queued behind each other and timed out.
   */
  patch(key: string, patch: Row): Row {
    if (this.loaded) return this.update(key, patch);
    const header = this.port.header();
    const col = header.indexOf(this.key) + 1;
    const rowNumber = col ? this.port.findRow(col, key) : 0;
    if (!rowNumber) return this.update(key, patch);
    const cells = this.port.read(rowNumber, 1, header.length)[0] ?? [];
    const current: Row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
    if (current[this.key] !== key) return this.update(key, patch);
    const next = { ...current, ...patch };
    this.port.write(rowNumber, [header.map((h) => next[h] ?? '')]);
    return next;
  }

  /** W83: the keys already in the tab, reading only the key column. */
  keys(): Set<string> {
    if (this.loaded) return new Set(this.rowIndex.keys());
    const header = this.port.header();
    const col = header.indexOf(this.key) + 1;
    const last = this.port.lastRow();
    if (!col || last < 2) return new Set();
    const out = new Set<string>();
    for (const r of this.port.readColumn(col, 2, last - 1)) if (r) out.add(r);
    return out;
  }

  /** W83: appends several rows in one write (the caller has checked their keys are new). */
  insertMany(rows: Row[]): void {
    if (!rows.length) return;
    const header = this.loaded ? this.header : this.port.header();
    this.port.append(rows.map((r) => header.map((h) => r[h] ?? '')));
    if (this.loaded) {
      for (const r of rows) {
        this.rows.push(r);
        const k = r[this.key];
        if (k) this.rowIndex.set(k, this.rows.length - 1);
      }
    }
  }

  find(pred: (r: Row) => boolean): Row | undefined {
    return this.all().find(pred);
  }

  private toCells(r: Row): string[] {
    return this.header.map((h) => r[h] ?? '');
  }

  insert(row: Row): void {
    this.load();
    const k = row[this.key];
    if (!k) throw new Error(`Missing key ${this.key}`);
    if (this.rowIndex.has(k)) throw new Error(`Duplicate ${this.key} ${k}`);
    this.port.append([this.toCells(row)]);
    this.rows.push(row);
    this.rowIndex.set(k, this.rows.length - 1);
  }

  update(key: string, patch: Row): Row {
    this.load();
    const i = this.rowIndex.get(key);
    if (i === undefined) throw new Error(`No ${this.key} ${key}`);
    const next = { ...this.rows[i]!, ...patch };
    this.port.write(i + 2, [this.toCells(next)]);
    this.rows[i] = next;
    return next;
  }

  /** W75: deletes the row with this key (rows below move up one). */
  remove(key: string): void {
    this.load();
    const i = this.rowIndex.get(key);
    if (i === undefined) throw new Error(`No ${this.key} ${key}`);
    this.port.removeRow(i + 2);
    this.rows.splice(i, 1);
    this.rowIndex.clear();
    this.rows.forEach((r, n) => {
      const k = r[this.key];
      if (k) this.rowIndex.set(k, n);
    });
  }

  /** Append-only log tabs (no key lookups). */
  static log(env: Env, tab: 'CHANGELOG' | 'AUDITLOG' | 'ERRORLOG', row: Row): void {
    const [name, cols] = SYSTEM_TABS[tab];
    const port = env.system.table(name);
    if (!port) return;
    const header = port.header();
    const cells = (header.length ? header : [...cols]).map((h) => (row[h] ?? '').slice(0, 5000));
    port.append([cells]);
  }
}
