import { useCallback } from 'react';
import { uuidv7 } from '@mqi/shared';
import { putPhoto, removePhoto as removeStoredPhoto } from './offline/db';
import type { PhotoAsset } from './types';

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

interface UsePhotoUploadHandlersParams {
  surveyId: string | null;
  /** Kept for call-site parity with v1; the server derives the Drive path. */
  region?: string;
  campusName?: string;
  floorLevel?: string;
  locationType?: string;
  locationName?: string;
  addPhoto: (itemName: string, asset: PhotoAsset) => void;
  removePhoto: (itemName: string, id: string) => void;
  /** v1 retried a failed upload per photo; v2 uploads from the sync engine, so this is unused. */
  setPhotoStatus?: unknown;
}

/**
 * v2: a picked (already compressed) photo is saved to IndexedDB under a new attachment id and
 * added to the survey state at once. Nothing is uploaded here: the sync engine uploads it after
 * the survey reaches the server (docs/parity-notes.md D10), so an attach never waits on the network.
 */
export function usePhotoUploadHandlers({ surveyId, addPhoto, removePhoto }: UsePhotoUploadHandlersParams) {
  const handleAddPhoto = useCallback(
    async (itemName: string, file: File) => {
      if (!surveyId) throw new Error('No survey in progress');
      const id = uuidv7(rnd);
      await putPhoto({ id, surveyId, blob: file, mimeType: file.type, size: file.size });
      addPhoto(itemName, { id, name: file.name, size: file.size, status: 'saved' });
    },
    [surveyId, addPhoto],
  );

  const handleRemovePhoto = useCallback(
    (itemName: string, id: string) => {
      removePhoto(itemName, id);
      void removeStoredPhoto(id);
    },
    [removePhoto],
  );

  // v1 signature, no longer reachable (no per-photo upload to retry).
  const handleRetryPhoto = useCallback((_itemName: string, _id: string) => undefined, []);

  return { handleAddPhoto, handleRetryPhoto, handleRemovePhoto };
}
