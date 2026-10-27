import { ScreenShell } from "@/components/ui/ScreenShell";

export const metadata = {
  title: "Privacy Policy — TCF MQI Survey",
};

/**
 * Required by Google's OAuth consent screen once the app leaves Testing
 * status (Application privacy policy link, Branding page) — the previous
 * value pointed at a sites.google.com page, which Google rejects for
 * Authorized Domains since nobody outside Google can verify ownership of
 * google.com. This page lives on the app's own production domain instead,
 * describing what the app's actual Google Drive/Sheets access is used for.
 */
export default function PrivacyPolicyPage() {
  return (
    <ScreenShell>
      <div className="py-8 text-sm leading-relaxed text-ink-soft [&_h1]:text-[22px] [&_h1]:mb-4 [&_h1]:text-brand-deep [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mb-1">
        <h1>Privacy Policy</h1>
        <p>Last updated: September 2026</p>

        <p>
          The TCF MQI Survey App ("the app") is an internal tool built for The Citizens Foundation (TCF) Repair
          &amp; Maintenance Programme, used by TCF staff to assess the maintenance condition of TCF school
          campuses. It is not a public product and is not distributed outside TCF staff.
        </p>

        <h2>What the app collects</h2>
        <p>When a TCF staff member completes a survey, the app records:</p>
        <ul>
          <li>The school/campus being assessed, and the region/area it belongs to.</li>
          <li>The names of the staff present (Accompanying APM, Responding ASM, School Principal).</li>
          <li>Condition scores and optional notes for each maintenance item on the checklist.</li>
          <li>Optional photographs documenting maintenance issues.</li>
        </ul>

        <h2>How it's stored</h2>
        <p>
          Submitted survey data is written directly to a Google Sheet, and any attached photos are uploaded
          directly to a Google Drive folder, both owned by TCF. No survey data is stored on, or transmitted
          through, any server or database other than Google Sheets/Drive and the Vercel infrastructure hosting
          this app. Nothing is sold, shared with advertisers, or used for any purpose other than the
          maintenance-tracking this app exists for.
        </p>
        <p>
          While a survey is in progress, its answers are also kept temporarily on the device itself (in the
          browser's local storage) so that a partially completed survey survives closing the app or losing
          connectivity — this local copy never leaves the device except as part of the same submission described
          above.
        </p>

        <h2>Google API data use</h2>
        <p>
          The app's access to Google Sheets and Google Drive is used solely to write submitted survey rows and
          photo uploads into TCF's own private spreadsheet and Drive folder. It does not read, browse, or modify
          any other file in the connected Google account, and this access is never used to display advertising.
        </p>

        <h2>Who can access this data</h2>
        <p>
          Only TCF staff with access to the underlying Google Sheet and Drive folder can view submitted survey
          data — the same access controls TCF applies to its own Google Workspace/Drive content generally.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or the data it describes can be directed to the TCF Repair &amp;
          Maintenance Programme team.
        </p>
      </div>
    </ScreenShell>
  );
}
