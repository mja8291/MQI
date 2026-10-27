
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";

interface TopBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
}

export function TopBar({ title, subtitle, onBack, showBack = true, right }: TopBarProps) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2.5 mb-4 min-h-8">
      {showBack ? (
        <button
          type="button"
          onClick={onBack ?? (() => router.back())}
          aria-label="Back"
          className="-m-1.5 flex items-center justify-center h-10 w-10 text-ink-soft"
        >
          <ChevronLeft size={20} />
        </button>
      ) : null}
      <Logo />
      <span className="text-[15px] font-semibold text-ink truncate">{title}</span>
      {subtitle ? <span className="ml-auto text-xs text-ink-faint text-right">{subtitle}</span> : null}
      {right ? <span className="ml-auto">{right}</span> : null}
    </div>
  );
}
