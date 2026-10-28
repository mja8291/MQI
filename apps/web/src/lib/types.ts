/**
 * v1's `@/lib/types`, now backed by @mqi/shared. Only the photo shapes differ: on the phone a
 * photo is an attachment id whose bytes sit in IndexedDB (lib/offline/db.ts), compressed in a
 * worker and uploaded by the sync engine after the survey reaches the server.
 */
export * from '@mqi/shared';
import type { Condition, FloorLevel, LocationType } from '@mqi/shared';

export interface PhotoAsset {
  /** The attachment id (UUID v7): the key of its bytes in IndexedDB and of its Files row on the server. */
  id: string;
  name: string;
  size: number;
  /** saved = stored on the phone, waiting to go with its survey (compression happens before this). */
  status: 'saved';
}

export interface SurveyLocation {
  id: string;
  floorLevel: FloorLevel;
  type: LocationType;
  name: string;
  classroomGrade?: string;
  classroomSection?: string;
  scores: Record<string, Condition>;
  photos: Record<string, PhotoAsset[]>;
  notes: Record<string, string>;
}
