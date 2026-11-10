import { reportSourceFromFound } from '@mqi/shared';
import type { ExportRowsResult, FoundSurvey } from '@mqi/shared';
import { api } from '@/lib/api';
import type { SingleSurveyExportInput } from './single-survey-workbook';

/**
 * Downloads of submitted surveys, built in the browser from surveys.get (v1 built the same
 * files in /api/export/*). The mappings below are v1's route handlers, field for field, so the
 * files match; each survey is recalculated with the rubric version it was scored under
 * (FoundSurvey.items comes from that version, FR-EXP-3).
 */

export function workbookInput(found: FoundSurvey): SingleSurveyExportInput {
  return {
    surveyId: found.surveyId,
    campusName: found.campusName,
    submittedAt: found.submittedAt,
    startTime: found.startTime,
    endTime: found.endTime,
    timeTakenSeconds: found.timeTakenSeconds,
    itemsCoveredPercent: found.itemsCoveredPercent,
    conditions: found.conditions,
    aggregatedScores: found.aggregatedScores,
    items: found.items,
  };
}

export function save(data: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function downloadSurveyExcel(surveyId: string): Promise<void> {
  const [found, { buildSingleSurveyWorkbook }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./single-survey-workbook')]);
  const buf = await buildSingleSurveyWorkbook(workbookInput(found)).xlsx.writeBuffer();
  save(buf, XLSX, `mqi-survey-${surveyId}.xlsx`);
}

/** W66: the campus report (packages/shared/src/report), with the survey's photos. */
export async function downloadSurveyPdf(surveyId: string): Promise<void> {
  const [found, { buildReportPdf, serverPhoto }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./report')]);
  const bytes = await buildReportPdf(reportSourceFromFound(found), (id) => serverPhoto(id).catch(() => null));
  save(bytes as BlobPart, 'application/pdf', `mqi-survey-${surveyId}.pdf`);
}

async function allRows(): Promise<Pick<ExportRowsResult, 'header' | 'rows'>> {
  const out: Pick<ExportRowsResult, 'header' | 'rows'> = { header: [], rows: [] };
  for (let offset = 0; ; ) {
    const page = await api<ExportRowsResult>('export.rows', { offset, limit: 1000 });
    if (offset === 0) out.header = page.header;
    out.rows.push(...page.rows);
    if (!page.hasMore || page.rows.length === 0) break;
    offset += page.rows.length;
  }
  return out;
}

/** FR-EXP-2: all responses. */
export async function downloadAllResponses(): Promise<void> {
  const [rows, { buildAllResponsesWorkbook }] = await Promise.all([allRows(), import('./all-responses-workbook')]);
  const buf = await buildAllResponsesWorkbook(rows).xlsx.writeBuffer();
  save(buf, XLSX, `mqi-all-responses-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
