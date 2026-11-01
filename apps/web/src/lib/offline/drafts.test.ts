import { beforeEach, describe, expect, test } from 'vitest';
import { db, deleteDraft, discardDraft, getPhoto, missingPhotoIds, putPhoto, saveDraft } from './db';

const draft = (surveyId: string) => ({ surveyId, savedAt: new Date().toISOString(), schoolName: 'X', state: {} as never });
const photo = (id: string, surveyId: string) => putPhoto({ id, surveyId, blob: new Blob(['jpeg'], { type: 'image/jpeg' }), mimeType: 'image/jpeg', size: 4 });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('drafts and their photos (W46)', () => {
  test('resuming a draft (deleteDraft) keeps its photos on the phone', async () => {
    await saveDraft(draft('s1'));
    await photo('p1', 's1');
    await deleteDraft('s1');
    expect(await db.drafts.get('s1')).toBeUndefined();
    expect(await getPhoto('p1')).toBeTruthy();
    expect(await missingPhotoIds(['p1'])).toEqual([]);
  });

  test('discarding a draft drops its unsent photos', async () => {
    await saveDraft(draft('s2'));
    await photo('p2', 's2');
    await photo('p3', 'other');
    await discardDraft('s2');
    expect(await db.drafts.get('s2')).toBeUndefined();
    expect(await getPhoto('p2')).toBeUndefined();
    expect(await getPhoto('p3')).toBeTruthy();
  });

  test('missingPhotoIds names the photos whose bytes are gone', async () => {
    await photo('kept', 's3');
    expect(await missingPhotoIds(['kept', 'lost-1', 'lost-2'])).toEqual(['lost-1', 'lost-2']);
    expect(await missingPhotoIds([])).toEqual([]);
  });
});

describe('draft writes land in order (W51)', () => {
  const d = (writer: string, seq: number, n: number) => ({ surveyId: 's', savedAt: '', schoolName: 'X', state: { n } as never, writer, seq });
  test('an older write from the same app session never replaces a newer one', async () => {
    await saveDraft(d('page-1', 5, 5));
    await saveDraft(d('page-1', 3, 3)); // started earlier, landed later
    expect(((await db.drafts.get('s'))!.state as unknown as { n: number }).n).toBe(5);
    await saveDraft(d('page-1', 6, 6));
    expect(((await db.drafts.get('s'))!.state as unknown as { n: number }).n).toBe(6);
  });
  test('a write from a new app session always replaces the old session\'s copy', async () => {
    await saveDraft(d('page-1', 40, 40));
    await saveDraft(d('page-2', 1, 1));
    expect(((await db.drafts.get('s'))!.state as unknown as { n: number }).n).toBe(1);
  });
});
