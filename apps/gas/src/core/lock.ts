import type { Ctx } from './context';
import { fail } from './errors';
import { Table } from './system';

/** Wait this long for the script lock; requests are short, so a longer wait means trouble. */
export const LOCK_WAIT_MS = 10_000;

/** One script lock, short critical sections. A timeout is LOCK_TIMEOUT, which the phone retries. */
export function withLock<T>(ctx: Ctx, fn: () => T): T {
  if (!ctx.env.lock.tryLock(LOCK_WAIT_MS)) {
    // W86: busy answers used to leave no trace; at most one ErrorLog line a minute says they happen.
    try {
      const key = `lockbusy:${Math.floor(ctx.nowMs / 60_000)}`;
      if (!ctx.env.cache.get(key)) {
        ctx.env.cache.put(key, '1', 120);
        Table.log(ctx.env, 'ERRORLOG', { at: ctx.nowIso, source: 'server', requestId: ctx.requestId, action: ctx.action, userId: ctx.user?.id ?? '', code: 'LOCK_TIMEOUT', message: 'Server busy: a request waited 10 s for the lock and was told to retry.' });
      }
    } catch {
      // Logging must never hide the busy answer.
    }
    fail('LOCK_TIMEOUT', 'The server is busy. Your work is safe and will be sent again shortly.');
  }
  try {
    return fn();
  } finally {
    ctx.env.lock.release();
  }
}
