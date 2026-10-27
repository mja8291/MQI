/**
 * Narrow interfaces over the Apps Script services the server uses. The core is written only
 * against these, so it runs unchanged in Apps Script (adapters/gas.ts), in Node tests and in
 * the local dev API (adapters/memory.ts).
 */
import type { Cell } from '@mqi/shared';

/** One tab of the v2 System spreadsheet. Rows are 1-based; row 1 is the header. All cells are text. */
export interface TablePort {
  readonly name: string;
  header(): string[];
  setHeader(cols: string[]): void;
  /** Last row with content (0 = empty sheet, 1 = header only). */
  lastRow(): number;
  read(startRow: number, numRows: number, width: number): string[][];
  /** Overwrites rows starting at startRow (one setValues for the contiguous range). */
  write(startRow: number, rows: string[][]): void;
  /** Appends after the last row; returns the first new row number. */
  append(rows: string[][]): number;
}

export interface SystemDbPort {
  table(name: string): TablePort | null;
  createTable(name: string, header: string[]): TablePort;
}

/**
 * The shared responses spreadsheet (v1's tabs). v2 only appends rows and adds header columns
 * at the end; it never edits or removes anything there.
 */
export interface ResponsesPort {
  /** The header row, or null if the tab does not exist. */
  header(tab: string): string[] | null;
  createTab(tab: string, header: string[]): void;
  /** Appends columns to the end of the header row, widening the grid if needed. */
  addColumns(tab: string, columns: string[]): void;
  /** One atomic, RAW append (Sheets values.append, INSERT_ROWS): safe while v1 appends too. */
  appendRaw(tab: string, rows: Cell[][]): void;
  lastRow(tab: string): number;
  /** Formatted (display) values, as v1 read them; rows are 1-based. */
  readRows(tab: string, startRow: number, numRows: number): string[][];
  readColumn(tab: string, col: number, startRow: number, numRows: number): string[];
}

/** The read-only school list. */
export interface SchoolsPort {
  grid(): string[][];
}

export interface CachePort {
  get(key: string): string | null;
  getAll(keys: string[]): Record<string, string>;
  put(key: string, value: string, ttlSeconds: number): void;
  putAll(values: Record<string, string>, ttlSeconds: number): void;
  remove(key: string): void;
}

export interface LockPort {
  tryLock(timeoutMs: number): boolean;
  release(): void;
}

export interface PropsPort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface CryptoPort {
  hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array;
  sha256(message: Uint8Array): Uint8Array;
  randomBytes(n: number): Uint8Array;
}

/** Google Drive, reduced to what MQI needs. Files are never shared publicly. */
export interface DrivePort {
  /** Finds or creates a nested folder under the photo root; returns its id. */
  ensureFolder(path: string[]): string;
  createFile(folderId: string, name: string, mime: string, bytes: Uint8Array): string;
  /** Starts a resumable upload session; returns an opaque session handle. */
  startResumable(folderId: string, name: string, mime: string, totalBytes: number): string;
  /** Sends bytes [start, start+len). Returns the file id once the last byte is received. */
  putChunk(session: string, bytes: Uint8Array, start: number, totalBytes: number): { done: boolean; fileId?: string };
  read(fileId: string): { mime: string; bytes: Uint8Array };
  /** The link written to the attachments tab (Drive's webViewLink). */
  viewUrl(fileId: string): string;
}

export interface Env {
  system: SystemDbPort;
  responses: ResponsesPort;
  schools: SchoolsPort;
  cache: CachePort;
  lock: LockPort;
  props: PropsPort;
  crypto: CryptoPort;
  drive: DrivePort;
  now(): number;
  log(message: string): void;
}
