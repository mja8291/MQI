/** `wide` (W65): phone width on phones, wider on desktop (the dashboard's region table). */
export function ScreenShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`w-full ${wide ? "max-w-md md:max-w-4xl" : "max-w-md"} mx-auto min-h-screen flex flex-col bg-surface px-5 pt-[max(1.25rem,env(safe-area-inset-top))]`}
    >
      {children}
    </div>
  );
}
