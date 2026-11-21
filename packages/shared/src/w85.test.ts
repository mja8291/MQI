import { describe, expect, it } from 'vitest';
import { unsafeItemsInRow } from './read-models';
import { RUBRIC_GROUPS, unsafePartsFromCell, unsafePartsText } from './rubric/items';
import { RUBRIC_VERSION } from './rubric/rubric-version';
import { SOUNDNESS_ITEM, unsafeItemsAt, unsafeLevel } from './safety-levels';

/** W85 (2026-11-21): Concrete/Plaster Soundness Unsafe says where: slab (critical); beam, column or wall (partial). */

const row = (cell: string) => ({ 'Rubric Version': RUBRIC_VERSION, [SOUNDNESS_ITEM]: cell });

describe('W85 soundness parts', () => {
  it('offers Slab, Beam, Column and Wall', () => {
    expect(RUBRIC_GROUPS.find((g) => g.name === SOUNDNESS_ITEM)?.unsafeParts).toEqual(['Slab', 'Beam', 'Column', 'Wall']);
    expect(unsafePartsText(['Slab', 'Wall'])).toBe('Slab Unsafe, Wall Unsafe');
    expect(unsafePartsFromCell('Slab Unsafe, Wall Unsafe')).toEqual(['Slab', 'Wall']);
  });

  it('slab is Critically Unsafe; beam, column or wall alone is Partially Unsafe', () => {
    expect(unsafeLevel(unsafeItemsInRow(row('Column Unsafe')))).toBe('partial');
    expect(unsafeLevel(unsafeItemsInRow(row('Slab Unsafe')))).toBe('critical');
    expect(unsafeLevel(unsafeItemsInRow(row('Beam Unsafe, Wall Unsafe')))).toBe('partial');
    expect(unsafeLevel(unsafeItemsInRow(row('Wall Unsafe')))).toBe('partial');
    expect(unsafeLevel(unsafeItemsInRow(row('Beam Unsafe, Slab Unsafe')))).toBe('critical');
    expect(unsafeItemsInRow(row('Beam Unsafe'))).toEqual(['Soundness beam']);
  });

  it("an Unsafe from before W85 (no part) is Partially Unsafe (owner's rule), not ignored; OK is safe", () => {
    expect(unsafeItemsInRow(row('Unsafe'))).toEqual([SOUNDNESS_ITEM]);
    expect(unsafeLevel(unsafeItemsInRow(row('Unsafe')))).toBe('partial');
    expect(unsafeLevel(unsafeItemsInRow(row('OK')))).toBeNull();
  });

  it('the same on the phone (draft report): parts per location', () => {
    const groups = RUBRIC_GROUPS.filter((g) => g.name === SOUNDNESS_ITEM);
    expect(unsafeLevel(unsafeItemsAt({ scores: { [SOUNDNESS_ITEM]: 'Very Poor' }, unsafeParts: { [SOUNDNESS_ITEM]: ['Beam'] } }, groups))).toBe('partial');
    expect(unsafeLevel(unsafeItemsAt({ scores: { [SOUNDNESS_ITEM]: 'Very Poor' }, unsafeParts: { [SOUNDNESS_ITEM]: ['Slab'] } }, groups))).toBe('critical');
  });
});
