import { Download } from "lucide-react";
import { useState } from "react";
import { savePhotosToPhone, type PhoneCopy } from "@/lib/photos-to-phone";

/**
 * v2 (W50): "Save to phone" — copies photos to the phone's Downloads folder (shown in the gallery).
 * `copies` is read at tap time, so the list is always the survey's current photos.
 */
export function SavePhotosButton({
  copies,
  label,
  className = "",
}: {
  copies: () => PhoneCopy[] | Promise<PhoneCopy[]>;
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const { saved, skipped } = await savePhotosToPhone(await copies());
      setMessage(
        saved === 0
          ? "No photos on this phone to save."
          : `${saved} photo${saved === 1 ? "" : "s"} saved to Downloads (shown in the gallery).` +
              (skipped ? ` ${skipped} already uploaded and no longer kept on the phone.` : "")
      );
    } catch {
      setMessage("Couldn't save the photos. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-border bg-white text-xs font-semibold text-brand-deep disabled:opacity-60"
      >
        <Download size={14} />
        {busy ? "Saving…" : label}
      </button>
      {message ? (
        <span role="status" className="mt-1 text-[11px] leading-snug text-ink-soft">
          {message}
        </span>
      ) : null}
    </span>
  );
}
