import { reportCampus } from "@mqi/shared";
import type { ReportCampus } from "@mqi/shared";
import { api } from "@/lib/api";
import { getCachedSchools } from "@/lib/offline/db";

/**
 * W81: the campus details printed at the top of a report (location, cluster, e-compound, donor, year,
 * programme, school type, siblings, last maintenance). Asked from the server for this one campus when the
 * report is made, so nothing extra is kept on phones. Offline (a draft report), the phone's saved campus
 * list still gives the location, e-compound and siblings. A report never fails for want of them.
 */
export async function campusFor(schoolId: string | undefined): Promise<ReportCampus | null> {
  if (!schoolId) return null;
  try {
    const { campus } = await api<{ campus: ReportCampus | null }>("campus.details", { schoolId });
    if (campus) return campus;
  } catch {
    // Offline, an older server, or busy: fall back to the saved list.
  }
  const list = await getCachedSchools().catch(() => null);
  return reportCampus(schoolId, list ?? []);
}
