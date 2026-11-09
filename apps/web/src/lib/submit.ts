import { RUBRIC_VERSION, columnCheckApplies, scoreSurveyFor, submissionIssues, submittedSurveySchema, unsafeWithoutPhoto, withDerivedScores } from '@mqi/shared';
import type { AttachmentMeta, RuleIssue, ScoreResult, SubmittedSurvey } from '@mqi/shared';
import { getPhoto } from './offline/db';
import type { SurveyState } from './survey-context';
import type { PhotoAsset } from './types';

/**
 * Builds the survey record pushed by sync.push (v1 buildSubmission's job): plain data plus
 * attachment metadata; photo bytes stay in IndexedDB and upload after the server has the survey.
 * Timing is computed exactly as v1 did.
 */
export interface Submission {
  survey: SubmittedSurvey;
  attachments: AttachmentMeta[];
  /** W46: photos in the survey whose bytes are no longer on the phone (left out of the submission). */
  lostPhotoIds: string[];
}

type SubmitState = SurveyState & { reviewPhotos: Record<string, PhotoAsset[]> };

/** W47: the note recorded on an item whose photo the app lost and that was not retaken. */
export const PHOTO_LOST_NOTE = 'Photo lost on the phone by an app fault (W46) and not retaken; rating kept.';

/** W56: `_screenResult` is what the screen showed; the survey is scored here, with the items derived from the drilling and overflow answers. */
export async function buildSubmission(state: SubmitState, _screenResult?: ScoreResult): Promise<Submission> {
  if (!state.school || !state.surveyId) throw new Error('No survey in progress');
  const endTime = new Date().toISOString();
  const endMs = Date.parse(endTime);
  const openPauseSeconds = state.pausedAt ? Math.max(0, (endMs - Date.parse(state.pausedAt)) / 1000) : 0;
  const pausedSeconds = Math.round(state.pausedSeconds + openPauseSeconds);
  const timeTakenSeconds = state.startTime ? Math.max(0, Math.round((endMs - Date.parse(state.startTime)) / 1000) - pausedSeconds) : null;

  const attachments: AttachmentMeta[] = [];
  const lostPhotoIds: string[] = [];
  const addAttachment = async (p: PhotoAsset, itemName: string, locationName: string, location?: AttachmentMeta['location']) => {
    const stored = await getPhoto(p.id);
    if (!stored) {
      lostPhotoIds.push(p.id); // the bytes are gone: the review page asks for the photo again
      return false;
    }
    attachments.push({ id: p.id, surveyId: state.surveyId!, itemName, locationName, location, mimeType: stored.mimeType as AttachmentMeta['mimeType'], size: stored.size });
    return true;
  };

  const locations: SubmittedSurvey['locations'] = [];
  // W47: a survey pruned by the first W46 release lost photos without a record of their items; there,
  // every Unsafe item still without a photo is treated as one whose photo was lost.
  const unrecorded = (state.lostPhotos ?? 0) > 0 && !state.scoring.locations.some((l) => l.photoLost?.length);
  for (const loc of state.scoring.locations) {
    const photos: Record<string, string[]> = {};
    for (const [itemName, list] of Object.entries(loc.photos)) {
      const ids: string[] = [];
      for (const p of list) if (await addAttachment(p, itemName, loc.name, { floorLevel: loc.floorLevel, type: loc.type, name: loc.name })) ids.push(p.id);
      if (ids.length) photos[itemName] = ids;
    }
    locations.push({
      id: loc.id,
      floorLevel: loc.floorLevel,
      type: loc.type,
      name: loc.name,
      ...(loc.classroomGrade ? { classroomGrade: loc.classroomGrade } : {}),
      ...(loc.classroomSection !== undefined ? { classroomSection: loc.classroomSection } : {}),
      scores: loc.scores,
      photos,
      notes: loc.notes,
      ...(loc.unsafeParts && Object.keys(loc.unsafeParts).length ? { unsafeParts: loc.unsafeParts } : {}),
      // W41: the follow-up travels only while Column Unsafe is selected.
      ...(loc.columnCheck && columnCheckApplies(loc) ? { columnCheck: loc.columnCheck } : {}),
    });
    // W47: an item whose photo the app lost and that still has none is sent with a note saying so.
    const last = locations.at(-1)!;
    const lost = [...new Set([...(loc.photoLost ?? []), ...(unrecorded ? unsafeWithoutPhoto({ ...loc, photos }) : [])])].filter((item) => !photos[item]?.length);
    if (lost.length) {
      last.photoLost = lost;
      last.notes = { ...last.notes };
      for (const item of lost) last.notes[item] = [last.notes[item]?.trim(), PHOTO_LOST_NOTE].filter(Boolean).join(' \u2014 ');
    }
  }
  const reviewPhotos: Record<string, string[]> = {};
  for (const [itemName, list] of Object.entries(state.reviewPhotos)) {
    const ids: string[] = [];
    for (const p of list) if (await addAttachment(p, itemName, '')) ids.push(p.id);
    if (ids.length) reviewPhotos[itemName] = ids;
  }

  // W56: Roof locations carry the items scored from the drilling card and the overflow answer.
  const scoredLocations = withDerivedScores(locations, state.drillingCheck, state.siteChecks);
  const result = scoreSurveyFor(scoredLocations, RUBRIC_VERSION);

  const survey: SubmittedSurvey = {
    id: state.surveyId,
    rubricVersion: RUBRIC_VERSION,
    school: state.school,
    asm: state.asm,
    apm: state.apm,
    principal: state.principal,
    purpose: state.purpose ?? "Assessment",
    powerSupply: state.powerSupply,
    structuralConcern: state.structuralConcern,
    buildingStructure: state.buildingStructure,
    typeOfStructure: state.typeOfStructure,
    centerBeam: state.centerBeam,
    drillingCheck: { slabAssessment: '', ...state.drillingCheck },
    siteChecks: state.siteChecks,
    complaints: state.complaints,
    declaration: true,
    ...(state.levels ? { levels: state.levels } : {}),
    locations: scoredLocations,
    reviewPhotos,
    startTime: state.startTime,
    endTime,
    timeTakenSeconds,
    pausedSeconds,
    scores: {
      overall: result.overall,
      functionality: result.categories.Functionality.score,
      safety: result.categories.Safety.score,
      aesthetics: result.categories.Aesthetics.score,
      major: result.major,
      minor: result.minor,
      criticalItems: result.criticalItems,
    },
    createdAt: state.startTime ?? endTime,
    updatedAt: endTime,
  };
  return { survey, attachments, lostPhotoIds };
}

/** The same schema and rules the server applies, so a survey is never queued only to be rejected. */
export function checkSubmission(s: Submission): RuleIssue[] {
  const parsed = submittedSurveySchema.safeParse(s.survey);
  if (!parsed.success) return parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return submissionIssues(parsed.data, new Set(s.attachments.map((a) => a.id)));
}

/** v1 counted photos still uploading (they blocked Submit). v2 photos are saved on pick, so none are. */
export function countUnresolvedPhotos(_maps: Record<string, PhotoAsset[]>[]): { uploading: number; failed: number } {
  return { uploading: 0, failed: 0 };
}
