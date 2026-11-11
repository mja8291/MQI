import { Download } from "lucide-react";
import { useState } from "react";
import { CONFIRM_ABOVE, photosNotYetSaved, savePhotosToPhone, type PhoneCopy } from "@/lib/photos-to-phone";

/**
 * v2 (W50): "Save to phone" — copies photos to the phone's Downloads folder (shown in the gallery).
 * `copies` is read at tap time, so the list is always the survey's current photos.
 */
export function SavePhotosButton({
  copies,
  label,
  className = "",
  single = false,
}: {
  copies: () => PhoneCopy[] | Promise<PhoneCopy[]>;
  label: string;
  className?: string;
  /** W69: one photo from the viewer — always saved. Otherwise photos saved before are skipped. */
  single?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const list = await copies();
      // W69: a big batch asks first; photos saved to Downloads before are not saved again.
      const fresh = single ? list.length : await photosNotYetSaved(list);
      if (
        !single &&
        fresh > CONFIRM_ABOVE &&
        !window.confirm(`Save ${fresh} photos to the phone's Downloads? It takes about ${Math.max(1, Math.ceil((fresh * 0.5) / 60))} min. Keep the app open until it says they are saved.`)
      )
        return;
      const { saved, skipped, alreadySaved } = await savePhotosToPhone(list, { skipSaved: !single });
      const before = alreadySaved ? `${alreadySaved} photo${alreadySaved === 1 ? " was" : "s were"} saved to Downloads earlier, so not saved again.` : "";
      setMessage(
        saved === 0
          ? before || "No photos on this phone to save."
          : [
              `${saved} photo${saved === 1 ? "" : "s"} saved to Downloads (shown in the gallery).`,
              before,
              skipped ? `${skipped} already uploaded and no longer kept on the phone.` : "",
            ]
              .filter(Boolean)
              .join(" ")
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
