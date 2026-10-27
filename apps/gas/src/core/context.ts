import type { SessionUser } from '@mqi/shared';
import type { Env } from './ports';

/** Script Properties the server reads. setup() fills what it can; see README "Script Properties". */
export const PROP = {
  ENV_NAME: 'ENV_NAME',
  RESPONSES_SPREADSHEET_ID: 'RESPONSES_SPREADSHEET_ID',
  SYSTEM_SPREADSHEET_ID: 'SYSTEM_SPREADSHEET_ID',
  SCHOOLS_SPREADSHEET_ID: 'SCHOOLS_SPREADSHEET_ID',
  SCHOOLS_SHEET_TAB: 'SCHOOLS_SHEET_TAB',
  V2_ROOT_FOLDER_ID: 'V2_ROOT_FOLDER_ID',
  PHOTOS_FOLDER_ID: 'PHOTOS_FOLDER_ID',
  SESSION_SECRET: 'SESSION_SECRET',
  PASSWORD_PEPPER: 'PASSWORD_PEPPER',
  PBKDF2_ITERATIONS: 'PBKDF2_ITERATIONS',
  ADMIN_EMAIL: 'ADMIN_EMAIL',
  ADMIN_NAME: 'ADMIN_NAME',
  SCHEMA_VERSION: 'SCHEMA_VERSION',
} as const;

/** Per-request state. */
export class Ctx {
  user: SessionUser | null = null;
  readonly nowMs: number;
  readonly nowIso: string;

  constructor(
    readonly env: Env,
    readonly requestId: string,
    readonly action: string,
  ) {
    this.nowMs = env.now();
    this.nowIso = new Date(this.nowMs).toISOString();
  }

  requireUser(): SessionUser {
    if (!this.user) throw new Error('No user in context');
    return this.user;
  }
}
