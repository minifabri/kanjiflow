import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getStudyContext } from "@/server/study/context";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getStudyContext();
  if (!ctx.settings.onboardingCompletedAt) redirect("/onboarding");
  return <AppShell badge={`JLPT ${ctx.settings.targetJlpt}`}>{children}</AppShell>;
}
