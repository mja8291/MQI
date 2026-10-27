
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small modal overlay for destructive confirmations (e.g. discarding in-progress work) — matches the app's card/rounded design language rather than a native browser confirm(). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-5 pb-6 sm:pb-0">
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-lg">
        <h2 className="font-display text-base font-semibold text-ink mb-2">{title}</h2>
        <p className="text-[13px] text-ink-soft leading-relaxed mb-5">{message}</p>
        <div className="flex gap-2.5">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
