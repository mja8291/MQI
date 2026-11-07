import { describe, expect, test } from 'vitest';
import { migrateLocationType, rubricGroupsForLocation } from './index';
import type { Condition, LocationType } from './index';

const OTHER: LocationType = 'Other Room (Staff, Principal, Admin, Store etc.)';
const names = (t: LocationType) => rubricGroupsForLocation(t).map((g) => g.name);

/** W58 (2026-11-07): Canteen and UGWT get their own items. */
describe('W58 Canteen / UGWT', () => {
  test('Canteen is Other Room without Green board/Softboard/Cabinet', () => {
    expect(names('Canteen')).toEqual(names(OTHER).filter((n) => n !== 'Green board/Softboard/Cabinet'));
  });

  test('UGWT: Other Room safety items, External Plumbing as the only Functionality item, Plaster but no Paint', () => {
    const ugwt = rubricGroupsForLocation('UGWT');
    expect(ugwt.filter((g) => g.category === 'Safety').map((g) => g.name)).toEqual(rubricGroupsForLocation(OTHER).filter((g) => g.category === 'Safety').map((g) => g.name));
    expect(ugwt.filter((g) => g.category === 'Functionality').map((g) => g.name)).toEqual(['External Plumbing']);
    expect(ugwt.filter((g) => g.category === 'Aesthetics').map((g) => g.name)).toEqual(['Plaster']);
  });

  test('a W56 draft location becomes Canteen or UGWT by its name, keeping only that type\'s scores', () => {
    const scores = Object.fromEntries(names(OTHER).map((n) => [n, 'Good'])) as Record<string, Condition>;
    const ugwt = migrateLocationType({ type: 'Canteen & UGWT' as LocationType, name: 'UGWT 2', scores });
    expect(ugwt.type).toBe('UGWT');
    expect(Object.keys(ugwt.scores).sort()).toEqual(names('UGWT').filter((n) => n !== 'External Plumbing').sort()); // External Plumbing still to score
    const canteen = migrateLocationType({ type: 'Canteen & UGWT' as LocationType, name: 'Canteen', scores });
    expect(canteen.type).toBe('Canteen');
    expect(canteen.scores['Green board/Softboard/Cabinet']).toBeUndefined();
    const room = { type: OTHER, name: 'Staff room', scores };
    expect(migrateLocationType(room)).toBe(room);
  });
});
