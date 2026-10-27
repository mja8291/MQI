export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-surface border-t border-border">
      {children}
    </div>
  );
}
