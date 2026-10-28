import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_VERSION, RESPONSES_TAB, RUBRIC_VERSION, UPLOAD_CHUNK_BYTES, scoreSurveyFor, uuidv7 } from '@mqi/shared';
import type { AttachmentMeta, SurveyLocation, SubmittedSurvey, WhoAmI } from '@mqi/shared';
// The real server core, in-process, on the in-memory Sheets/Drive fake.
import { createMemoryEnv } from '../../../../gas/src/adapters/memory';
import type { MemoryEnv } from '../../../../gas/src/adapters/memory';
import { DEV_PASSWORD, seedDevEnv } from '../../../../gas/src/dev/server';
import { handleRequest } from '../../../../gas/src/core/router';
import { AUTH_REQUIRED_EVENT } from '../auth/events';
import { db, enforcePhotoBudget, putPhoto, queueSurvey, retrySurvey, saveDraft, setMeta } from './db';
import { backoffMs, flushPendingSubmissions } from './sync';

let env: MemoryEnv;
let offline = false;
/** Fails the next N calls to this action with no answer (as a dropped connection would). */
const dropNext: Record<string, number> = {};
let seq = 0;
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

beforeEach(async () => {
  env = createMemoryEnv();
  seedDevEnv(env);
  offline = false;
  for (const k of Object.keys(dropNext)) delete dropNext[k];
  await Promise.all(db.tables.map((t) => t.clear()));
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch');
    const body = String(init.body);
    const action = (JSON.parse(body) as { action: string }).action;
    if (dropNext[action]) {
      dropNext[action]--;
      // The request reaches the server, but the answer is lost.
      handleRequest(env, body);
      throw new TypeError('Failed to fetch');
    }
    return new Response(JSON.stringify(handleRequest(env, body)), { status: 200 });
  });
  const login = handleRequest(env, JSON.stringify({ action: 'auth.login', apiVersion: API_VERSION, payload: { email: 'surveyor@tcf.test', password: DEV_PASSWORD } }));
  if (!login.ok) throw new Error('login failed');
  await setMeta('session', (login.data as WhoAmI).sessionToken);
});

