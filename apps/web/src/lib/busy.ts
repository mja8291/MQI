import { useSyncExternalStore } from 'react';

/**
 * W70 (2026-11-13): "the app is working" — counts calls to the server and reports being made, so a
 * small spinning TCF logo can show while anything is in progress (signing in, loading the
 * dashboard, sending a survey, making a PDF).
 */
let running = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Runs `work` with the working sign on; it goes off when the work ends or fails. */
export async function track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T> {
  running++;
  emit();
  try {
    return await (typeof work === 'function' ? work() : work);
  } finally {
    running--;
    emit();
  }
}

export function useWorking(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => running > 0,
    () => false,
  );
}
