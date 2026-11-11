/**
 * W67: how many photos a survey can comfortably carry, and when to warn.
 *
 * Each photo is compressed on the phone to at most 450 KB (lib/image/targets.ts), typically
 * 150–350 KB. Every photo is sent to Drive on its own after the survey (a few seconds each on a
 * fair signal), and the PDF report embeds each one. So:
 * - up to about 60 photos (≈ 15 MB) a survey sends in a few minutes and the report stays quick;
 * - past 60 the upload and the PDF take noticeably longer (we suggest keeping only clear evidence);
 * - past 100 (≈ 25–35 MB) uploads on a weak signal can take a long time and the PDF gets slow and
 *   large, so the warning is stronger. Nothing is blocked: the server still accepts up to 20 per item.
 * Per item, 1–3 photos are normally enough; from the 4th a hint says so.
 */
export const RECOMMENDED_PHOTOS_PER_ITEM = 3;
export const SURVEY_PHOTOS_NOTICE = 60;
export const SURVEY_PHOTOS_WARN = 100;

/** Free space for the app (browser quota) below which photos may stop saving. */
export const SPACE_LOW_MB = 200;
export const SPACE_CRITICAL_MB = 50;

export type AdviceLevel = "notice" | "warn";
export interface Advice {
  level: AdviceLevel;
  text: string;
}

export function photoCountAdvice(count: number, bytes: number): Advice | null {
  const mb = Math.max(1, Math.round(bytes / (1024 * 1024)));
  if (count > SURVEY_PHOTOS_WARN)
    return {
      level: "warn",
      text: `${count} photos (about ${mb} MB) in this survey. That is a lot: sending will take long on a weak signal and the PDF report will be slow. Keep only clear evidence: 1–3 photos per item, mainly Unsafe, Very Poor and Poor items.`,
    };
  if (count > SURVEY_PHOTOS_NOTICE)
    return {
      level: "notice",
      text: `${count} photos (about ${mb} MB) so far. Please limit photos to clear evidence (1–3 per item, mainly Unsafe, Very Poor and Poor items) so the survey sends quickly.`,
    };
  return null;
}

export function spaceAdvice(freeMb: number | null): Advice | null {
  if (freeMb === null) return null;
  if (freeMb < SPACE_CRITICAL_MB)
    return {
      level: "warn",
      text: `Phone storage is almost full (${freeMb} MB left for MQI). New photos may not save. Free up space now: delete old videos, photos or WhatsApp media, and send finished surveys (Sync Pending) when you have signal.`,
    };
  if (freeMb < SPACE_LOW_MB)
    return {
      level: "notice",
      text: `Phone storage is running short (${freeMb} MB left for MQI). Free up some space (old videos, photos, WhatsApp media) so photos keep saving.`,
    };
  return null;
}

export function itemPhotoHint(count: number): string | null {
  return count > RECOMMENDED_PHOTOS_PER_ITEM ? `${count} photos on this item. 1–3 clear photos are usually enough.` : null;
}

/** Space MQI can still use, in MB; null where the browser can't say. */
export async function freeSpaceMb(): Promise<number | null> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  const e = storage?.estimate ? await storage.estimate().catch(() => null) : null;
  return e?.quota != null ? Math.max(0, Math.floor((e.quota - (e.usage ?? 0)) / (1024 * 1024))) : null;
}
