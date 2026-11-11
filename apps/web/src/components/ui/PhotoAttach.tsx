
import { useCallback, useEffect, useState } from "react";
import { Camera, Image as ImageIcon, Trash2, X } from "lucide-react";
import { UnprocessablePhotoError } from "@/lib/image/compress";
import { compressPhoto } from "@/lib/image/compress-photo";
import type { PhotoAsset } from "@/lib/types";
import { getPhoto } from "@/lib/offline/db";
import { draftPhotoCopies } from "@/lib/photos-to-phone";
import { useSurveyStateOptional } from "@/lib/survey-context";
import { SavePhotosButton } from "@/components/survey/SavePhotosButton";
import { beginPhotoSave } from "@/lib/photo-saving";
import { ConfirmDialog } from "./ConfirmDialog";
import { itemPhotoHint } from "@/lib/photo-limits";

/** The server keeps at most this many photos per item (survey schema); the buttons stop here. */
export const MAX_PHOTOS_PER_ITEM = 20;
import { IconButton } from "./IconButton";

/**
 * The photo-attach mechanism shared by the item-scoring page (ItemRow)
 * and the review page — one implementation, one underlying
 * state (whatever Record<string, PhotoAsset[]> the caller passes in via
 * onAddPhoto/onRemovePhoto), so a photo attached on either page shows up on
 * the other. Split into a hook + two small pieces rather than one combined
 * component because the two pages lay the button and the thumbnail list out
 * differently (ItemRow interleaves the button among other icons with the
 * list appearing after the condition pills; Campus Visit is a plain row).
 *
 * Compression happens here (in a Web Worker where available, v2); the
 * page-level onAddPhoto callback saves the result on the phone. Uploading
 * happens later, from the sync engine, once the survey is on the server.
 *
 * compressImage can throw UnprocessablePhotoError for a file it can't
 * decode by any method and that's too large to safely upload raw — that
 * surfaces here as `error` rather than a photo silently never appearing.
 */
export function usePhotoAttachHandler(onAddPhoto: (file: File) => void | Promise<void>) {
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlePick = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setCompressing(true);
      setError(null);
      const done = beginPhotoSave();
      try {
        await onAddPhoto(await compressPhoto(file));
      } catch (err) {
        // v2 (W31): a full phone is the one storage failure people can fix themselves — say so.
        const name = (err as { name?: string; inner?: { name?: string } } | null)?.name;
        const inner = (err as { inner?: { name?: string } } | null)?.inner?.name;
        setError(
          err instanceof UnprocessablePhotoError
            ? err.message
            : name === "QuotaExceededError" || inner === "QuotaExceededError"
              ? "This phone is out of storage, so the photo could not be saved. Free some space (delete old photos or videos) and attach it again. Nothing else was lost."
              : "This photo couldn't be processed. Try again or pick a different photo."
        );
      } finally {
        done();
        setCompressing(false);
      }
    },
    [onAddPhoto]
  );
  return { compressing, error, handlePick };
}

interface PhotoAttachButtonsProps {
  /** Used to build unique <input id>s — pass the item name. */
  itemKey: string;
  photoCount: number;
  compressing: boolean;
  onPick: (file: File | undefined) => void;
}

/**
 * Two explicit controls — "Take photo" (forces the camera via the `capture`
 * attribute) and "Choose from gallery" (a plain picker, no `capture`) —
 * rather than one button relying on the phone's native combined chooser.
 * Round 3 Task 14: confirmed with the user that explicit separate buttons
 * are preferred over removing `capture` and relying on the OS picker.
 */
export function PhotoAttachButtons({ itemKey, photoCount, compressing, onPick }: PhotoAttachButtonsProps) {
  const full = photoCount >= MAX_PHOTOS_PER_ITEM;
  const cameraId = `photo_camera_${itemKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const galleryId = `photo_gallery_${itemKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
  return (
    <div className="relative flex items-center gap-1.5 shrink-0">
      <IconButton
        active={photoCount > 0}
        aria-label="Take photo"
        onClick={() => document.getElementById(cameraId)?.click()}
        disabled={compressing || full}
      >
        <Camera size={16} />
      </IconButton>
      <IconButton
        active={photoCount > 0}
        aria-label="Choose from gallery"
        onClick={() => document.getElementById(galleryId)?.click()}
        disabled={compressing || full}
      >
        <ImageIcon size={16} />
      </IconButton>
      {photoCount > 0 ? (
        <span
          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white"
          aria-label={`${photoCount} photo${photoCount === 1 ? "" : "s"} attached`}
        >
          {photoCount}
        </span>
      ) : null}
      <input
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so picking the same file again still fires onChange — this
          // is an "add" control, not a replace-in-place one.
          e.target.value = "";
          onPick(file);
        }}
      />
      <input
        id={galleryId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          onPick(file);
        }}
      />
    </div>
  );
}

