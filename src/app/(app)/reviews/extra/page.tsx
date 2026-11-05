import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { getSessionState } from "@/server/study/reviews";
import { ReviewSession } from "@/components/study/review-session";

export const metadata = { title: "Studio extra" };

export default async function ExtraStudyPage() {
  const ctx = await getStudyContext();
  const session = await prisma.reviewSession.findFirst({
    where: { userId: ctx.userId, status: "active", kind: "extra_study" },
    orderBy: { startedAt: "desc" },
  });
  if (!session) redirect("/reviews");
  const state = await getSessionState(ctx, session.id);
  return (
    <ReviewSession
      initial={state}
      typoTolerance={ctx.settings.typoTolerance}
      questionPriority={ctx.settings.questionPriority as "balanced" | "meaning_first" | "reading_first"}
      showRomajiHints={ctx.settings.showRomajiHints}
    />
  );
}
