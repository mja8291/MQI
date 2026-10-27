export function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md mx-auto min-h-screen flex flex-col bg-surface px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {children}
    </div>
  );
}
