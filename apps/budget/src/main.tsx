import { StrictMode, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { ROLE_LABEL } from '@mqi/shared';
import './styles.css';
import { ENV_NAME, errorText } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import { HomePage } from './pages/Home';
import { CyclePage } from './pages/Cycle';
import { ScenarioPage } from './pages/Scenario';
import { CategoryPage } from './pages/Category';
import { ComparePage } from './pages/Compare';

function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="bg-brand-deep text-white">
        <div className="mx-auto max-w-[1720px] px-4 h-14 flex items-center gap-3">
          <img src="/tcf-logo.png" alt="" className="h-8 w-8 rounded bg-white p-0.5" />
          <Link to="/" className="font-semibold text-[15px]">
            R&amp;M Budget
          </Link>
          {ENV_NAME !== 'production' ? <span className="rounded bg-amber px-2 py-0.5 text-[11px] font-bold uppercase">{ENV_NAME}</span> : null}
          <div className="flex-1" />
          {user ? (
            <span className="text-[12.5px] text-white/80">
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
          ) : null}
          {user ? (
            <button type="button" onClick={signOut} className="text-[12.5px] underline">
              Sign out
            </button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-[1720px] px-4 py-6">{children}</main>
    </div>
  );
}

function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="card mx-auto mt-10 max-w-sm p-6 space-y-3">
      <h1 className="text-lg font-semibold text-brand-deep">Sign in</h1>
      <p className="text-[13px] text-ink-soft">Use your MQI account. The budget is open to Cost Managers and Administrators.</p>
      <label className="block text-[13px]">
        Email
        <input className="cell mt-1 w-full" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="block text-[13px]">
        Password
        <input className="cell mt-1 w-full" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error ? <p className="text-[13px] text-warn" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function Gate() {
  const { status, signOut, user } = useAuth();
  if (status === 'loading') return <p className="text-ink-soft">Opening…</p>;
  if (status === 'signedOut') return <SignIn />;
  if (status === 'mustChange')
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-[14px]">
        Your password must be changed first. Open the MQI app, sign in and set a new password, then come back here.
        <div className="mt-4">
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  if (status === 'noAccess')
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-[14px]" role="alert">
        {user?.role === 'REVIEWER' ? (
          // W91: Reviewers will get the budget once it is designed for them.
          <>
            <b>Site under construction.</b> The R&amp;M Budget for reviewers is being designed and will open here when it is launched.
          </>
        ) : (
          <>This account doesn&apos;t have access to the R&amp;M Budget. Ask an administrator to give you the Cost Manager role.</>
        )}
        <div className="mt-4">
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/cycle/:cycleId" element={<CyclePage />} />
        <Route path="/cycle/:cycleId/compare" element={<ComparePage />} />
        <Route path="/scenario/:scenarioId" element={<ScenarioPage />} />
        <Route path="/scenario/:scenarioId/category/:categoryId" element={<CategoryPage />} />
        <Route path="*" element={<p>Page not found. <Link to="/" className="underline">Home</Link></p>} />
      </Routes>
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Shell>
          <Gate />
        </Shell>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
