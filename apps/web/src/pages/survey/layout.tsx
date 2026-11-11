import { SurveyTimerBar } from "@/components/survey/SurveyTimerBar";
import { PhotoLoadNotice } from "@/components/survey/PhotoLoadNotice";

// SurveyProvider itself now lives in the root layout (src/app/layout.tsx)
// — see the comment there for why (Home needs it too, for
// AutoResumeRedirect). This layout keeps SurveyTimerBar, which genuinely
// is /survey/*-only: it renders nothing (returns null) on any route
// without a startTime (survey not started), which is true everywhere outside
// this tree anyway.
export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SurveyTimerBar />
      {/* W67: low phone storage / many photos. */}
      <PhotoLoadNotice />
      {children}
    </>
  );
}
