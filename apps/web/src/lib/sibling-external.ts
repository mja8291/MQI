import type { SiblingExternalResult } from "@mqi/shared";
import { api } from "@/lib/api";
import { getMeta, setMeta } from "@/lib/offline/db";

/**
 * v2 (W30): External Development is shared by the campuses of one e-compound. When a campus is
 * chosen (online), the latest sibling record is fetched and kept on the phone, so it can pre-fill
 * External Development later even offline. Failures are silent: nothing is pre-filled.
 */
export type SiblingExternal = NonNullable<SiblingExternalResult["found"]>;

const key = (schoolId: string) => `siblingExternal:${schoolId}`;

export function prefetchSiblingExternal(schoolId: string): void {
  void api<SiblingExternalResult>("schools.siblingExternal", { schoolId })
    .then((r) => setMeta(key(schoolId), r.found))
    .catch(() => undefined);
}

export async function getSiblingExternal(schoolId: string): Promise<SiblingExternal | null> {
  return (await getMeta<SiblingExternal | null>(key(schoolId))) ?? null;
}
