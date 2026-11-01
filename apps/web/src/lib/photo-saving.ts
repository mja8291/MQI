import { useSyncExternalStore } from 'react';

/**
 * v2 (W51): photos still being compressed and saved. A photo is added to the location that is open
 * when its save finishes, so leaving the screen before then lost it (found by the robustness
 * suite). Screens that leave a location or the survey wait for this to reach zero.
 */
let inFlight = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call when a photo starts saving; call the returned function exactly once when it is done or failed. */
export function beginPhotoSave(): () => void {
  inFlight++;
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    inFlight--;
    emit();
  };
}

/** Resolves once no photo is being saved. */
export function whenPhotosSaved(): Promise<void> {
  if (inFlight === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (inFlight > 0) return;
      listeners.delete(check);
      resolve();
    };
    listeners.add(check);
  });
}

/** True while any photo is being saved (re-renders when that changes). */
export function usePhotoSaving(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => inFlight > 0,
  );
}
