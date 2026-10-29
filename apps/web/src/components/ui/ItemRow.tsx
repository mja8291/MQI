
import { Info, StickyNote } from "lucide-react";
import { useState } from "react";
import type { Condition, PhotoAsset, RubricItem } from "@/lib/types";
import { isUnsafe } from "@mqi/shared";
import { ConditionPills, UnsafePartsPills } from "./ConditionPills";
import { IconButton } from "./IconButton";
import { ConditionInfoPanel } from "./ConditionInfoPanel";
import { PhotoAttachButtons, PhotoThumbList, usePhotoAttachHandler } from "./PhotoAttach";

interface ItemRowProps {
  item: RubricItem;
  value: Condition | undefined;
  /** Multiple photos per item are allowed — this is the item's full list, not just the latest one. Each uploads to Drive individually on attach; see PhotoAsset. */
  photos: PhotoAsset[];
  note: string | undefined;
  onScoreChange: (value: Condition) => void;
  /** v2 (W21): parts marked unsafe, for items with unsafeParts. */
  unsafeParts?: string[];
  onUnsafePartsChange?: (parts: string[]) => void;
  onAddPhoto: (file: File) => void | Promise<void>;
  onRemovePhoto: (id: string) => void;
  onNoteChange: (value: string) => void;
  /** Set after a blocked save/return attempt, for items still unscored — shows a red asterisk so the user can see exactly what's left. */
  pending?: boolean;
}

export function ItemRow({
  item,
  value,
  photos,
  note,
  onScoreChange,
  unsafeParts,
  onUnsafePartsChange,
  onAddPhoto,
  onRemovePhoto,
  onNoteChange,
  pending,
}: ItemRowProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const { compressing, error: photoError, handlePick } = usePhotoAttachHandler(onAddPhoto);
  // v2 (W13): Unsafe needs a photo before the location can be saved.
  const unsafeNeedsPhoto = isUnsafe(item, value) && photos.length === 0;

  return (
    <div className="py-2.5 border-b border-border">
      {/* v2 (W18): name on its own line, weight and buttons below — on a 360–390 px phone the
          four buttons beside the name pushed the last one off screen and squeezed long names. */}
      <div className="mb-1">
        <span className="text-[13.5px] font-medium text-ink">
          {item.label ?? item.name}
          {pending ? (
            // A badge, not a bare trailing character — several item names
            // already end in "*" (the Minor/principal-maintained marker), so
            // a second plain "*" right after would read as a stray typo
            // rather than a distinct pending flag.
            <span
              className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-band-poor-tint align-middle text-[10.5px] font-bold text-band-poor"
              aria-label="Still needs a response"
            >
              *
            </span>
          ) : null}
        </span>
      </div>
      {/* v2 (W38): no weight / worst-case text under the name. */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <IconButton active={infoOpen} aria-label="Rating guidance" onClick={() => setInfoOpen((v) => !v)}>
            <Info size={16} />
          </IconButton>
          <PhotoAttachButtons itemKey={item.name} photoCount={photos.length} compressing={compressing} onPick={handlePick} />
          <IconButton active={noteOpen} aria-label="Add note" onClick={() => setNoteOpen((v) => !v)}>
            <StickyNote size={16} />
          </IconButton>
        </div>
      </div>
      {item.guidance ? <p className="text-[11.5px] text-ink-soft leading-snug -mt-1 mb-2">{item.guidance}</p> : null}
      {item.unsafeParts && onUnsafePartsChange ? (
        <UnsafePartsPills
          value={value}
          parts={unsafeParts ?? []}
          allParts={item.unsafeParts}
          onChange={onScoreChange}
          onPartsChange={onUnsafePartsChange}
        />
      ) : (
        <ConditionPills value={value} onChange={onScoreChange} options={item.conditionOverride} hideNA={item.hideNA} />
      )}
      {unsafeNeedsPhoto ? (
        <div className="text-[11.5px] font-medium text-band-poor mt-1.5">Marked Unsafe — attach a photo of it to save this location.</div>
      ) : null}
      {compressing ? <div className="text-[11px] text-ink-faint mt-1">Compressing photo…</div> : null}
      {photoError ? <div className="text-[11px] text-band-poor mt-1">{photoError}</div> : null}
      <PhotoThumbList photos={photos} onRemovePhoto={onRemovePhoto} />
      {noteOpen ? (
        <input
          type="text"
          placeholder="Note on this item"
          value={note ?? ""}
          onChange={(e) => onNoteChange(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border px-2.5 py-2 text-xs"
        />
      ) : null}
      {infoOpen ? <ConditionInfoPanel category={item.category} /> : null}
    </div>
  );
}
