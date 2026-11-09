import { describe, expect, test } from 'vitest';
import { isStaleCodeError } from './boot';

/** W61: the messages phones logged in ErrorLog when a newer version had replaced a screen's code. */
describe('isStaleCodeError', () => {
  test('recognises what Chrome (Android) and Safari (iPhone) report', () => {
    expect(isStaleCodeError(new TypeError('Failed to fetch dynamically imported module: https://tcfmqi.web.app/assets/page-DKAY_B5T.js'))).toBe(true);
    expect(isStaleCodeError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleCodeError(new Error('error loading dynamically imported module'))).toBe(true);
  });
  test('leaves other errors to the error screen', () => {
    expect(isStaleCodeError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isStaleCodeError('Script error.')).toBe(false);
  });
});
