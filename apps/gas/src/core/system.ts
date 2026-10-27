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
