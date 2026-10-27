import {
  PASSWORD_MIN,
  ROLES,
  approvePayload,
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  changePasswordPayload,
  hexToBytes,
  loginPayload,
  signupPayload,
  timingSafeEqual,
  userIdPayload,
  utf8Decode,
  utf8Encode,
  uuidv7,
} from '@mqi/shared';
import type { AdminUser, IssuePasswordResult, Role, SessionUser, UserStatus, WhoAmI } from '@mqi/shared';
import { PROP } from './context';
import type { Ctx } from './context';
import { fail } from './errors';
import type { CryptoPort, Env } from './ports';
import { Table } from './system';
import type { Row } from './system';
import { withLock } from './lock';

/**
 * Accounts in "Users v2"; password hashes only in "Credentials", which no action returns.
 * Hashing is PBKDF2-HMAC-SHA256 over HMAC(pepper, password), built on
 * Utilities.computeHmacSha256Signature in Apps Script (CryptoPort.hmacSha256).
 */

/** Default until benchmarkPasswordHash() is run on the deployment and PBKDF2_ITERATIONS is set (README). */
export const DEFAULT_ITERATIONS = 2000;
export const SESSION_DAYS = 60;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
/** Sign-in attempts per minute across all accounts before everyone is briefly throttled. */
export const GLOBAL_LOGIN_LIMIT = 60;
/** How long a user's status/role is trusted from cache before the sheet is re-read (FR-AUTH-7). */
export const USER_CACHE_SECONDS = 60;

// ---- secrets ----

function secret(env: Env, key: typeof PROP.SESSION_SECRET | typeof PROP.PASSWORD_PEPPER): Uint8Array {
  let v = env.props.get(key);
  if (!v) {
    v = bytesToHex(env.crypto.randomBytes(32));
    env.props.set(key, v);
  }
  return hexToBytes(v);
}

export function iterations(env: Env): number {
  const n = Number(env.props.get(PROP.PBKDF2_ITERATIONS));
  return Number.isInteger(n) && n >= 1000 ? n : DEFAULT_ITERATIONS;
}

// ---- password hashing ----

export function pbkdf2Sha256(c: CryptoPort, password: Uint8Array, salt: Uint8Array, rounds: number): Uint8Array {
  const block = new Uint8Array(salt.length + 4);
  block.set(salt);
  block.set([0, 0, 0, 1], salt.length);
  let u = c.hmacSha256(password, block);
  const t = Uint8Array.from(u);
  for (let i = 1; i < rounds; i++) {
    u = c.hmacSha256(password, u);
    for (let k = 0; k < t.length; k++) t[k]! ^= u[k]!;
  }
  return t;
}

export function hashPassword(env: Env, password: string, salt: Uint8Array, rounds: number): string {
  const peppered = env.crypto.hmacSha256(secret(env, PROP.PASSWORD_PEPPER), utf8Encode(password));
  return bytesToHex(pbkdf2Sha256(env.crypto, peppered, salt, rounds));
}

const COMMON = new Set(['password', 'password1', '12345678', '123456789', 'qwerty123', 'tcf12345', 'pakistan', 'welcome1', 'mqi12345']);

export function checkPasswordRules(password: string, email: string): void {
  if (password.length < PASSWORD_MIN) fail('VALIDATION', `Password must be at least ${PASSWORD_MIN} characters.`);
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) fail('VALIDATION', 'That password is too common.');
  if (lower === email.toLowerCase() || lower === email.split('@')[0]!.toLowerCase()) fail('VALIDATION', 'Password must not be your email.');
}

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTemporaryPassword(c: CryptoPort, length = 10): string {
  const bytes = c.randomBytes(length * 2);
  let s = '';
  for (let i = 0; i < bytes.length && s.length < length; i++) {
    const b = bytes[i]!;
    if (b < 256 - (256 % TEMP_ALPHABET.length)) s += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  }
  return s.length === length ? s : generateTemporaryPassword(c, length);
}

function credentialsFor(env: Env, password: string, mustChange: boolean, tokenVersion: number, nowIso: string): Row {
  const salt = env.crypto.randomBytes(16);
  const rounds = iterations(env);
  return {
    hash: hashPassword(env, password, salt, rounds),
    salt: bytesToHex(salt),
    iterations: String(rounds),
    mustChange: mustChange ? 'TRUE' : 'FALSE',
    failedAttempts: '0',
    lockedUntil: '',
    tokenVersion: String(tokenVersion),
    updatedAt: nowIso,
  };
}

// ---- session tokens: base64url(json).base64url(hmac) ----

interface Claims {
  uid: string;
  iat: number;
  exp: number;
  /** Credentials.tokenVersion at issue: logoutAll and every password set bump it, revoking older tokens. */
  tv: number;
}

