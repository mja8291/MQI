import { ATTACHMENTS_HEADER, ATTACHMENTS_TAB, METHOD2_HEADER, METHOD2_TAB } from '@mqi/shared';
import { ensureAdmin } from './auth';
import { Ctx, PROP } from './context';
import type { Env } from './ports';
import { ensureHeader } from './responses';
import { ensureSystemTabs } from './system';

/** Bump when System tabs or response columns change; the next request upgrades by itself. */
export const SCHEMA_VERSION = '1';

/**
 * Idempotent server preparation, shared by setup() (run once from the editor) and every
 * request after a deploy: System tabs and columns, then the v2 columns on the response tabs
 * (only ever appended at the end: Source App).
 */
export function ensureSchema(env: Env): { created: string[] } {
  const created = ensureSystemTabs(env);
  ensureHeader(env, METHOD2_TAB, METHOD2_HEADER);
  ensureHeader(env, ATTACHMENTS_TAB, ATTACHMENTS_HEADER);
  return { created };
}

export function upgradeIfNeeded(env: Env): void {
  if (env.props.get(PROP.SCHEMA_VERSION) === SCHEMA_VERSION) return;
  if (!env.lock.tryLock(30_000)) return; // another request is upgrading; next request tries again
  try {
    if (env.props.get(PROP.SCHEMA_VERSION) === SCHEMA_VERSION) return;
    ensureSchema(env);
    env.props.set(PROP.SCHEMA_VERSION, SCHEMA_VERSION);
  } finally {
    env.lock.release();
  }
}

export function setupCore(env: Env): string[] {
  const out: string[] = [];
  const { created } = ensureSchema(env);
  out.push(`System tabs created: ${created.join(', ') || '(none)'}`);
  env.props.set(PROP.SCHEMA_VERSION, SCHEMA_VERSION);
  const email = env.props.get(PROP.ADMIN_EMAIL);
  if (email) {
    const ctx = new Ctx(env, 'setup', 'setup');
    const r = ensureAdmin(env, ctx, email.trim(), env.props.get(PROP.ADMIN_NAME) || 'Administrator');
    out.push(r.temporaryPassword ? `First administrator ${email} created. Temporary password (shown once): ${r.temporaryPassword}` : `Administrator ${email} already exists.`);
  } else {
    out.push('ADMIN_EMAIL is not set: no administrator created.');
  }
  return out;
}