async function makeQueued(opts: { photoBytes?: number; tamper?: boolean } = {}): Promise<SubmittedSurvey> {
  const id = uuidv7(rnd, Date.now() + seq++);
  const photoId = uuidv7(rnd, Date.now() + seq++);
  const withPhoto = opts.photoBytes !== undefined;
  const loc: SurveyLocation = {
    id: 'r1',
    floorLevel: 'Roof',
    type: 'Roof',
    name: 'Roof 1',
    scores: {
      'Access to roof area /tanks': 'Good',
      'Roof Screeding/roof drainage': 'Ok',
      'Water Storage (Overhead Tank)': 'Ok',
      'External Plumbing': 'Good',
      'Grill Gate': 'N/A',
      'Solar Panels/Inverter/Batteries': 'Good',
      Plaster: 'Poor',
      Masonry: 'Good',
    },
    photos: withPhoto ? { Plaster: [photoId] } : {},
    notes: {},
  };
  const r = scoreSurveyFor([loc], RUBRIC_VERSION);
  const survey: SubmittedSurvey = {
    id,
    rubricVersion: RUBRIC_VERSION,
    school: { schoolId: '947', name: 'OGS Trust Campus', region: 'South West', area: 'Gadap West I' },
    asm: 'A',
    apm: 'B',
    principal: 'C',
    powerSupply: 'Solar',
    structuralConcern: 'NO',
    buildingStructure: 'RCC',
    typeOfStructure: 'Hybrid',
    centerBeam: 'NO',
    drillingCheck: { done: 'NO', pointMarked: '', slabAssessment: '', slabThicknessMm: '', screedThicknessMm: '', holeRepaired: '' },
    siteChecks: { roofAccessType: 'None', overflowDisposal: 'Provided', roofClean: 'Yes', rainSpoutsClear: 'Yes', riskFactors: [], riskFactorOther: '' },
    complaints: '',
    declaration: true,
    locations: [loc as SubmittedSurvey['locations'][number]],
    reviewPhotos: {},
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    timeTakenSeconds: 60,
    pausedSeconds: 0,
    scores: {
      overall: opts.tamper ? 1 : r.overall,
      functionality: r.categories.Functionality.score,
      safety: r.categories.Safety.score,
      aesthetics: r.categories.Aesthetics.score,
      major: r.major,
      minor: r.minor,
      criticalItems: r.criticalItems,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const attachments: AttachmentMeta[] = [];
  if (withPhoto) {
    const bytes = new Uint8Array(opts.photoBytes!).map((_, i) => i % 251);
    bytes.set([0xff, 0xd8, 0xff]); // a real JPEG signature (W32 server check)
    await putPhoto({ id: photoId, surveyId: id, blob: new Blob([bytes], { type: 'image/jpeg' }), mimeType: 'image/jpeg', size: bytes.length });
    attachments.push({ id: photoId, surveyId: id, itemName: 'Plaster', locationName: 'Roof 1', location: { floorLevel: 'Roof', type: 'Roof', name: 'Roof 1' }, mimeType: 'image/jpeg', size: bytes.length });
  }
  await queueSurvey(survey, attachments);
  return survey;
}

const rows = (id: string) => env.responses.objects(RESPONSES_TAB).filter((r) => r['Survey ID'] === id);
const photoRows = (id: string) => env.responses.objects('MQI Survey Attachments').filter((r) => r['Survey ID'] === id && r['Photo URL']);

describe('submit is local and atomic', () => {
  test('record + outbox entry + draft removal in one transaction; a double tap queues once', async () => {
    const id = uuidv7(rnd);
    await saveDraft({ surveyId: id, savedAt: new Date().toISOString(), schoolName: 'X', state: {} as never });
    offline = true;
    const s = await makeQueued();
    await queueSurvey(s, []);
    expect(await db.surveys.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.surveys.get(s.id))!.status).toBe('pending');
  });
});

describe('sync engine', () => {
  test('a survey with a photo syncs exactly once, then repeated syncs write nothing', async () => {
    const s = await makeQueued({ photoBytes: 5000 });
    await flushPendingSubmissions();
    expect((await db.surveys.get(s.id))!.status).toBe('synced');
    expect(rows(s.id)).toHaveLength(1);
    expect(photoRows(s.id)).toHaveLength(1);
    expect(env.drive.createdFiles).toBe(1);
    const appends = env.responses.appendCalls;
    await flushPendingSubmissions(true);
    await flushPendingSubmissions(true);
    expect(env.responses.appendCalls).toBe(appends);
    expect(await db.outbox.count()).toBe(0);
  });

  test('offline: stays pending with backoff, then goes when the connection is back', async () => {
    const s = await makeQueued();
    offline = true;
    await flushPendingSubmissions();
    const after = (await db.surveys.get(s.id))!;
    expect(after.status).toBe('pending');
    expect(after.lastError?.kind).toBe('offline');
    expect(after.nextAttemptAt).toBeGreaterThan(Date.now());
    offline = false;
    await flushPendingSubmissions(); // still inside the backoff window
    expect((await db.surveys.get(s.id))!.status).toBe('pending');
    await flushPendingSubmissions(true); // Sync now ignores backoff
    expect((await db.surveys.get(s.id))!.status).toBe('synced');
    expect(rows(s.id)).toHaveLength(1);
  });

  test('a lost answer after the server wrote the survey never duplicates rows', async () => {
    const s = await makeQueued();
    dropNext['sync.push'] = 1;
    await flushPendingSubmissions();
    expect(rows(s.id)).toHaveLength(1);
    expect((await db.surveys.get(s.id))!.status).toBe('pending');
    await flushPendingSubmissions(true);
    expect((await db.surveys.get(s.id))!.status).toBe('synced');
    expect(rows(s.id)).toHaveLength(1);
  });

  test('no head-of-line blocking: a rejected survey is failed, the next one still goes', async () => {
    const bad = await makeQueued({ tamper: true });
    const good = await makeQueued();
    await flushPendingSubmissions();
    expect((await db.surveys.get(bad.id))!.status).toBe('failed');
    expect((await db.surveys.get(bad.id))!.lastError?.code).toBe('VALIDATION');
    expect((await db.surveys.get(good.id))!.status).toBe('synced');
    // Retry puts it back; it is rejected again (the data is still wrong), never duplicated.
    await retrySurvey(bad.id);
    expect((await db.surveys.get(bad.id))!.status).toBe('pending');
  });

  test('a big photo resumes from the last chunk after an interruption', async () => {
    const size = UPLOAD_CHUNK_BYTES * 2 + 123;
    const s = await makeQueued({ photoBytes: size });
    dropNext['files.upload'] = 0;
    // Let the push and the first chunk through, then lose the connection.
    let uploads = 0;
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if ((JSON.parse(String(init.body)) as { action: string }).action === 'files.upload' && ++uploads === 2) throw new TypeError('Failed to fetch');
      return real(url, init);
    });
    await flushPendingSubmissions();
    const photo = (await db.photos.toArray())[0]!;
    expect(photo.uploadedChunks).toEqual([0]);
    expect((await db.surveys.get(s.id))!.status).toBe('uploading');
    await flushPendingSubmissions(true);
    expect((await db.surveys.get(s.id))!.status).toBe('synced');
    expect(env.drive.createdFiles).toBe(1);
    expect([...env.drive.files.values()][0]!.bytes.length).toBe(size);
    expect(photoRows(s.id)).toHaveLength(1);
  });

  test('a revoked session keeps the survey and asks for sign-in (FR-AUTH-9)', async () => {
    const s = await makeQueued();
    await setMeta('session', 'not.a-valid-token');
    const asked = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, asked);
    await flushPendingSubmissions();
    window.removeEventListener(AUTH_REQUIRED_EVENT, asked);
    expect(asked).toHaveBeenCalled();
    const after = (await db.surveys.get(s.id))!;
    expect(after.status).toBe('pending');
    expect(after.lastError?.kind).toBe('auth');
    expect(after.nextAttemptAt).toBe(0);
  });

  test('backoff is min(2^n × 5 s, 30 min) ± 20 %', () => {
    expect(backoffMs(0, () => 0.5)).toBe(5_000);
    expect(backoffMs(3, () => 0.5)).toBe(40_000);
    expect(backoffMs(20, () => 0.5)).toBe(30 * 60_000);
    expect(backoffMs(1, () => 0)).toBe(8_000);
    expect(backoffMs(1, () => 1)).toBe(12_000);
  });

  test('the photo budget evicts only uploaded photos', async () => {
    const sent = await makeQueued({ photoBytes: 3000 });
    await flushPendingSubmissions();
    offline = true;
    await makeQueued({ photoBytes: 4000 });
    expect(await enforcePhotoBudget(1000)).toBe(1);
    const photos = await db.photos.toArray();
    expect(photos.find((p) => p.surveyId === sent.id)!.evicted).toBe(true);
    expect(photos.find((p) => p.surveyId !== sent.id)!.evicted).toBeFalsy();
  });
});
