import { track } from '@/lib/busy';
import { buildReportModel, reportSourceFromFound } from '@mqi/shared';
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

/** W67: the campus report as a workbook (same model as the PDF, no photos to fetch, so it is quick). */
export function downloadSurveyExcel(surveyId: string): Promise<void> {
  // W70: the working sign stays on while the file is made, not only while the server answers.
  return track(async () => {
    const [found, { buildReportWorkbook }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./report-xlsx')]);
    const buf = await buildReportWorkbook(buildReportModel(reportSourceFromFound(found)), workbookInput(found)).xlsx.writeBuffer();
    save(buf, XLSX, `mqi-survey-${surveyId}.xlsx`);
  });
}

/** W66: the campus report (packages/shared/src/report), with the survey's photos. */
export function downloadSurveyPdf(surveyId: string): Promise<void> {
  // W70: the working sign stays on while the file is made, not only while the server answers.
  return track(async () => {
    const [found, { buildReportPdf, serverPhoto, reportPhotoLoader }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./report')]);
    const photos = reportPhotoLoader(serverPhoto);
    const bytes = await buildReportPdf(reportSourceFromFound(found), photos.load);
    void photos.logFailures('Campus report');
    save(bytes as BlobPart, 'application/pdf', `mqi-survey-${surveyId}.pdf`);
  });
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
export function downloadAllResponses(): Promise<void> {
  // W70: the working sign stays on while the file is made, not only while the server answers.
  return track(async () => {
    const [rows, { buildAllResponsesWorkbook }] = await Promise.all([allRows(), import('./all-responses-workbook')]);
    const buf = await buildAllResponsesWorkbook(rows).xlsx.writeBuffer();
    save(buf, XLSX, `mqi-all-responses-${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}

/** W70: the principal's minor-items report for a submitted survey. */
export function downloadSurveyMinorPdf(surveyId: string): Promise<void> {
  // W70: the working sign stays on while the file is made, not only while the server answers.
  return track(async () => {
    const [found, { buildMinorReportPdf, serverPhoto, reportPhotoLoader }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./report')]);
    const photos = reportPhotoLoader(serverPhoto);
    const bytes = await buildMinorReportPdf(reportSourceFromFound(found), photos.load);
    void photos.logFailures('Minor items report');
    const name = found.campusName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || surveyId;
    save(bytes as BlobPart, 'application/pdf', `mqi-minor-items-${name}.pdf`);
  });
}