interface PhotoThumbListProps {
  photos: PhotoAsset[];
  onRemovePhoto: (id: string) => void;
  /** v1 retried failed uploads here; kept optional for call-site parity, never shown in v2. */
  onRetryPhoto?: (id: string) => void;
}

/** An object URL for a saved photo's bytes, released when the component goes away. */
function usePhotoUrl(id: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let cancelled = false;
    void getPhoto(id).then((p) => {
      if (cancelled || !p?.blob) return;
      made = URL.createObjectURL(p.blob);
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

function PhotoThumb({ photo, onOpen }: { photo: PhotoAsset; onOpen: () => void }) {
  const url = usePhotoUrl(photo.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${photo.name}`}
      className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </button>
  );
}

function PhotoViewer({ photo, onClose, onDelete }: { photo: PhotoAsset; onClose: () => void; onDelete: () => void }) {
  const url = usePhotoUrl(photo.id);
  const [confirming, setConfirming] = useState(false);
  const survey = useSurveyStateOptional();
  return (
    <div role="dialog" aria-label={photo.name} className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="truncate text-[13px]">
          {photo.name} ({(photo.size / 1024).toFixed(0)} KB)
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 flex items-center justify-center">
          <X size={22} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        {url ? <img src={url} alt={photo.name} className="max-h-full max-w-full object-contain" /> : <span className="text-white/70 text-sm">Loading…</span>}
      </div>
      <div className="px-4 py-4 space-y-3">
        {/* W50: a copy in the phone's Downloads folder, named after the campus, location and item. */}
        <SavePhotosButton
          label="Save to phone"
          className="w-full [&>button]:w-full [&>button]:justify-center [&>button]:min-h-11 [&>span]:text-white/80"
          copies={() => {
            const found = survey ? draftPhotoCopies(survey).find((c) => c.id === photo.id) : undefined;
            return [found ?? { id: photo.id, campus: survey?.school?.name ?? "Survey", date: new Date().toISOString().slice(0, 10), location: "", item: photo.name.replace(/.[^.]+$/, "") }];
          }}
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full min-h-11 rounded-xl bg-band-poor px-5 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
        >
          <Trash2 size={16} /> Delete photo
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Delete this photo?"
        message="It will be removed from this item. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/**
 * v2 (W23): the attached photos as thumbnails, each with its name and size; tap one to see it full
 * screen and delete it. Photos are saved on the phone the moment they are picked and go to the
 * server with the survey, so there is no per-photo upload state to show here.
 */
export function PhotoThumbList({ photos, onRemovePhoto }: PhotoThumbListProps) {
  const [viewing, setViewing] = useState<PhotoAsset | null>(null);
  // W49: the × sits next to the photo name; one stray tap must not lose a photo taken on site.
  const [removing, setRemoving] = useState<PhotoAsset | null>(null);
  if (photos.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {photos.length >= MAX_PHOTOS_PER_ITEM ? (
        <p className="text-[11px] text-ink-soft">{MAX_PHOTOS_PER_ITEM} photos is the most for one item.</p>
      ) : itemPhotoHint(photos.length) ? (
        // W67: a gentle limit; nothing is blocked below MAX_PHOTOS_PER_ITEM.
        <p className="text-[11px] font-semibold text-[#92400E]" data-testid="item-photo-hint">{itemPhotoHint(photos.length)}</p>
      ) : null}
      {photos.map((p) => (
        <div key={p.id} className="flex items-center gap-2.5 text-[11px] text-ink-faint">
          <PhotoThumb photo={p} onOpen={() => setViewing(p)} />
          <button type="button" onClick={() => setViewing(p)} className="flex-1 min-w-0 text-left">
            <span className="block truncate text-ink">{p.name}</span>
            <span>{(p.size / 1024).toFixed(0)} KB · tap to view</span>
          </button>
          <button
            type="button"
            onClick={() => setRemoving(p)}
            aria-label={`Remove ${p.name}`}
            className="shrink-0 min-h-11 min-w-11 flex items-center justify-center text-band-poor"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <ConfirmDialog
        open={removing !== null}
        title="Delete this photo?"
        message="It will be removed from this item. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (removing) onRemovePhoto(removing.id);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
      {viewing ? (
        <PhotoViewer
          photo={viewing}
          onClose={() => setViewing(null)}
          onDelete={() => {
            onRemovePhoto(viewing.id);
            setViewing(null);
          }}
        />
      ) : null}
    </div>
  );
}
