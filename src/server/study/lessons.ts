import "server-only";
import { prisma } from "@/server/db";
import { applyLessonCompletion, LESSON_STAGE } from "@/domain/srs";
import { buildLessonQueue, lessonAllowance, type CandidateSubject, type JlptBand, type ProgressInfo, type StudyPath } from "@/domain/curriculum/lesson-queue";
import { localDateKey, startOfLocalDay } from "@/domain/time";
import type { StudyContext } from "./context";

export async function loadCandidates(): Promise<CandidateSubject[]> {
  const subjects = await prisma.subject.findMany({
    select: {
      id: true,
      type: true,
      lessonOrder: true,
      components: { select: { componentSubjectId: true } },
      classifications: {
        where: { classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] } },
        select: { classificationValue: true },
      },
    },
  });
  return subjects.map((s) => ({
    id: s.id,
    type: s.type as CandidateSubject["type"],
    lessonOrder: s.lessonOrder,
    band: (s.classifications[0]?.classificationValue as JlptBand | undefined) ?? null,
    componentIds: s.components.map((c) => c.componentSubjectId),
  }));
}

export async function loadProgressMap(userId: string): Promise<Map<string, ProgressInfo>> {
  const rows = await prisma.userSubjectProgress.findMany({
    where: { userId },
    select: { subjectId: true, srsStage: true, markedKnownAt: true, suspendedAt: true },
  });
  return new Map(rows.map((r) => [r.subjectId, { stage: r.srsStage, markedKnown: !!r.markedKnownAt, suspended: !!r.suspendedAt }]));
}

export interface LessonQueueResult {
  queue: CandidateSubject[];
  allowance: number;
  totalAvailable: number;
  lessonsCompletedToday: number;
  apprenticeCount: number;
}

export async function getLessonQueue(ctx: StudyContext, now = new Date()): Promise<LessonQueueResult> {
  const [candidates, progress, collectionOrder] = await Promise.all([
    loadCandidates(),
    loadProgressMap(ctx.userId),
    ctx.settings.activeCollectionId
      ? prisma.collectionSubject
          .findMany({ where: { collectionId: ctx.settings.activeCollectionId }, orderBy: { position: "asc" }, select: { subjectId: true } })
          .then((r) => r.map((x) => x.subjectId))
      : Promise.resolve([] as string[]),
  ]);
  const queue = buildLessonQueue(candidates, progress, {
    path: ctx.settings.studyPath as StudyPath,
    targetBand: ctx.settings.targetJlpt as JlptBand,
    collectionOrder,
  });
  const dayStart = startOfLocalDay(now, ctx.timeZone);
  const [lessonsCompletedToday, apprenticeCount] = await Promise.all([
    prisma.userSubjectProgress.count({ where: { userId: ctx.userId, lessonCompletedAt: { gte: dayStart }, markedKnownAt: null } }),
    prisma.userSubjectProgress.count({ where: { userId: ctx.userId, srsStage: { gte: 1, lte: 4 }, suspendedAt: null } }),
  ]);
  const allowance = lessonAllowance({
    dailyLessonLimit: ctx.settings.dailyLessonLimit,
    lessonsCompletedToday,
    maxApprenticeItems: ctx.settings.maxApprenticeItems,
    apprenticeCount,
  });
  return { queue, allowance, totalAvailable: queue.length, lessonsCompletedToday, apprenticeCount };
}

/**
 * Completa le lezioni (dopo il quiz di acquisizione) in un'unica transazione.
 * Idempotente: un soggetto già avviato viene ignorato.
 */
export async function completeLessons(ctx: StudyContext, subjectIds: string[], now = new Date()): Promise<number> {
  const unique = [...new Set(subjectIds)].slice(0, 50);
  const localDate = localDateKey(now, ctx.timeZone);
  return prisma.$transaction(async (tx) => {
    const existing = new Set(
      (await tx.userSubjectProgress.findMany({ where: { userId: ctx.userId, subjectId: { in: unique } }, select: { subjectId: true } })).map(
        (p) => p.subjectId,
      ),
    );
    let done = 0;
    for (const subjectId of unique) {
      if (existing.has(subjectId)) continue;
      const t = applyLessonCompletion(LESSON_STAGE, now, ctx.srs);
      await tx.userSubjectProgress.create({
        data: {
          userId: ctx.userId,
          subjectId,
          srsStage: t.nextStage,
          unlockedAt: now,
          lessonCompletedAt: now,
          nextReviewAt: t.nextReviewAt,
        },
      });
      await tx.studyActivity.create({ data: { userId: ctx.userId, subjectId, activityType: "lesson_completed", localDate, timestamp: now } });
      done++;
    }
    return done;
  });
}
