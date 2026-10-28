import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Role, WhoAmI } from '@mqi/shared';
import { usePathname, useRouter } from '@/shims/next-navigation';
import { ApiCallError, SESSION_KEY, api, isAuthError, rawCall } from '@/lib/api';
import { deleteMeta, setMeta } from '@/lib/offline/db';
import { flushPendingSubmissions } from '@/lib/offline/sync';
import { warmOfflineData } from '@/lib/offline/readiness';
import { AUTH_REQUIRED_EVENT } from './events';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/**
 * "loading"    — first launch, nothing remembered yet
 * "signedOut"  — no valid session on this device
 * "mustChange" — signed in with a temporary password: only the change-password page opens
 * "signedIn"   — has a session (possibly only the remembered one, if offline)
 */
type AuthStatus = 'loading' | 'signedOut' | 'mustChange' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Returns an error message to show, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  logoutEverywhere: () => Promise<string | null>;
}

const USER_KEY = 'mqi-auth-user';

function readCachedUser(): (AuthUser & { mustChange?: boolean }) | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser & { mustChange?: boolean }) : null;
  } catch {
    return null;
  }
}
function writeCachedUser(user: (AuthUser & { mustChange?: boolean }) | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Private mode: the session still works, the app just can't remember the user offline.
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

const NO_CONNECTION = 'No connection. You need to be online to sign in — you only have to do it once on this phone.';

/**
 * As in v1 (FR-AUTH-6): the signed-in user is remembered and trusted on launch, then quietly
 * re-checked online. Only a clear "no" from the server signs the device out; a failed or slow
 * request never does. The session token lives in IndexedDB (the CSP limits what can read it).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const accept = useCallback(async (w: WhoAmI) => {
    await setMeta(SESSION_KEY, w.sessionToken);
    const u = { ...w.user, mustChange: w.mustChangePassword };
    writeCachedUser(u);
    setUser(w.user);
    setStatus(w.mustChangePassword ? 'mustChange' : 'signedIn');
    // Ask the browser not to evict our data under storage pressure (unsent surveys live here).
    void navigator.storage?.persist?.().catch(() => false);
    // W31: put the campus list on the phone now, so the first survey can start with no signal.
    void warmOfflineData();
  }, []);

  const forget = useCallback(async () => {
    await deleteMeta(SESSION_KEY);
    writeCachedUser(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const verify = useCallback(async () => {
    try {
      await accept(await api<WhoAmI>('auth.whoami'));
      void flushPendingSubmissions();
    } catch (e) {
      if (isAuthError(e) && !(e instanceof ApiCallError && e.code === 'PASSWORD_CHANGE_REQUIRED')) await forget();
      else if (!readCachedUser()) setStatus('signedOut');
    }
  }, [accept, forget]);

  useEffect(() => {
    queueMicrotask(() => {
      const remembered = readCachedUser();
      if (remembered) {
        setUser(remembered);
        setStatus(remembered.mustChange ? 'mustChange' : 'signedIn');
        void verify();
      } else {
        setStatus('signedOut');
      }
    });
    const onOnline = () => readCachedUser() && void verify();
    const onAuthRequired = () => void forget();
    window.addEventListener('online', onOnline);
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    };
  }, [verify, forget]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const r = await rawCall<WhoAmI>('auth.login', { email, password });
        if (!r.ok) return r.error.message;
        await accept(r.data);
        // Anything queued while signed out can go now (FR-AUTH-9).
        void flushPendingSubmissions();
        return null;
      } catch {
        return NO_CONNECTION;
      }
    },
    [accept],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        await accept(await api<WhoAmI>('auth.changePassword', { currentPassword, newPassword }));
        void flushPendingSubmissions();
        return null;
      } catch (e) {
        return e instanceof ApiCallError && e.code !== 'NETWORK' ? e.message : 'No connection. Try again when online.';
      }
    },
    [accept],
  );

  const signOut = useCallback(async () => {
    await forget();
    // Don't leave the last dashboard readable on this phone.
    await deleteMeta('dashboard');
  }, [forget]);

  const logoutEverywhere = useCallback(async () => {
    try {
      await api('auth.logoutAll');
      await signOut();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not sign out everywhere.';
    }
  }, [signOut]);

  const value = useMemo(() => ({ status, user, signIn, changePassword, signOut, logoutEverywhere }), [status, user, signIn, changePassword, signOut, logoutEverywhere]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const PUBLIC_PATHS = ['/signin', '/signup', '/privacy', '/terms'];

/** Keeps signed-out devices on the sign-in/sign-up pages, and signed-in ones off them (FR-AUTH-4). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isAuthPage = pathname === '/signin' || pathname === '/signup';

  const mustSignIn = status === 'signedOut' && !isPublic;
  const mustChange = status === 'mustChange' && pathname !== '/change-password';
  const alreadySignedIn = status === 'signedIn' && isAuthPage;

  useEffect(() => {
    if (mustSignIn) {
      const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
      router.replace(`/signin${next}`);
    } else if (mustChange) {
      router.replace('/change-password');
    } else if (alreadySignedIn) {
      router.replace('/');
    }
  }, [mustSignIn, mustChange, alreadySignedIn, pathname, router]);

  if (status === 'loading' || mustSignIn || mustChange || alreadySignedIn) return null;
  return <>{children}</>;
}
