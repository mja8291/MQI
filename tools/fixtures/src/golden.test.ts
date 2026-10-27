import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CRITICAL_ITEMS, ratingBand, scoreMethod1For, scoreMethod2For } from '@mqi/shared';
import type { Method2Location, ScoreResult } from '@mqi/shared';
import type { Method1Fixture, Method2Fixture, StoredScores } from './convert';

/**
 * Golden parity: the v2 scoring module must reproduce every score v1 stored in production.
 * The sheet holds Math.round()ed integers, so that is the precision compared.
 */

const DATA = resolve(import.meta.dirname, '../data');
const load = <T>(file: string): T[] => (existsSync(resolve(DATA, file)) ? (JSON.parse(readFileSync(resolve(DATA, file), 'utf8')) as T[]) : []);
const m2 = load<Method2Fixture>('method2.json');
const m1 = load<Method1Fixture>('method1.json');

const r = (n: number | null) => (n === null ? null : Math.round(n));

function expectParity(result: ScoreResult, stored: StoredScores) {
  expect({
    overall: r(result.overall),
    functionality: r(result.categories.Functionality.score),
    safety: r(result.categories.Safety.score),
    aesthetics: r(result.categories.Aesthetics.score),
    ratingBand: ratingBand(result.overall) ?? '',
  }).toEqual({
    overall: stored.overall,
    functionality: stored.functionality,
    safety: stored.safety,
    aesthetics: stored.aesthetics,
    ratingBand: stored.ratingBand,
  });
  // Major/Minor and the watchlist were added on 2026-08-14; older rows have them blank.
  if (stored.major !== null || stored.minor !== null) {
    expect({ major: r(result.major), minor: r(result.minor) }).toEqual({ major: stored.major, minor: stored.minor });
  }
  const anyCritical = CRITICAL_ITEMS.some((n) => stored.criticalItems[n] !== null);
  if (anyCritical) {
    const got = Object.fromEntries(CRITICAL_ITEMS.map((n) => [n, r(result.criticalItems[n] ?? null)]));
    expect(got).toEqual(stored.criticalItems);
  }
}

describe.skipIf(m2.length === 0)(`Method 2 golden parity (${m2.length} production surveys)`, () => {
  test.each(m2.map((f) => [`${f.surveyId} v=${f.rubricVersion || 'blank'} ${f.timestamp.slice(0, 10)}`, f] as const))('%s', (_label, f) => {
    const locations = f.locations.map((l) => ({ ...l, photos: {}, notes: {} })) as Method2Location[];
    expectParity(scoreMethod2For(locations, f.rubricVersion), f.stored);
  });
});

describe.skipIf(m1.length === 0)(`Method 1 golden parity (${m1.length} historical surveys)`, () => {
  test.each(m1.map((f) => [`${f.surveyId} v=${f.rubricVersion || 'blank'}`, f] as const))('%s', (_label, f) => {
    expectParity(scoreMethod1For(f.scores, f.rubricVersion), f.stored);
  });
});

// Shows as a todo (not a silent skip) until production fixtures are exported; see export.ts.
if (m2.length === 0) test.todo('export production fixtures: npm run export -w @mqi/fixtures -- --xlsx <file>');
