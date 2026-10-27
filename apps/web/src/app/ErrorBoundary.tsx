import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '@/lib/observability';

/** Last line of defence: a crash shows a recoverable screen (drafts are safe in IndexedDB) and is logged. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void reportError(Object.assign(error, { stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}` }));
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="w-full max-w-md mx-auto min-h-screen flex flex-col justify-center px-5 text-center">
        <h1 className="text-[22px] text-brand-deep mb-2">Something went wrong</h1>
        <p className="text-sm text-ink-soft mb-6">Your survey is saved on this phone. Reopen the app to carry on.</p>
        <button type="button" onClick={() => location.assign('/')} className="w-full min-h-11 rounded-xl bg-brand text-white text-sm font-semibold">
          Reopen
        </button>
      </main>
    );
  }
}
