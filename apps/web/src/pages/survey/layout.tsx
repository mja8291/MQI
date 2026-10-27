import { SurveyTimerBar } from "@/components/survey/SurveyTimerBar";

// SurveyProvider itself now lives in the root layout (src/app/layout.tsx)
// — see the comment there for why (Home needs it too, for
// AutoResumeRedirect). This layout keeps SurveyTimerBar, which genuinely
// is /survey/*-only: it renders nothing (returns null) on any route
// without a startTime/method chosen, which is true everywhere outside
// this tree anyway.
export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SurveyTimerBar />
      {children}
    </>
  );
}
