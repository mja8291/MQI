/**
 * MQI roles and the one permission matrix the phone (to hide) and the server (to refuse) share.
 *
 *   none – no access   view – read   own – create, and read back your own   all – anyone's
 *
 * Downloads and the dashboard stay open to every approved user, as in v1 (decided 28 Oct 2026).
 */
export const ROLES = ['SURVEYOR', 'REVIEWER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  SURVEYOR: 'Surveyor',
  REVIEWER: 'Reviewer',
  ADMIN: 'Administrator',
};

export type Level = 'none' | 'view' | 'own' | 'all';

export const PERMISSIONS = ['survey', 'surveyDownload', 'dashboard', 'exportAll', 'users'] as const;
export type Permission = (typeof PERMISSIONS)[number];

type Row = Record<Role, Level>;
const row = (SURVEYOR: Level, REVIEWER: Level, ADMIN: Level): Row => ({ SURVEYOR, REVIEWER, ADMIN });

//                                      Surveyor Reviewer Admin
export const MATRIX: Record<Permission, Row> = {
  survey:         row('own',  'none', 'own'),
  surveyDownload: row('all',  'all',  'all'),
  dashboard:      row('view', 'view', 'view'),
  exportAll:      row('view', 'view', 'view'),
  users:          row('none', 'none', 'all'),
};

export function level(role: Role, permission: Permission): Level {
  return MATRIX[permission][role];
}

export function can(role: Role, permission: Permission): boolean {
  return level(role, permission) !== 'none';
}

/** Whether `role` may write a record governed by `permission`; ownerId is undefined for a new record. */
export function canWrite(role: Role, permission: Permission, userId: string, ownerId: string | undefined): boolean {
  const l = level(role, permission);
  if (l === 'all') return true;
  if (l === 'own') return ownerId === undefined || ownerId === userId;
  return false;
}
