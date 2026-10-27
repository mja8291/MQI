import type { Ctx } from './context';
import { fail } from './errors';

/** Wait this long for the script lock; requests are short, so a longer wait means trouble. */
export const LOCK_WAIT_MS = 10_000;

/** One script lock, short critical sections. A timeout is LOCK_TIMEOUT, which the phone retries. */
export function withLock<T>(ctx: Ctx, fn: () => T): T {
  if (!ctx.env.lock.tryLock(LOCK_WAIT_MS)) fail('LOCK_TIMEOUT', 'The server is busy. Your work is safe and will be sent again shortly.');
  try {
    return fn();
  } finally {
    ctx.env.lock.release();
  }
}
