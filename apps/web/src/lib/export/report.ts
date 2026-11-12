import { buildReportModel, type ReportSource } from "@mqi/shared";
import type { FileGetResult } from "@mqi/shared";
import { api } from "@/lib/api";
import { getPhoto } from "@/lib/offline/db";
import type { ReportPhotoBytes } from "./report-pdf";

/**
 * W66: the campus report's browser side — photos are loaded (from the server for a submitted
 * survey, from the phone for a draft), shrunk to at most 900 px JPEG so the PDF stays small,
 * and handed to the renderer with the model.
 */

const MAX_SIDE = 900;

/** A photo as a small JPEG; the original bytes if the browser can't redraw it (still JPEG/PNG only). */
export async function shrinkPhoto(blob: Blob): Promise<ReportPhotoBytes | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (out) return { bytes: new Uint8Array(await out.arrayBuffer()), mimeType: "image/jpeg" };
  } catch {
    // fall through
  }
  return /jpe?g|png/i.test(blob.type) ? { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type } : null;
}

/** A submitted survey's photo, from the server. */
export async function serverPhoto(id: string): Promise<ReportPhotoBytes | null> {
  const f = await api<FileGetResult>("files.get", { attachmentId: id });
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  return shrinkPhoto(new Blob([bytes], { type: f.mimeType }));
}

/** A draft's photo, from the phone (works offline). */
export async function phonePhoto(id: string): Promise<ReportPhotoBytes | null> {
  const p = await getPhoto(id);
  if (!p || p.evicted || !p.blob.size) return null;
  return shrinkPhoto(p.blob.type ? p.blob : new Blob([p.blob], { type: p.mimeType }));
}

export async function buildReportPdf(source: ReportSource, loadPhoto: (id: string) => Promise<ReportPhotoBytes | null>): Promise<Uint8Array> {
  const { renderReportPdf } = await import("./report-pdf");
  return renderReportPdf(buildReportModel(source), { loadPhoto, generatedAt: new Date() });
}

/** W70: the principal's minor-items report (only Poor/Very Poor minor items and their photos). */
export async function buildMinorReportPdf(source: ReportSource, loadPhoto: (id: string) => Promise<ReportPhotoBytes | null>): Promise<Uint8Array> {
  const { renderMinorReportPdf } = await import("./report-pdf");
  return renderMinorReportPdf(buildReportModel(source), { loadPhoto, generatedAt: new Date() });
}
