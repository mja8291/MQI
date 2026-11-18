import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { can } from '@mqi/shared';
import type { SessionUser, WhoAmI } from '@mqi/shared';
import { AUTH_LOST, api, getSession, setSession } from './api';

type Status = 'loading' | 'signedOut' | 'signedIn' | 'noAccess' | 'mustChange';

interface Auth {
  status: Status;
  user: SessionUser | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): void;
}

const Ctx = createContext<Auth | null>(null);

/** Same accounts as the survey app. Only Cost Managers and Admins get past the sign-in. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(getSession() ? 'loading' : 'signedOut');
  const [user, setUser] = useState<SessionUser | null>(null);

  const accept = useCallback((w: WhoAmI) => {
    setSession(w.sessionToken);
    setUser(w.user);
    setStatus(w.mustChangePassword ? 'mustChange' : can(w.user.role, 'budget') ? 'signedIn' : 'noAccess');
  }, []);

  useEffect(() => {
    if (!getSession()) return;
    api<WhoAmI>('auth.whoami')
      .then(accept)
      .catch(() => {
        setSession(null);
        setStatus('signedOut');
      });
  }, [accept]);

  useEffect(() => {
    const lost = () => {
      setSession(null);
      setUser(null);
      setStatus('signedOut');
    };
    window.addEventListener(AUTH_LOST, lost);
    return () => window.removeEventListener(AUTH_LOST, lost);
  }, []);

  const value: Auth = {
    status,
    user,
    async signIn(email, password) {
      accept(await api<WhoAmI>('auth.login', { email, password }));
    },
    signOut() {
      setSession(null);
      setUser(null);
      setStatus('signedOut');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}
