import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { getSessionState, startOrResumeSession, countDueReviews } from "@/server/study/reviews";
import { ReviewSession } from "@/components/study/review-session";
import { ExtraStudyForm } from "@/components/study/extra-study-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Ripassi" };

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const sp = await searchParams;
  const ctx = await getStudyContext();
  const now = new Date();
  const [due, inProgress] = await Promise.all([
    countDueReviews(ctx.userId, now),
    prisma.reviewSession.findFirst({ where: { userId: ctx.userId, status: "active", kind: "review" }, select: { id: true } }),
  ]);

  if (due === 0 && !inProgress) {
    const next = await prisma.userSubjectProgress.findFirst({
      where: { userId: ctx.userId, suspendedAt: null, srsStage: { gte: 1, lte: 8 }, nextReviewAt: { gt: now } },
      orderBy: { nextReviewAt: "asc" },
      select: { nextReviewAt: true },
    });
    const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: ctx.timeZone, weekday: "long", hour: "2-digit", minute: "2-digit" });
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-2xl font-semibold">Ripassi</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-lg font-medium">Nessun ripasso in attesa</p>
            <p className="mt-2 text-sm text-muted">
              {next?.nextReviewAt ? `Il prossimo arriva ${fmt.format(next.nextReviewAt)}.` : "Completa qualche lezione per iniziare il ciclo di ripasso."}
            </p>
          </CardContent>
        </Card>
        <ExtraStudyForm empty={sp.extra === "empty"} />
      </div>
    );
  }

  const sessionId = await startOrResumeSession(ctx, "review");
  const state = await getSessionState(ctx, sessionId, now);
  return (
    <ReviewSession
      initial={state}
      typoTolerance={ctx.settings.typoTolerance}
      questionPriority={ctx.settings.questionPriority as "balanced" | "meaning_first" | "reading_first"}
      showRomajiHints={ctx.settings.showRomajiHints}
    />
  );
}
