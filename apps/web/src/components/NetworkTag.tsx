import { useEffect, useState } from "react";
import { useWorking } from "@/lib/busy";
import { WorkingLogo } from "@/components/ui/WorkingLogo";

/**
 * W67: a small tag in the top-right corner of every screen saying whether the phone is Online or
 * Offline (the browser's own connection state, updated as it changes). It sits in the screen's
 * top padding and ignores taps, so it never covers a button.
 */
export function NetworkTag() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  // W70: while the app works (signing in, loading, sending, making a report) the tag shows the turning TCF logo.
  const working = useWorking();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="network-tag"
      className={`pointer-events-none fixed right-1.5 top-[calc(env(safe-area-inset-top)+2px)] z-50 flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-semibold leading-[14px] shadow-sm ${
        online ? "bg-[#F0FDF4] text-[#15803D] border border-[#86EFAC]" : "bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]"
      }`}
    >
      {working ? <WorkingLogo size={14} className="-my-0.5" /> : <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#16A34A]" : "bg-[#D97706]"}`} aria-hidden />}
      {online ? "Online" : "Offline"}
      {working ? <span className="sr-only" data-testid="working">, working</span> : null}
    </div>
  );
}
