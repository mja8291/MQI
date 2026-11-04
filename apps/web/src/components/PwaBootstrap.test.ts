import { describe, expect, test } from 'vitest';
import { safeToUpdate } from './PwaBootstrap';

describe('automatic update (W53)', () => {
  test('applies outside a survey and on its Done screen, never mid-survey', () => {
    for (const p of ['/', '/signin', '/dashboard', '/survey/done']) expect(safeToUpdate(p)).toBe(true);
    for (const p of ['/survey/details', '/survey/locations', '/survey/locations/category', '/survey/review']) expect(safeToUpdate(p)).toBe(false);
  });
});
