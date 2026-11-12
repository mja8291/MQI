/**
 * W70: the TCF logo with a turning ring around it — the app's "working" sign, like the spinner
 * other apps show. Used in the corner tag and inside buttons that wait on the server.
 */
export function WorkingLogo({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 rounded-full border-2 border-[#028090]/25 border-t-[#028090] animate-spin" />
      <img src="/tcf-logo.png" alt="" width={size * 0.72} height={size * 0.72} className="relative animate-pulse" style={{ objectFit: "contain" }} />
    </span>
  );
}
