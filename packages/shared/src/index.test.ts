import { expect, test } from 'vitest';
import { API_VERSION } from './index';

test('api version is a positive integer', () => {
  expect(Number.isInteger(API_VERSION) && API_VERSION > 0).toBe(true);
});
