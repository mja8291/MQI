import { beforeEach, describe, expect, test, vi } from 'vitest';
import { db, putPhoto } from './offline/db';
import { phoneFileName, photosNotYetSaved, savePhotosToPhone } from './photos-to-phone';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('Save to phone (W50)', () => {
  test('file names carry campus, date, location and item, without characters phones refuse', () => {
    const c = { id: 'a', campus: 'OGS Trust: Campus / South', date: '2026-11-01', location: 'Girls Toilet', item: 'Wall/Column Condition i.e. cracks' };
    expect(phoneFileName(c, 1, 'image/jpeg')).toBe('MQI OGS Trust- Campus - South 2026-11-01 - Girls Toilet - Wall-Column Condition i.e. cracks.jpg');
    expect(phoneFileName(c, 2, 'image/jpeg')).toMatch(/cracks \(2\)\.jpg$/);
    expect(phoneFileName({ ...c, location: '' }, 1, 'image/png')).toBe('MQI OGS Trust- Campus - South 2026-11-01 - Wall-Column Condition i.e. cracks.png');
  });

  test('saves the photos still on the phone, numbers repeats of an item, skips missing ones', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    await putPhoto({ id: 'p1', surveyId: 's', blob: jpeg, mimeType: 'image/jpeg', size: 3 });
    await putPhoto({ id: 'p2', surveyId: 's', blob: jpeg, mimeType: 'image/jpeg', size: 3 });
    const base = { campus: 'OGS', date: '2026-11-01', location: 'Roof', item: 'Parapet' };
    const run = savePhotosToPhone([{ id: 'p1', ...base }, { id: 'p2', ...base }, { id: 'gone', ...base }]);
    await vi.runAllTimersAsync();
    expect(await run).toEqual({ saved: 2, skipped: 1, alreadySaved: 0 });
    expect(clicked).toEqual(['MQI OGS 2026-11-01 - Roof - Parapet.jpg', 'MQI OGS 2026-11-01 - Roof - Parapet (2).jpg']);

    // W69: "Save all" again saves only the new photo, under the name it would always have had.
    await putPhoto({ id: 'p3', surveyId: 's', blob: jpeg, mimeType: 'image/jpeg', size: 3 });
    clicked.length = 0;
    const again = savePhotosToPhone([{ id: 'p1', ...base }, { id: 'p2', ...base }, { id: 'p3', ...base }], { skipSaved: true });
    await vi.runAllTimersAsync();
    expect(await again).toEqual({ saved: 1, skipped: 0, alreadySaved: 2 });
    expect(clicked).toEqual(['MQI OGS 2026-11-01 - Roof - Parapet (3).jpg']);
    expect(await photosNotYetSaved([{ id: 'p1', ...base }, { id: 'p9', ...base }])).toBe(1);
    click.mockRestore();
    vi.useRealTimers();
  });
});
