import { COLUMN_ITEM } from './types';

/**
 * W74 (2026-11-16): two kinds of Unsafe, by the owner's rule.
 *   Critically Unsafe — Concrete/Plaster Soundness Unsafe, Ceiling Unsafe with cracks, Wall/Column
 *                       with Column Unsafe.
 *   Partially Unsafe  — any other Unsafe answer (Ceiling seepage only, Roof Screeding, Window
 *                       Shades, Slab + Screeding assessment).
 * Wall Unsafe alone still doesn't make a campus Unsafe (W56). Scores are unchanged (Unsafe = 25%).
 * The items are the labels unsafeItemsInRow / unsafeItemsAt give: part names for Wall/Column
 * ("Column"), "Ceiling cracks" / "Ceiling seepage" for the ceiling, the item label otherwise.
 */
export const CEILING_ITEM = 'Ceiling Condition i.e. cracks & seepage';
export type UnsafeLevel = 'critical' | 'partial';

const CRITICAL: readonly string[] = [
  'Column',
  'Concrete/Plaster Soundness',
  'Ceiling cracks',
  // A ceiling marked Unsafe before W74 has no cracks/seepage detail: counted as critical (the cautious reading).
  CEILING_ITEM,
];

export function unsafeLevel(items: readonly string[] | undefined): UnsafeLevel | null {
  if (!items?.length) return null;
  return items.some((i) => CRITICAL.includes(i)) ? 'critical' : 'partial';
}

export const UNSAFE_LEVEL_LABEL: Record<UnsafeLevel, string> = { critical: 'Critically Unsafe', partial: 'Partially Unsafe' };

/** The label of one unsafe part: "Column", "Wall" for Wall/Column; "Ceiling cracks" for the ceiling. */
export function unsafePartLabel(itemName: string, part: string): string {
  return itemName === COLUMN_ITEM ? part : itemName === CEILING_ITEM ? `Ceiling ${part.toLowerCase()}` : `${itemName}: ${part}`;
}

/** The unsafe items at one location (as unsafeItemsInRow does for a sheet row). Wall alone is left out. */
export function unsafeItemsAt(
  loc: { scores: Record<string, string>; unsafeParts?: Record<string, string[]> },
  groups: readonly { name: string; label?: string; unsafeParts?: string[]; conditionOverride?: { condition: string; label: string }[] }[],
): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const unsafe = loc.scores[g.name] === 'Very Poor' && g.conditionOverride?.some((o) => o.condition === 'Very Poor' && o.label === 'Unsafe');
    if (!unsafe) continue;
    const parts = g.unsafeParts ? (loc.unsafeParts?.[g.name] ?? []) : [];
    if (parts.length) {
      for (const p of parts) if (!(g.name === COLUMN_ITEM && p === 'Wall')) out.push(unsafePartLabel(g.name, p));
    } else out.push(g.label ?? g.name);
  }
  return out;
}
