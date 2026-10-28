import { z } from 'zod';
import type { Role } from './permissions';
import { ROLES } from './permissions';
import { attachmentSchema, submittedSurveySchema } from './survey';
import type { RatingBand, RubricItem, School } from './types';
import type { DrillingCheck, SiteChecks } from './types';

/**
 * One Apps Script web-app URL. Every call is POST text/plain (no CORS preflight) with
 * { action, apiVersion, auth, payload }; every answer is HTTP 200 with an ok flag.
 */

/** Bumped when the wire format changes incompatibly; the server answers UPGRADE_REQUIRED. */
export const API_VERSION = 1;
/** The oldest client the server still accepts. */
export const MIN_CLIENT_API_VERSION = 1;
export const PUSH_BATCH_MAX = 10;
/** Raw bytes per files.upload call; base64 adds a third, well under Apps Script's request limit. */
export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'ACCESS_REVOKED',
  'PASSWORD_CHANGE_REQUIRED',
  'FORBIDDEN',
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'LOCK_TIMEOUT',
  'RATE_LIMITED',
  'UPGRADE_REQUIRED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Retried with backoff; every other code is final for that payload. */
export const TRANSIENT_ERRORS: readonly ErrorCode[] = ['LOCK_TIMEOUT', 'RATE_LIMITED', 'INTERNAL'];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | { ok: true; data: T; serverTime: string; rubricVersion: string; requestId: string }
  | { ok: false; error: ApiError; serverTime: string; rubricVersion: string; requestId: string };

export const requestEnvelope = z.object({
  action: z.string().min(1).max(64),
  apiVersion: z.number().int(),
  auth: z.object({ session: z.string().max(2000).optional() }).optional(),
  payload: z.unknown(),
  requestId: z.string().max(64).optional(),
});
export type RequestEnvelope = z.infer<typeof requestEnvelope>;

// ---- auth ----

export const PASSWORD_MIN = 8;
const email = z.string().trim().toLowerCase().max(200).pipe(z.email('Enter a valid email address.'));
const newPassword = z.string().min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`).max(200);

export const signupPayload = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email,
  password: newPassword,
});
export const loginPayload = z.object({ email, password: z.string().min(1).max(200) });
export const changePasswordPayload = z.object({ currentPassword: z.string().min(1).max(200), newPassword });

export type UserStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface WhoAmI {
  user: SessionUser;
  mustChangePassword: boolean;
  /** Re-issued on every whoami so an active phone keeps a 60-day window (FR-AUTH-6). */
  sessionToken: string;
}

// ---- sync ----

export const pushItem = z.object({
  outboxId: z.union([z.string().max(64), z.number()]),
  survey: submittedSurveySchema,
  attachments: z.array(attachmentSchema).max(400),
});
export type PushItem = z.infer<typeof pushItem>;
export const pushPayload = z.object({ items: z.array(pushItem).min(1).max(PUSH_BATCH_MAX) });

export type PushStatus = 'ok' | 'rejected';
export interface PushResult {
  outboxId: string | number;
  status: PushStatus;
  /** True when the survey was already on the server and nothing was written (idempotent retry). */
  duplicate?: boolean;
  error?: ApiError;
}

export interface OwnSurveySummary {
  surveyId: string;
  campusName: string;
  schoolId: string;
  submittedAt: string;
  overall: number | null;
  ratingBand: string;
  locations: number;
}

export interface PullResult {
  surveys: OwnSurveySummary[];
}

// ---- files ----

export const uploadPayload = z.object({
  attachmentId: z.string().max(64),
  chunkIndex: z.number().int().min(0),
  chunkCount: z.number().int().min(1).max(10),
  totalSize: z.number().int().min(1).max(15 * 1024 * 1024),
  data: z.string().max(Math.ceil((UPLOAD_CHUNK_BYTES * 4) / 3) + 8),
  /** v2 (W14): SHA-256 (hex) of this chunk's bytes; a mismatch is resent, never stored. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export interface UploadResult {
  /** Chunks the server holds for this attachment, so a retry resends only what is missing. */
  received: number[];
  done: boolean;
  url?: string;
}

export const fileGetPayload = z.object({ attachmentId: z.string().max(64) });
export interface FileGetResult {
  mimeType: string;
  data: string;
}

// ---- reads ----

export const surveyGetPayload = z.object({ surveyId: z.string().min(1).max(80) });

/** v1 FoundSurvey (src/lib/export/find-survey.ts): what the Excel/PDF builders read. */
export interface FoundSurvey {
  surveyId: string;
  rubricVersion: string;
  campusName: string;
  region: string;
  area: string;
  submittedAt: string;
  apm: string;
  asm: string;
  principal: string;
  powerSupply: string;
  structuralConcern: string;
  buildingStructure: string;
  typeOfStructure: string;
  centerBeam: string;
  drillingCheck: DrillingCheck;
  siteChecks: SiteChecks;
  complaints: string;
  overall: number | null;
  functionality: number | null;
  safety: number | null;
  aesthetics: number | null;
  ratingBandLabel: string;
  startTime: string;
  endTime: string;
  timeTakenSeconds: number | null;
  conditions: Record<string, string>;
  aggregatedScores?: Record<string, number>;
  items: RubricItem[];
  /** Location rows as written (floor, type, name, conditions). */
  locations?: { floorLevel: string; type: string; name: string; scores: Record<string, string> }[];
}

export const exportRowsPayload = z.object({
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(2000),
});
export interface ExportRowsResult {
  header: string[];
  rows: (string | number)[][];
  hasMore: boolean;
}

export interface CapturedSchool {
  schoolId: string;
  surveyId: string;
  name: string;
  region: string;
  area: string;
  date: string;
  overall: number;
  band: RatingBand;
  major: number | null;
  minor: number | null;
  criticalItems: Record<string, number | null>;
}

/** v1 DashboardData (src/lib/sheets/dashboard.ts). */
export interface DashboardData {
  totalSchools: number;
  captured: number;
  pending: number;
  averageScore: number | null;
  overallBand: RatingBand | null;
  averageMajorScore: number | null;
  averageMinorScore: number | null;
  criticalItemAverages: Record<string, number | null>;
  distribution: Record<RatingBand, number>;
  byRegion: { region: string; average: number; count: number }[];
  schools: CapturedSchool[];
}

export type SchoolsResult = { schools: School[] };

// ---- admin ----

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  approvedAt: string;
  lastLoginAt: string;
}
export const userIdPayload = z.object({ userId: z.string().max(64) });
export const approvePayload = z.object({ userId: z.string().max(64), role: z.enum(ROLES) });
export interface IssuePasswordResult {
  temporaryPassword: string;
}

// ---- observability ----

export const clientLogPayload = z.object({
  level: z.enum(['error', 'warn']),
  message: z.string().max(1000),
  stack: z.string().max(4000).optional(),
  route: z.string().max(200).optional(),
  appVersion: z.string().max(40).optional(),
});

export const ACTIONS = [
  'auth.signup',
  'auth.login',
  'auth.whoami',
  'auth.changePassword',
  'auth.logoutAll',
  'sync.push',
  'sync.pull',
  'files.upload',
  'files.get',
  'dashboard.get',
  'schools.list',
  'surveys.get',
  'export.rows',
  'admin.users.list',
  'admin.users.approve',
  'admin.users.revoke',
  'admin.issuePassword',
  'client.log',
] as const;
export type ActionName = (typeof ACTIONS)[number];

/** Actions callable without a session. */
export const PUBLIC_ACTIONS: readonly ActionName[] = ['auth.signup', 'auth.login', 'client.log'];
