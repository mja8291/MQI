import type { LocationType, SharedLocation, SiblingExternalResult } from "@mqi/shared";
import { api } from "@/lib/api";
import { getMeta, setMeta } from "@/lib/offline/db";

/**
 * v2 (W30): External Development is shared by the campuses of one e-compound. When a campus is
 * chosen (online), the latest sibling record is fetched and kept on the phone, so it can pre-fill
 * External Development later even offline. Failures are silent: nothing is pre-filled.
 * v2 (W60): the same for Guardroom, Canteen and UGWT (the latest of each, by name).
 */
export type SiblingExternal = NonNullable<SiblingExternalResult["found"]>;

const key = (schoolId: string) => `siblingExternal:${schoolId}`;
const sharedKey = (schoolId: string) => `siblingShared:${schoolId}`;

export function prefetchSiblingExternal(schoolId: string): void {
  void api<SiblingExternalResult>("schools.siblingExternal", { schoolId })
    .then(async (r) => {
      await setMeta(key(schoolId), r.found);
      await setMeta(sharedKey(schoolId), r.shared ?? []);
    })
    .catch(() => undefined);
}

export async function getSiblingExternal(schoolId: string): Promise<SiblingExternal | null> {
  return (await getMeta<SiblingExternal | null>(key(schoolId))) ?? null;
}

/** W60: the sibling's latest location of this type and name (e.g. Guardroom "Guardroom"), if any. */
export async function getSiblingShared(schoolId: string, type: LocationType, name: string): Promise<SharedLocation | null> {
  const list = (await getMeta<SharedLocation[]>(sharedKey(schoolId))) ?? [];
  return list.find((l) => l.type === type && l.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
}
