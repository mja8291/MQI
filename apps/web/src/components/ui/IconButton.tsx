import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function IconButton({ active = false, className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center ${
        active ? "bg-brand-tint border-brand text-brand-deep" : "bg-white border-border text-ink-faint"
      } ${className}`}
      {...props}
    />
  );
}
