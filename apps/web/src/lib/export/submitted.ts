import { track } from '@/lib/busy';
import { buildReportModel, reportSourceFromFound } from '@mqi/shared';
import type { ExportSummaryResult, ExportRowsResult, FoundSurvey, ReportSource } from '@mqi/shared';
import { api } from '@/lib/api';
import { campusFor } from './campus';

/** W84: report files are named "Campus - Area - yyyy-mm-dd" (the survey date), not by survey ID. */
export function reportFileName(found: Pick<FoundSurvey, 'campusName' | 'area' | 'submittedAt' | 'surveyId'>): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  const date = /^\d{4}-\d{2}-\d{2}/.test(found.submittedAt) ? found.submittedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return [clean(found.campusName), clean(found.area), date].filter(Boolean).join(' - ') || found.surveyId;
}

/** W81: the report's input with the campus's details from the campus list. */
async function sourceWithCampus(found: FoundSurvey): Promise<ReportSource> {
  return { ...reportSourceFromFound(found), campus: await campusFor(found.schoolId) };
}
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
    const buf = await buildReportWorkbook(buildReportModel(await sourceWithCampus(found)), workbookInput(found)).xlsx.writeBuffer();
    save(buf, XLSX, `${reportFileName(found)}.xlsx`);
  });
}

/** W66: the campus report (packages/shared/src/report), with the survey's photos. */
export function downloadSurveyPdf(surveyId: string): Promise<void> {
  // W70: the working sign stays on while the file is made, not only while the server answers.
  return track(async () => {
    const [found, { buildReportPdf, serverPhoto, reportPhotoLoader }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./report')]);
    const photos = reportPhotoLoader(serverPhoto);
    const bytes = await buildReportPdf(await sourceWithCampus(found), photos.load);
    void photos.logFailures('Campus report');
    save(bytes as BlobPart, 'application/pdf', `${reportFileName(found)}.pdf`);
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
    // W84: Tracker and Detail are worked out on the server; without them (an older server, or busy)
    // the file still has every response under Descriptive.
    const [rows, summary, { buildAllResponsesWorkbook }] = await Promise.all([
      allRows(),
      api<ExportSummaryResult>('export.summary').catch(() => null),
      import('./all-responses-workbook'),
    ]);
    const buf = await buildAllResponsesWorkbook(rows, summary).xlsx.writeBuffer();
    save(buf, XLSX, `MQI surveys - Tracker, Detail, Descriptive - ${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}

/** W70: the principal's minor-items report for a submitted survey. */
export function downloadSurveyMinorPdf(surveyId: string): Promise<void> {
  // W70: the working sign stays on while the file is made, not only while the server answers.
  return track(async () => {
    const [found, { buildMinorReportPdf, serverPhoto, reportPhotoLoader }] = await Promise.all([api<FoundSurvey>('surveys.get', { surveyId }), import('./report')]);
    const photos = reportPhotoLoader(serverPhoto);
    const bytes = await buildMinorReportPdf(await sourceWithCampus(found), photos.load);
    void photos.logFailures('Minor items report');
    save(bytes as BlobPart, 'application/pdf', `${reportFileName(found)} - Minor items.pdf`);
  });
}
