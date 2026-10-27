import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "muted";
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center transition-colors disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-brand text-white disabled:bg-border disabled:text-ink-faint",
    ghost: "bg-transparent text-brand-deep border border-border disabled:text-ink-faint",
    // Looks like the disabled state but stays clickable — for buttons that
    // gate on a completeness check performed in onClick rather than the
    // native `disabled` attribute, so a click while incomplete can still
    // surface which items are pending instead of doing nothing.
    muted: "bg-border text-ink-faint",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
