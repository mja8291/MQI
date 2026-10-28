import { useEffect, useState } from "react";
import { Check, CloudOff, Download, FileText, Loader2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenShell } from "@/components/ui/ScreenShell";
import { useSurvey } from "@/lib/survey-context";
import { db } from "@/lib/offline/db";
import { flushPendingSubmissions } from "@/lib/offline/sync";
import { downloadSurveyExcel, downloadSurveyPdf } from "@/lib/export/submitted";

/**
 * v2: the survey is already safe on the phone when this opens (FR-HOME-5/6). The screen follows
 * its real status live: sending → submitted (with the Excel/PDF copies, FR-EXP-1) or saved
 * offline (View queue).
 */
export default function DonePage() {
  const { reset } = useSurvey();
  const params = useSearchParams();
  const surveyId = params.get("id");
  const record = useLiveQuery(() => (surveyId ? db.surveys.get(surveyId) : undefined), [surveyId]);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Clear survey state once we have landed here, not before leaving Review (that raced the navigation in v1).
  useEffect(() => {
    reset();
    void flushPendingSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onServer = record?.status === "synced" || record?.status === "uploading";
  const sending = record?.status === "pending" && !record.lastError;
  const offline = !onServer && !sending;

  // v2 (W29): a weak or missing connection lands on Sync Pending, which explains what to do and
  // keeps retrying — as soon as the first attempt fails, or after 20 s still sending.
  const router = useRouter();
  const failedToSend = record !== undefined && offline && record.status !== "failed";
  useEffect(() => {
    if (failedToSend) {
      router.replace("/?tab=sync&weak=1");
      return;
    }
    if (!sending) return;
    const t = setTimeout(() => router.replace("/?tab=sync&weak=1"), 20_000);
    return () => clearTimeout(t);
  }, [failedToSend, sending, router]);

  async function download(kind: "excel" | "pdf") {
    if (!surveyId || busy) return;
    setBusy(kind);
    setDownloadError(null);
    try {
      await (kind === "excel" ? downloadSurveyExcel(surveyId) : downloadSurveyPdf(surveyId));
    } catch {
      setDownloadError("Couldn't download right now. Try again from the Queue tab later.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScreenShell>
      <div className="flex-[0.3]" />
      <div className="h-16 w-16 rounded-full bg-brand-tint text-brand flex items-center justify-center mx-auto mb-5">
        {onServer ? <Check size={30} /> : sending ? <Loader2 size={28} className="animate-spin" /> : <CloudOff size={28} />}
      </div>
      <h1 className="text-[26px] text-center text-brand-deep mb-1.5">
        {onServer ? "Survey submitted" : sending ? "Sending…" : "Saved offline"}
      </h1>
      <p className="text-sm text-ink-soft text-center leading-relaxed mb-7">
        {onServer
          ? record?.status === "uploading"
            ? "The results have been written to the MQI record for this campus. Photos are still uploading — this finishes on its own."
            : "Thanks — the results have been written to the MQI record for this campus."
          : sending
            ? "Your survey is saved on this phone and is being sent now."
            : "No connection right now — this survey is saved on your device and will sync automatically the next time you're online."}
      </p>

      {onServer && surveyId ? (
        <>
          <button
            type="button"
            onClick={() => void download("excel")}
            disabled={busy !== null}
            className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-brand text-white flex items-center justify-center gap-2 mb-2.5"
          >
            <Download size={16} /> {busy === "excel" ? "Preparing…" : "Download Excel copy"}
          </button>
          <button
            type="button"
            onClick={() => void download("pdf")}
            disabled={busy !== null}
            className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-brand text-white flex items-center justify-center gap-2 mb-2.5"
          >
            <FileText size={16} /> {busy === "pdf" ? "Preparing…" : "Download PDF copy"}
          </button>
          {downloadError ? <p className="text-[11.5px] text-band-poor text-center mb-2.5">{downloadError}</p> : null}
        </>
      ) : (
        <p className="text-[11.5px] text-ink-faint text-center mb-2.5">Excel/PDF copies will be available once this survey syncs.</p>
      )}

      {offline || sending ? (
        <Link href="/?tab=sync" className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-brand text-white mb-2.5">
          View Sync Pending
        </Link>
      ) : null}
      <Link
        href="/"
        className="w-full min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-center bg-transparent text-brand-deep border border-border"
      >
        Go to Home
      </Link>
      <div className="flex-1" />
    </ScreenShell>
  );
}
