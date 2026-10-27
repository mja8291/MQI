import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-ink-soft mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...props}
      className={`w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint ${props.className ?? ""}`}
    />
  );
}
