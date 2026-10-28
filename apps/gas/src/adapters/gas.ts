/// <reference types="google-apps-script" />
import type { Cell } from '@mqi/shared';
import { PROP } from '../core/context';
import type { CachePort, CryptoPort, DrivePort, Env, LockPort, PropsPort, ResponsesPort, SchoolsPort, SystemDbPort, TablePort } from '../core/ports';

/** Apps Script implementations of the ports. */

const props: PropsPort = {
  get: (k) => PropertiesService.getScriptProperties().getProperty(k),
  set: (k, v) => {
    PropertiesService.getScriptProperties().setProperty(k, v);
  },
};

function requireProp(key: string): string {
  const v = props.get(key);
  if (!v) throw new Error(`Script property ${key} is not set. See README "Script Properties", then run setup().`);
  return v;
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

// ---- v2 System spreadsheet: plain-text tabs ----

class SheetTable implements TablePort {
  constructor(private sheet: GoogleAppsScript.Spreadsheet.Sheet) {}
  get name(): string {
    return this.sheet.getName();
  }
  header(): string[] {
    const w = this.sheet.getLastColumn();
    if (w === 0) return [];
    return this.sheet.getRange(1, 1, 1, w).getDisplayValues()[0]!.map(String);
  }
  setHeader(cols: string[]): void {
    if (this.sheet.getMaxColumns() < cols.length) this.sheet.insertColumnsAfter(this.sheet.getMaxColumns(), cols.length - this.sheet.getMaxColumns());
    this.sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    // Text format: values are stored exactly as written, never parsed as numbers or formulas.
    this.sheet.getRange(1, 1, this.sheet.getMaxRows(), cols.length).setNumberFormat('@');
    this.sheet.setFrozenRows(1);
  }
  lastRow(): number {
    return this.sheet.getLastRow();
  }
  read(startRow: number, numRows: number, width: number): string[][] {
    if (numRows <= 0 || width <= 0) return [];
    return this.sheet.getRange(startRow, 1, numRows, width).getDisplayValues();
  }
  write(startRow: number, rows: string[][]): void {
    if (!rows.length) return;
    const range = this.sheet.getRange(startRow, 1, rows.length, rows[0]!.length);
    range.setNumberFormat('@');
    range.setValues(rows);
  }
  append(rows: string[][]): number {
    const first = this.sheet.getLastRow() + 1;
    this.write(first, rows);
    return first;
  }
}

class SystemDb implements SystemDbPort {
  private ss = SpreadsheetApp.openById(requireProp(PROP.SYSTEM_SPREADSHEET_ID));
  table(name: string): TablePort | null {
    const s = this.ss.getSheetByName(name);
    return s ? new SheetTable(s) : null;
  }
  createTable(name: string, header: string[]): TablePort {
    const t = new SheetTable(this.ss.insertSheet(name));
    t.setHeader(header);
    const blank = this.ss.getSheetByName('Sheet1');
    if (blank && this.ss.getSheets().length > 1) this.ss.deleteSheet(blank);
    return t;
  }
}

// ---- v1 response tabs: header-driven, RAW, atomic appends ----

class Responses implements ResponsesPort {
  private id = requireProp(PROP.RESPONSES_SPREADSHEET_ID);
  private ss = SpreadsheetApp.openById(this.id);
  private sheet(tab: string): GoogleAppsScript.Spreadsheet.Sheet | null {
    return this.ss.getSheetByName(tab);
  }
  header(tab: string): string[] | null {
    const s = this.sheet(tab);
    if (!s) return null;
    const w = s.getLastColumn();
    return w ? s.getRange(1, 1, 1, w).getDisplayValues()[0]!.map(String) : [];
  }
  createTab(tab: string, header: string[]): void {
    const s = this.sheet(tab) ?? this.ss.insertSheet(tab);
    if (s.getMaxColumns() < header.length) s.insertColumnsAfter(s.getMaxColumns(), header.length - s.getMaxColumns());
    s.getRange(1, 1, 1, header.length).setValues([header]);
    SpreadsheetApp.flush();
  }
  addColumns(tab: string, columns: string[]): void {
    const s = this.sheet(tab);
    if (!s) throw new Error(`No tab ${tab}`);
    const width = s.getLastColumn();
    const need = width + columns.length;
    if (s.getMaxColumns() < need) s.insertColumnsAfter(s.getMaxColumns(), need - s.getMaxColumns());
    s.getRange(1, width + 1, 1, columns.length).setValues([columns]);
    SpreadsheetApp.flush();
  }
  appendRaw(tab: string, rows: Cell[][]): void {
    // values.append is atomic on Google's side, so rows appended by v1 at the same moment
    // can never be overwritten (docs/parity-notes.md D9). RAW: no formula is ever evaluated.
    Sheets!.Spreadsheets!.Values!.append({ values: rows }, this.id, `${quoteTab(tab)}!A1`, {
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
    });
  }
  lastRow(tab: string): number {
    return this.sheet(tab)?.getLastRow() ?? 0;
  }
  readRows(tab: string, startRow: number, numRows: number): string[][] {
    const s = this.sheet(tab);
    if (!s || numRows <= 0) return [];
    return s.getRange(startRow, 1, numRows, Math.max(1, s.getLastColumn())).getDisplayValues();
  }
  readColumn(tab: string, col: number, startRow: number, numRows: number): string[] {
    const s = this.sheet(tab);
    if (!s || numRows <= 0) return [];
    return s.getRange(startRow, col, numRows, 1).getDisplayValues().map((r) => String(r[0] ?? ''));
  }
}

/** The department's E-Compound Spreadsheet (read only); override with ECOMPOUND_SPREADSHEET_ID. */
const DEFAULT_ECOMPOUND_SPREADSHEET_ID = '1F3e0-nGWeDeSUnlZq6Thqa-wSE9LlXnNFrqlUwMrcfM';

const schools: SchoolsPort = {
  grid() {
    const ss = SpreadsheetApp.openById(requireProp(PROP.SCHOOLS_SPREADSHEET_ID));
    const s = ss.getSheetByName(props.get(PROP.SCHOOLS_SHEET_TAB) || 'Schools (All Units)');
    return s ? s.getDataRange().getDisplayValues() : [];
  },
  eCompoundGrid() {
    // Only the three columns Find school needs (the sheet has ~90); any failure → no names.
    try {
      const s = SpreadsheetApp.openById(props.get(PROP.ECOMPOUND_SPREADSHEET_ID) || DEFAULT_ECOMPOUND_SPREADSHEET_ID).getSheets()[0];
      if (!s || s.getLastRow() < 2) return [];
      const header = s.getRange(1, 1, 1, s.getLastColumn()).getDisplayValues()[0]!.map((h) => h.trim().toLowerCase());
      const wanted = ['campus id', 'e-compound', 'ecompoundno'].map((n) => header.indexOf(n));
      if (wanted[1] === -1) return [];
      const n = s.getLastRow();
      const cols = wanted.map((i) => (i === -1 ? Array.from({ length: n }, () => ['']) : s.getRange(1, i + 1, n, 1).getDisplayValues()));
      return Array.from({ length: n }, (_, r) => cols.map((c) => c[r]![0] ?? ''));
    } catch (e) {
      console.warn('E-Compound Spreadsheet unavailable: ' + String(e));
      return [];
    }
  },
};

const cache: CachePort = {
  get: (k) => CacheService.getScriptCache().get(k),
  getAll: (keys) => CacheService.getScriptCache().getAll(keys) as Record<string, string>,
  put: (k, v, ttl) => CacheService.getScriptCache().put(k, v, ttl),
  putAll: (values, ttl) => CacheService.getScriptCache().putAll(values, ttl),
  remove: (k) => CacheService.getScriptCache().remove(k),
};

let heldLock: GoogleAppsScript.Lock.Lock | null = null;
const lock: LockPort = {
  tryLock: (ms) => {
    const l = LockService.getScriptLock();
    if (!l.tryLock(ms)) return false;
    heldLock = l;
    return true;
  },
  release: () => {
    heldLock?.releaseLock();
    heldLock = null;
  },
};

// Apps Script byte arrays are signed (-128..127).
export const toGas = (b: Uint8Array): number[] => Array.from(b, (x) => (x > 127 ? x - 256 : x));
const fromGas = (b: number[]): Uint8Array => Uint8Array.from(b, (x) => (x < 0 ? x + 256 : x));

export const gasCrypto: CryptoPort = {
  hmacSha256: (key, message) => fromGas(Utilities.computeHmacSha256Signature(toGas(message), toGas(key))),
  sha256: (message) => fromGas(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, toGas(message))),
  // Utilities.getUuid() comes from a cryptographically secure generator (122 random bits each).
  randomBytes: (n) => {
    const out: number[] = [];
    while (out.length < n) {
      const hex = Utilities.getUuid().replace(/-/g, '');
      const usable = hex.slice(0, 12) + hex.slice(13, 16) + hex.slice(17); // skip version/variant nibbles
      for (let i = 0; i + 1 < usable.length && out.length < n; i += 2) out.push(parseInt(usable.slice(i, i + 2), 16));
    }
    return Uint8Array.from(out);
  },
};