export function issueToken(env: Env, userId: string, tokenVersion: number, nowMs: number): string {
  const claims: Claims = { uid: userId, iat: nowMs, exp: nowMs + SESSION_DAYS * 86_400_000, tv: tokenVersion };
  const body = base64UrlEncode(utf8Encode(JSON.stringify(claims)));
  const mac = base64UrlEncode(env.crypto.hmacSha256(secret(env, PROP.SESSION_SECRET), utf8Encode(body)));
  return `${body}.${mac}`;
}

export function verifyToken(env: Env, token: string, nowMs: number): Claims {
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return fail('UNAUTHENTICATED', 'Please sign in again.');
  let given: Uint8Array;
  try {
    given = base64UrlDecode(mac);
  } catch {
    return fail('UNAUTHENTICATED', 'Please sign in again.');
  }
  const expected = env.crypto.hmacSha256(secret(env, PROP.SESSION_SECRET), utf8Encode(body));
  if (!timingSafeEqual(expected, given)) fail('UNAUTHENTICATED', 'Please sign in again.');
  const claims = JSON.parse(utf8Decode(base64UrlDecode(body))) as Claims;
  if (claims.exp < nowMs) fail('UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  return claims;
}

// ---- users ----

interface CachedUser {
  user: SessionUser;
  status: UserStatus;
  tokenVersion: number;
  mustChange: boolean;
}

const userCacheKey = (id: string) => `user:${id}`;

function loadUser(env: Env, userId: string): CachedUser | null {
  const hit = env.cache.get(userCacheKey(userId));
  if (hit) return JSON.parse(hit) as CachedUser;
  const u = Table.of(env, 'USERS', 'id').get(userId);
  const c = Table.of(env, 'CREDENTIALS', 'userId').get(userId);
  if (!u || !c) return null;
  const value: CachedUser = {
    user: { id: u.id!, name: u.name ?? '', email: u.email ?? '', role: (ROLES as readonly string[]).includes(u.role ?? '') ? (u.role as Role) : 'SURVEYOR' },
    status: (u.status as UserStatus) || 'PENDING',
    tokenVersion: Number(c.tokenVersion) || 0,
    mustChange: c.mustChange === 'TRUE',
  };
  env.cache.put(userCacheKey(userId), JSON.stringify(value), USER_CACHE_SECONDS);
  return value;
}

export function forgetUser(env: Env, userId: string): void {
  env.cache.remove(userCacheKey(userId));
}

/**
 * Every protected request: verify the token, then re-check the account (cached at most 60 s),
 * so revocation and logoutAll take effect within a minute.
 */
export function authenticate(ctx: Ctx, token: string | undefined, allowMustChange: boolean): SessionUser {
  if (!token) return fail('UNAUTHENTICATED', 'Please sign in.');
  const claims = verifyToken(ctx.env, token, ctx.nowMs);
  const u = loadUser(ctx.env, claims.uid);
  if (!u) return fail('UNAUTHENTICATED', 'Please sign in again.');
  if (u.tokenVersion !== claims.tv) return fail('UNAUTHENTICATED', 'You were signed out. Please sign in again.');
  if (u.status === 'REVOKED') return fail('ACCESS_REVOKED', 'Your access has been removed. Contact the administrator.');
  if (u.status !== 'ACTIVE') return fail('ACCESS_REVOKED', 'Your account is awaiting approval.');
  if (u.mustChange && !allowMustChange) return fail('PASSWORD_CHANGE_REQUIRED', 'Choose a new password to continue.');
  ctx.user = u.user;
  return u.user;
}

function whoami(ctx: Ctx, userId: string): WhoAmI {
  forgetUser(ctx.env, userId);
  const u = loadUser(ctx.env, userId);
  if (!u) return fail('UNAUTHENTICATED', 'Please sign in again.');
  return { user: u.user, mustChangePassword: u.mustChange, sessionToken: issueToken(ctx.env, userId, u.tokenVersion, ctx.nowMs) };
}

function audit(ctx: Ctx, action: string, targetId: string, detail = ''): void {
  Table.log(ctx.env, 'AUDITLOG', { at: ctx.nowIso, requestId: ctx.requestId, actorId: ctx.user?.id ?? '', action, targetId, detail });
}

// ---- actions ----

export function signup(ctx: Ctx, raw: unknown): { status: 'PENDING' } {
  const p = signupPayload.parse(raw);
  checkPasswordRules(p.password, p.email);
  throttle(ctx, 'signup', 20);
  return withLock(ctx, () => {
    const users = Table.of(ctx.env, 'USERS', 'id');
    // FR-AUTH-1: emails are unique, matched case-insensitively.
    if (users.find((u) => (u.email ?? '').toLowerCase() === p.email)) fail('CONFLICT', 'An account with this email already exists.');
    const id = uuidv7(ctx.env.crypto.randomBytes, ctx.nowMs);
    Table.of(ctx.env, 'CREDENTIALS', 'userId').insert({ userId: id, ...credentialsFor(ctx.env, p.password, false, 0, ctx.nowIso) });
    users.insert({ id, email: p.email, name: p.name, role: 'SURVEYOR', status: 'PENDING', createdAt: ctx.nowIso, updatedAt: ctx.nowIso });
    audit(ctx, 'signup', id);
    return { status: 'PENDING' as const };
  });
}

/** Global throttle: a CacheService counter per minute window. */
function throttle(ctx: Ctx, bucket: string, perMinute: number): void {
  const key = `rl:${bucket}:${Math.floor(ctx.nowMs / 60_000)}`;
  const n = Number(ctx.env.cache.get(key) ?? 0) + 1;
  ctx.env.cache.put(key, String(n), 120);
  if (n > perMinute) fail('RATE_LIMITED', 'Too many attempts right now. Try again in a minute.');
}

export function login(ctx: Ctx, raw: unknown): WhoAmI {
  const p = loginPayload.parse(raw);
  throttle(ctx, 'login', GLOBAL_LOGIN_LIMIT);
  const users = Table.of(ctx.env, 'USERS', 'id');
  const user = users.find((u) => (u.email ?? '').toLowerCase() === p.email);
  const creds = user ? Table.of(ctx.env, 'CREDENTIALS', 'userId').get(user.id!) : undefined;
  const wrong = 'Email or password is incorrect.'; // FR-AUTH-3: same message for both
  if (!user || !creds) {
    // Spend a hash anyway so timing does not reveal which emails exist.
    hashPassword(ctx.env, p.password, new Uint8Array(16), iterations(ctx.env));
    return fail('UNAUTHENTICATED', wrong);
  }
  if (creds.lockedUntil && Date.parse(creds.lockedUntil) > ctx.nowMs) {
    return fail('RATE_LIMITED', `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`);
  }
  const hash = hashPassword(ctx.env, p.password, hexToBytes(creds.salt ?? ''), Number(creds.iterations) || DEFAULT_ITERATIONS);
  const ok = timingSafeEqual(hexToBytes(hash), hexToBytes(creds.hash ?? ''));
  return withLock(ctx, () => {
    const credTable = Table.of(ctx.env, 'CREDENTIALS', 'userId');
    const current = credTable.get(user.id!)!;
    if (!ok) {
      const failed = (Number(current.failedAttempts) || 0) + 1;
      const lock = failed >= MAX_FAILED;
      credTable.update(user.id!, {
        failedAttempts: lock ? '0' : String(failed),
        lockedUntil: lock ? new Date(ctx.nowMs + LOCK_MINUTES * 60_000).toISOString() : current.lockedUntil ?? '',
        updatedAt: ctx.nowIso,
      });
      if (lock) audit(ctx, 'lockout', user.id!);
      return fail('UNAUTHENTICATED', wrong);
    }
    if (current.failedAttempts !== '0' || current.lockedUntil) credTable.update(user.id!, { failedAttempts: '0', lockedUntil: '', updatedAt: ctx.nowIso });
    // FR-AUTH-3: a correct password on a pending account says it is awaiting approval.
    if (user.status === 'PENDING') return fail('ACCESS_REVOKED', 'Your account is awaiting approval by an administrator.');
    if (user.status === 'REVOKED') return fail('ACCESS_REVOKED', 'Your access has been removed. Contact the administrator.');
    Table.of(ctx.env, 'USERS', 'id').update(user.id!, { lastLoginAt: ctx.nowIso });
    ctx.user = { id: user.id!, name: user.name ?? '', email: user.email ?? '', role: user.role as Role };
    return whoami(ctx, user.id!);
  });
}

export function whoamiAction(ctx: Ctx): WhoAmI {
  return whoami(ctx, ctx.requireUser().id);
}

export function changePassword(ctx: Ctx, raw: unknown): WhoAmI {
  const p = changePasswordPayload.parse(raw);
  const me = ctx.requireUser();
  checkPasswordRules(p.newPassword, me.email);
  if (p.newPassword === p.currentPassword) fail('VALIDATION', 'Choose a password different from the current one.');
  return withLock(ctx, () => {
    const credTable = Table.of(ctx.env, 'CREDENTIALS', 'userId');
    const c = credTable.get(me.id)!;
    const hash = hashPassword(ctx.env, p.currentPassword, hexToBytes(c.salt ?? ''), Number(c.iterations) || DEFAULT_ITERATIONS);
    if (!timingSafeEqual(hexToBytes(hash), hexToBytes(c.hash ?? ''))) fail('VALIDATION', 'Your current password is incorrect.', [{ path: 'currentPassword' }]);
    credTable.update(me.id, credentialsFor(ctx.env, p.newPassword, false, (Number(c.tokenVersion) || 0) + 1, ctx.nowIso));
    audit(ctx, 'changePassword', me.id);
    return whoami(ctx, me.id);
  });
}

export function logoutAll(ctx: Ctx): { ok: true } {
  const me = ctx.requireUser();
  withLock(ctx, () => {
    const credTable = Table.of(ctx.env, 'CREDENTIALS', 'userId');
    const c = credTable.get(me.id)!;
    credTable.update(me.id, { tokenVersion: String((Number(c.tokenVersion) || 0) + 1), updatedAt: ctx.nowIso });
    audit(ctx, 'logoutAll', me.id);
  });
  forgetUser(ctx.env, me.id);
  return { ok: true };
}

// ---- admin ----

function toAdminUser(u: Row): AdminUser {
  return {
    id: u.id ?? '',
    name: u.name ?? '',
    email: u.email ?? '',
    role: (u.role as Role) || 'SURVEYOR',
    status: (u.status as UserStatus) || 'PENDING',
    createdAt: u.createdAt ?? '',
    approvedAt: u.approvedAt ?? '',
    lastLoginAt: u.lastLoginAt ?? '',
  };
}

export function listUsers(ctx: Ctx): { users: AdminUser[] } {
  return { users: Table.of(ctx.env, 'USERS', 'id').all().map(toAdminUser) };
}

export function approveUser(ctx: Ctx, raw: unknown): AdminUser {
  const p = approvePayload.parse(raw);
  return withLock(ctx, () => {
    const users = Table.of(ctx.env, 'USERS', 'id');
    if (!users.get(p.userId)) fail('NOT_FOUND', 'No such user.');
    const next = users.update(p.userId, { status: 'ACTIVE', role: p.role, approvedAt: ctx.nowIso, approvedBy: ctx.requireUser().id, updatedAt: ctx.nowIso });
    forgetUser(ctx.env, p.userId);
    audit(ctx, 'approve', p.userId, p.role);
    return toAdminUser(next);
  });
}

export function revokeUser(ctx: Ctx, raw: unknown): AdminUser {
  const p = userIdPayload.parse(raw);
  if (p.userId === ctx.requireUser().id) fail('VALIDATION', 'You cannot revoke your own access.');
  return withLock(ctx, () => {
    const users = Table.of(ctx.env, 'USERS', 'id');
    if (!users.get(p.userId)) fail('NOT_FOUND', 'No such user.');
    const next = users.update(p.userId, { status: 'REVOKED', updatedAt: ctx.nowIso });
    forgetUser(ctx.env, p.userId);
    audit(ctx, 'revoke', p.userId);
    return toAdminUser(next);
  });
}

/** Password reset: a one-time password, forced change at next sign-in, every earlier session revoked. */
export function issuePassword(ctx: Ctx, raw: unknown): IssuePasswordResult {
  const p = userIdPayload.parse(raw);
  return withLock(ctx, () => {
    const credTable = Table.of(ctx.env, 'CREDENTIALS', 'userId');
    const c = credTable.get(p.userId);
    if (!c) return fail('NOT_FOUND', 'No such user.');
    const temporaryPassword = generateTemporaryPassword(ctx.env.crypto);
    credTable.update(p.userId, credentialsFor(ctx.env, temporaryPassword, true, (Number(c.tokenVersion) || 0) + 1, ctx.nowIso));
    forgetUser(ctx.env, p.userId);
    audit(ctx, 'issuePassword', p.userId);
    return { temporaryPassword };
  });
}

/** setup(): the first administrator, active at once with a temporary password. */
export function ensureAdmin(env: Env, ctx: Ctx, email: string, name: string): { userId: string; temporaryPassword?: string } {
  const users = Table.of(env, 'USERS', 'id');
  const existing = users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (existing) return { userId: existing.id! };
  const id = uuidv7(env.crypto.randomBytes, ctx.nowMs);
  const temporaryPassword = generateTemporaryPassword(env.crypto);
  Table.of(env, 'CREDENTIALS', 'userId').insert({ userId: id, ...credentialsFor(env, temporaryPassword, true, 0, ctx.nowIso) });
  users.insert({ id, email: email.toLowerCase(), name, role: 'ADMIN', status: 'ACTIVE', createdAt: ctx.nowIso, approvedAt: ctx.nowIso, approvedBy: 'setup', updatedAt: ctx.nowIso });
  return { userId: id, temporaryPassword };
}
