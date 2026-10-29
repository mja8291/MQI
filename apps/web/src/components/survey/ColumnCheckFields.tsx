import { SCHMIDT_PHOTO, emptyColumnCheck } from "@mqi/shared";
import type { ColumnCheck } from "@mqi/shared";
import { Field } from "@/components/ui/Field";
import { PhotoAttachButtons, PhotoThumbList, usePhotoAttachHandler } from "@/components/ui/PhotoAttach";
import type { PhotoAsset } from "@/lib/types";

/**
 * v2 (W41): shown under Wall/Column when "Column Unsafe" is selected. A crack wider than 3 mm calls
 * for a Schmidt Hammer test on the exposed concrete surface; if a hammer is available, its reading
 * and a photo of the hammer showing the reading are required.
 */
export function ColumnCheckFields({
  value,
  photos,
  onChange,
  onAddPhoto,
  onRemovePhoto,
  highlight,
}: {
  value: ColumnCheck | undefined;
  photos: PhotoAsset[];
  onChange: (value: ColumnCheck) => void;
  onAddPhoto: (file: File) => void | Promise<void>;
  onRemovePhoto: (id: string) => void;
  /** Set after a blocked save while something here is still missing. */
  highlight?: boolean;
}) {
  const c = value ?? emptyColumnCheck();
  const { compressing, error, handlePick } = usePhotoAttachHandler(onAddPhoto);
  const select = "w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink";
  return (
    <div className={`rounded-xl border px-3 pt-3 pb-1 mb-2 ${highlight ? "border-band-poor bg-band-poor-tint/40" : "border-border bg-surface"}`}>
      <div className="text-[13px] font-semibold text-ink mb-2">Column unsafe — crack check</div>
      <Field label="Is the crack width more than 3 mm?">
        <select
          aria-label="Is the crack width more than 3 mm?"
          value={c.crackOver3mm}
          onChange={(e) => onChange({ ...c, crackOver3mm: e.target.value as ColumnCheck["crackOver3mm"] })}
          className={select}
        >
          <option value="">Select an answer</option>
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      </Field>
      {c.crackOver3mm === "YES" ? (
        <>
          <p className="text-[12px] leading-snug text-band-poor -mt-1 mb-3">
            A Schmidt Hammer test needs to be performed on the concrete surface after exposing it.
          </p>
          <Field label="Is a Schmidt Hammer available?">
            <select
              aria-label="Is a Schmidt Hammer available?"
              value={c.hammerAvailable}
              onChange={(e) => onChange({ ...c, hammerAvailable: e.target.value as ColumnCheck["hammerAvailable"] })}
              className={select}
            >
              <option value="">Select an answer</option>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </Field>
        </>
      ) : null}
      {c.crackOver3mm === "YES" && c.hammerAvailable === "YES" ? (
        <>
          <Field label="Schmidt Hammer reading (rebound value)">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="e.g. 32"
              aria-label="Schmidt Hammer reading"
              value={c.reading}
              onChange={(e) => onChange({ ...c, reading: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-3 text-base text-ink"
            />
          </Field>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12.5px] text-ink">Photo of the test, reading visible on the hammer *</span>
            <PhotoAttachButtons itemKey={SCHMIDT_PHOTO} photoCount={photos.length} compressing={compressing} onPick={handlePick} />
          </div>
          {compressing ? <div className="text-[11px] text-ink-faint">Compressing photo…</div> : null}
          {error ? <div className="text-[11px] text-band-poor">{error}</div> : null}
          <PhotoThumbList photos={photos} onRemovePhoto={onRemovePhoto} />
          <div className="h-2" />
        </>
      ) : null}
    </div>
  );
}
