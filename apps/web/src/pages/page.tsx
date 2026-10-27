import { ScreenShell } from "@/components/ui/ScreenShell";
import { AutoResumeRedirect } from "@/components/AutoResumeRedirect";
import { HomeTabs } from "@/components/home/HomeTabs";

export default function HomePage() {
  return (
    <ScreenShell>
      <AutoResumeRedirect />
      <HomeTabs />
    </ScreenShell>
  );
}
