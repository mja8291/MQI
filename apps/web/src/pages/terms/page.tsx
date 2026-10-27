import { ScreenShell } from "@/components/ui/ScreenShell";

export const metadata = {
  title: "Terms of Service — TCF MQI Survey",
};

/** Required by Google's OAuth consent screen alongside the privacy policy — see privacy/page.tsx for why this lives here instead of on sites.google.com. */
export default function TermsOfServicePage() {
  return (
    <ScreenShell>
      <div className="py-8 text-sm leading-relaxed text-ink-soft [&_h1]:text-[22px] [&_h1]:mb-4 [&_h1]:text-brand-deep [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mb-1">
        <h1>Terms of Service</h1>
        <p>Last updated: September 2026</p>

        <p>
          The TCF MQI Survey App ("the app") is an internal tool provided by The Citizens Foundation (TCF) for
          use by its own staff to conduct Maintenance Quality Index assessments of TCF school campuses. It is
          not offered to the public and is not intended for any use outside TCF's Repair &amp; Maintenance
          Programme.
        </p>

        <h2>Acceptable use</h2>
        <p>
          The app is provided for TCF staff to record accurate, good-faith assessments of campus maintenance
          conditions. Data entered into the app should reflect genuine site observations.
        </p>

        <h2>No warranty</h2>
        <p>
          The app is provided "as is," on a best-effort basis, without warranty of any kind. TCF makes no
          guarantee that the app will be available, error-free, or uninterrupted at all times, and is not
          liable for any loss arising from its use.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated as the app evolves. Continued use of the app after a change constitutes
          acceptance of the updated terms.
        </p>

        <h2>Contact</h2>
        <p>Questions about these terms can be directed to the TCF Repair &amp; Maintenance Programme team.</p>
      </div>
    </ScreenShell>
  );
}
