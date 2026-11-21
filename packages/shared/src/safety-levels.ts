import { COLUMN_ITEM } from './types';

/**
 * W74 (2026-11-16), W85 (2026-11-21): two kinds of Unsafe, by the owner's rule.
 *   Critically Unsafe — Concrete/Plaster Soundness Unsafe at the slab, Ceiling Unsafe with cracks,
 *                       Wall/Column with Column Unsafe.
 *   Partially Unsafe  — any other Unsafe answer (Soundness at a beam, column or wall, or from before
 *                       W85 with no part; Ceiling seepage only,
 *                       Roof Screeding, Window Shades, Slab + Screeding assessment).
 * Wall Unsafe alone (Wall/Column item) still doesn't make a campus Unsafe (W56). Scores are unchanged
 * (Unsafe = 25%). The items are the labels unsafeItemsInRow / unsafeItemsAt give: part names for
 * Wall/Column ("Column"), "Ceiling cracks" / "Ceiling seepage", "Soundness slab" / "Soundness beam" /
 * "Soundness column" / "Soundness wall", the item label otherwise.
 */
export const CEILING_ITEM = 'Ceiling Condition i.e. cracks & seepage';
export const SOUNDNESS_ITEM = 'Concrete/Plaster Soundness';
export type UnsafeLevel = 'critical' | 'partial';

const CRITICAL: readonly string[] = [
  'Column',
  'Soundness slab',
  'Ceiling cracks',
  // A ceiling marked Unsafe before W74 (no cracks/seepage detail): critical (the cautious reading).
  // A soundness Unsafe from before W85 (no part) is Partially Unsafe, by the owner's rule (2026-11-21).
  CEILING_ITEM,
];

export function unsafeLevel(items: readonly string[] | undefined): UnsafeLevel | null {
  if (!items?.length) return null;
  return items.some((i) => CRITICAL.includes(i)) ? 'critical' : 'partial';
}

export const UNSAFE_LEVEL_LABEL: Record<UnsafeLevel, string> = { critical: 'Critically Unsafe', partial: 'Partially Unsafe' };

/** The label of one unsafe part: "Column", "Wall" for Wall/Column; "Ceiling cracks" for the ceiling. */
export function unsafePartLabel(itemName: string, part: string): string {
  if (itemName === COLUMN_ITEM) return part;
  if (itemName === CEILING_ITEM) return `Ceiling ${part.toLowerCase()}`;
  if (itemName === SOUNDNESS_ITEM) return `Soundness ${part.toLowerCase()}`;
  return `${itemName}: ${part}`;
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
