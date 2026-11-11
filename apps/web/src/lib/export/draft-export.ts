import { RUBRIC_VERSION, buildReportModel, columnCheckApplies, itemsCovered, surveyPurposeText, withDerivedScores, type ReportSource } from "@mqi/shared";

import { buildReportPdf, phonePhoto } from "./report";
import { aggregateLocations } from "@/lib/scoring";
import { RUBRIC_GROUPS } from "@/lib/data/items";
import type { SurveyState } from "@/lib/survey-context";
import type { DrillingCheck, PhotoAsset, ScoreResult, SiteChecks } from "@/lib/types";

/** W56: the draft's locations with the items scored from the drilling and overflow answers. */
const scored = (state: SurveyState, drilling: DrillingCheck = state.drillingCheck, site: SiteChecks = state.siteChecks) =>
  withDerivedScores(state.scoring.locations, drilling, site);

/**
 * Pre-submission export fallback (Round 3 Task 9): if submission is
 * failing, the surveyor still walks away with a complete, legible record of
 * their work instead of one trapped in the app. That purpose only holds up
 * if generating the file itself doesn't need the network either — so this
 * builds straight from live SurveyContext state, client-side, reusing the
 * exact same formula-driven Excel/PDF builders the post-submission export
 * routes use (see those files' header comments).
 *
 * Photos aren't embedded. In v2 a draft's photos are only on the phone (they
 * upload after the survey is submitted), so a draft export lists no photo links
 * (docs/parity-notes.md O4).
 */

const NOT_SUBMITTED_LABEL = "Not yet submitted (draft export)";

interface DraftExportParams {
  state: SurveyState;
  result: ScoreResult;
  powerSupply: string;
  structuralConcern: string;
  buildingStructure: string;
  typeOfStructure: string;
  centerBeam: string;
  drillingCheck: DrillingCheck;
  siteChecks: SiteChecks;
  complaints: string;
}

function liveElapsedSeconds(state: SurveyState): number | null {
  if (!state.startTime) return null;
  const pausedTotal =
    state.pausedSeconds + (state.pausedAt ? (Date.now() - new Date(state.pausedAt).getTime()) / 1000 : 0);
  return Math.max(0, Math.round((Date.now() - new Date(state.startTime).getTime()) / 1000 - pausedTotal));
}

/** v2: no photo has a link before submission (see the header comment). */
function photoLinksByItem(_state: SurveyState): { itemName: string; locationName: string; url: string }[] {
  const links: { itemName: string; locationName: string; url: string }[] = [];
  return links;
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "draft";
}

export function draftExportFilenameBase(state: SurveyState): string {
  const school = sanitizeFilenamePart(state.school?.name ?? "survey");
  const date = new Date().toISOString().slice(0, 10);
  return `mqi-draft-${school}-${date}`;
}

export async function buildDraftExcelBlob(params: DraftExportParams): Promise<Blob> {
  const { state } = params;
  const links = photoLinksByItem(state);

  // W67: the report sheets (same model as the PDF), then the formula sheet.
  const { buildReportWorkbook } = await import("./report-xlsx");
  const wb = buildReportWorkbook(buildReportModel(draftReportSource(params)), {
    surveyId: state.surveyId ?? "draft",
    campusName: state.school?.name ?? "",
    submittedAt: NOT_SUBMITTED_LABEL,
    startTime: state.startTime ?? "",
    endTime: "",
    timeTakenSeconds: liveElapsedSeconds(state),
    itemsCoveredPercent: itemsCovered(scored(state), RUBRIC_VERSION).percent,
    conditions: {},
    aggregatedScores: aggregateLocations(scored(state)),
    items: RUBRIC_GROUPS,
  });

  if (links.length > 0) {
    const sheet = wb.addWorksheet("Photos");
    sheet.columns = [
      { header: "Item", key: "item", width: 40 },
      { header: "Location", key: "location", width: 24 },
      { header: "Photo link", key: "url", width: 60 },
    ];
    sheet.getRow(1).font = { bold: true };
    links.forEach((l, i) => {
      const row = sheet.getRow(i + 2);
      row.getCell(1).value = l.itemName;
      row.getCell(2).value = l.locationName;
      const cell = row.getCell(3);
      cell.value = { text: l.url, hyperlink: l.url };
      cell.font = { color: { argb: "FF0E5C4D" }, underline: true };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** W66: the campus report's input from the phone's own data (works offline). */
function draftReportSource({
  state,
  powerSupply,
  structuralConcern,
  buildingStructure,
  typeOfStructure,
  centerBeam,
  drillingCheck,
  siteChecks,
  complaints,
}: DraftExportParams): ReportSource {
  return {
    surveyId: state.surveyId ?? "draft",
    campusName: state.school?.name ?? "",
    region: state.school?.region ?? "",
    area: state.school?.area ?? "",
    submittedAt: NOT_SUBMITTED_LABEL,
    startTime: state.startTime ?? "",
    endTime: "",
    timeTakenSeconds: liveElapsedSeconds(state),
    apm: state.apm,
    asm: state.asm,
    principal: state.principal,
    powerSupply,
    structuralConcern,
    buildingStructure,
    typeOfStructure,
    centerBeam,
    drillingCheck,
    siteChecks,
    complaints,
    purpose: surveyPurposeText(state.purpose),
    submittedRubricVersion: RUBRIC_VERSION,
    draft: true,
    locations: state.scoring.locations.map((l) => ({
      floorLevel: l.floorLevel,
      type: l.type,
      name: l.name,
      scores: l.scores,
      unsafeParts: l.unsafeParts,
      columnCheck: columnCheckApplies(l) ? l.columnCheck : undefined,
    })),
    photos: [
      ...state.scoring.locations.flatMap((l) =>
        Object.entries(l.photos).flatMap(([itemName, assets]) => (assets as PhotoAsset[]).map((a) => ({ id: a.id, itemName, locationName: l.name }))),
      ),
      ...Object.entries(state.reviewPhotos).flatMap(([itemName, assets]) => assets.map((a) => ({ id: a.id, itemName, locationName: "" }))),
    ],
  };
}

export async function buildDraftPdfBlob(params: DraftExportParams): Promise<Blob> {
  // W66: the same campus report as a submitted survey, from the phone's own data (works offline).
  const bytes = await buildReportPdf(draftReportSource(params), (id) => phonePhoto(id).catch(() => null));
  // pdf-lib's Uint8Array<ArrayBufferLike> doesn't structurally satisfy
  // BlobPart's stricter Uint8Array<ArrayBuffer> under this TS lib version —
  // a runtime no-op, just a type mismatch between two otherwise-identical shapes.
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** Standard blob-download dance — no server round trip, works fully offline. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
