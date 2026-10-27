
import { useSurvey } from "@/lib/survey-context";
import { usePhotoUploadHandlers } from "@/lib/use-photo-upload-handlers";
import { PhotoAttachButtons, PhotoThumbList, usePhotoAttachHandler } from "@/components/ui/PhotoAttach";

interface ReviewPhotoFieldProps {
  /** The question text — doubles as the photo's item name (Drive path, attachments row) and its key in state.reviewPhotos. */
  itemName: string;
  /** Shown as a hint until at least one photo is attached ("No — take picture" questions). */
  required?: boolean;
}

/**
 * Photo attach for a last-page question (the roof/drainage "No — take
 * picture" checks, the drilling pictures). Same compress → upload-on-attach →
 * retry/remove flow as every item photo; the state it writes to is
 * state.reviewPhotos, which buildSubmission folds into the submission.
 */
export function ReviewPhotoField({ itemName, required }: ReviewPhotoFieldProps) {
  const { state, reviewAddPhoto, reviewRemovePhoto } = useSurvey();
  const photos = state.reviewPhotos[itemName] ?? [];
  const { handleAddPhoto, handleRemovePhoto } = usePhotoUploadHandlers({
    surveyId: state.surveyId,
    region: state.school?.region ?? "",
    campusName: state.school?.name ?? "",
    addPhoto: reviewAddPhoto,
    removePhoto: reviewRemovePhoto,
  });
  const { compressing, error, handlePick } = usePhotoAttachHandler((file) => handleAddPhoto(itemName, file));

  return (
    <div className="-mt-2 mb-4">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs ${required && photos.length === 0 ? "text-band-poor" : "text-ink-faint"}`}>
          {required && photos.length === 0 ? "Take a picture to continue" : "Pictures"}
        </span>
        <PhotoAttachButtons itemKey={`review_${itemName}`} photoCount={photos.length} compressing={compressing} onPick={handlePick} />
      </div>
      {compressing ? <div className="text-[11px] text-ink-faint mt-1">Compressing photo…</div> : null}
      {error ? <div className="text-[11px] text-band-poor mt-1">{error}</div> : null}
      <PhotoThumbList
        photos={photos}
        onRemovePhoto={(id) => handleRemovePhoto(itemName, id)}
      />
    </div>
  );
}