/** Drive: folders under PHOTOS_FOLDER_ID; files are never shared publicly. */
const drive: DrivePort = {
  ensureFolder(path) {
    const key = `fld:${path.join('/')}`;
    const c = CacheService.getScriptCache();
    const hit = c.get(key);
    if (hit) return hit;
    let folder = DriveApp.getFolderById(requireProp(PROP.PHOTOS_FOLDER_ID));
    for (const name of path) {
      const it = folder.getFoldersByName(name);
      folder = it.hasNext() ? it.next() : folder.createFolder(name);
    }
    const id = folder.getId();
    c.put(key, id, 21600);
    return id;
  },
  createFile(folderId, name, mime, bytes) {
    return DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(toGas(bytes), mime, name)).getId();
  },
  startResumable(folderId, name, mime, totalBytes) {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}`, 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(totalBytes) },
      payload: JSON.stringify({ name, parents: [folderId] }),
      muteHttpExceptions: true,
    });
    const headers = res.getAllHeaders() as Record<string, string>;
    const location = headers.Location ?? headers.location;
    if (res.getResponseCode() >= 300 || !location) throw new Error(`Drive resumable start failed: ${res.getResponseCode()}`);
    return location;
  },
  putChunk(session, bytes, start, totalBytes) {
    const end = start + bytes.length - 1;
    const res = UrlFetchApp.fetch(session, {
      method: 'put',
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}`, 'Content-Range': `bytes ${start}-${end}/${totalBytes}` },
      payload: toGas(bytes),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 308) return { done: false };
    if (code === 200 || code === 201) return { done: true, fileId: (JSON.parse(res.getContentText()) as { id: string }).id };
    throw new Error(`Drive chunk upload failed: ${code}`);
  },
  read(fileId) {
    const blob = DriveApp.getFileById(fileId).getBlob();
    return { mime: blob.getContentType() ?? 'application/octet-stream', bytes: fromGas(blob.getBytes()) };
  },
  viewUrl: (fileId) => `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
};

export function createGasEnv(): Env {
  return {
    system: new SystemDb(),
    responses: new Responses(),
    schools,
    cache,
    lock,
    props,
    crypto: gasCrypto,
    drive,
    now: () => Date.now(),
    log: (m) => console.error(m),
  };
}

export { props as gasProps };
