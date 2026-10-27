
import { Info, StickyNote } from "lucide-react";
import { useState } from "react";
import type { Condition, PhotoAsset, RubricItem } from "@/lib/types";
import { ConditionPills } from "./ConditionPills";
import { IconButton } from "./IconButton";
import { ConditionInfoPanel } from "./ConditionInfoPanel";
import { PhotoAttachButtons, PhotoThumbList, usePhotoAttachHandler } from "./PhotoAttach";

interface ItemRowProps {
  item: RubricItem;
  worstCase?: boolean;
  value: Condition | undefined;
  /** Multiple photos per item are allowed — this is the item's full list, not just the latest one. Each uploads to Drive individually on attach; see PhotoAsset. */
  photos: PhotoAsset[];
  note: string | undefined;
  onScoreChange: (value: Condition) => void;
  onAddPhoto: (file: File) => void | Promise<void>;
  onRemovePhoto: (id: string) => void;
  onNoteChange: (value: string) => void;
  /** Set after a blocked save/return attempt, for items still unscored — shows a red asterisk so the user can see exactly what's left. */
  pending?: boolean;
}

export function ItemRow({
  item,
  worstCase,
  value,
  photos,
  note,
  onScoreChange,
  onAddPhoto,
  onRemovePhoto,
  onNoteChange,
  pending,
}: ItemRowProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  const { compressing, error: photoError, handlePick } = usePhotoAttachHandler(onAddPhoto);

  return (
    <div className="py-2.5 border-b border-border">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13.5px] font-medium text-ink">
          {item.name}
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
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10.5px] text-ink-faint whitespace-nowrap">
            {item.weight}%{worstCase ? " · worst-case" : ""}
          </span>
          <IconButton active={infoOpen} aria-label="Rating guidance" onClick={() => setInfoOpen((v) => !v)}>
            <Info size={16} />
          </IconButton>
          <PhotoAttachButtons itemKey={item.name} photoCount={photos.length} compressing={compressing} onPick={handlePick} />
          <IconButton active={noteOpen} aria-label="Add note" onClick={() => setNoteOpen((v) => !v)}>
            <StickyNote size={16} />
          </IconButton>
        </div>
      </div>
      <ConditionPills value={value} onChange={onScoreChange} options={item.conditionOverride} hideNA={item.hideNA} />
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
