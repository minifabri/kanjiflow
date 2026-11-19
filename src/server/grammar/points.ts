import "server-only";
import { prisma } from "@/server/db";
import type { GrammarLevel } from "@/domain/grammar/content";
import { kanjiIdsOf, type Segment } from "@/domain/reading/markup";
import type { KanjiState } from "@/domain/reading/readability";
import { applyLessonCompletion, applyMarkKnown, applyReview, GURU_STAGE, isReviewable, LESSON_STAGE, type SrsStage } from "@/domain/srs";
import { localDateKey, startOfLocalDay } from "@/domain/time";
import { loadKanjiStates } from "@/server/reading/kanji-states";
import type { StudyContext } from "@/server/study/context";

export type GrammarMode = "lesson" | "review" | "practice";

/** Quanti punti nuovi al massimo in una sessione di lezione. */
export const GRAMMAR_LESSON_BATCH = 3;
/** Quanti ripassi al massimo in una sessione. */
export const GRAMMAR_REVIEW_BATCH = 20;

export interface GrammarPointSummary {
  id: string;
  slug: string;
  level: GrammarLevel;
  title: Segment[];
  meaning: string;
  /** null = non ancora studiato. */
  stage: number | null;
  nextReviewAt: Date | null;
  due: boolean;
  markedKnown: boolean;
}

export interface GrammarOverview {
  points: GrammarPointSummary[];
  dueCount: number;
  /** Punti nuovi che si possono ancora iniziare oggi. */
  lessonAllowance: number;
  lessonsToday: number;
  dailyLimit: number;
  newAvailable: number;
  nextLessons: GrammarPointSummary[];
  byLevel: Record<string, { total: number; started: number; passed: number }>;
}

export async function getGrammarOverview(ctx: StudyContext, now = new Date()): Promise<GrammarOverview> {
  const [rows, progress, lessonsToday] = await Promise.all([
    prisma.grammarPoint.findMany({ orderBy: { position: "asc" }, select: { id: true, slug: true, level: true, title: true, meaning: true } }),
    prisma.userGrammarProgress.findMany({
      where: { userId: ctx.userId },
      select: { pointId: true, srsStage: true, nextReviewAt: true, markedKnownAt: true },
    }),
    prisma.userGrammarProgress.count({
      where: { userId: ctx.userId, lessonCompletedAt: { gte: startOfLocalDay(now, ctx.timeZone) }, markedKnownAt: null },
    }),
  ]);
  const pmap = new Map(progress.map((p) => [p.pointId, p]));
  const points: GrammarPointSummary[] = rows.map((r) => {
    const p = pmap.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      level: r.level as GrammarLevel,
      title: JSON.parse(r.title) as Segment[],
      meaning: r.meaning,
      stage: p ? p.srsStage : null,
      nextReviewAt: p?.nextReviewAt ?? null,
      due: !!p && !!p.nextReviewAt && p.nextReviewAt <= now && isReviewable(p.srsStage as SrsStage),
      markedKnown: !!p?.markedKnownAt,
    };
  });
  const fresh = points.filter((p) => p.stage === null);
  const dailyLimit = ctx.settings.dailyGrammarLessons;
  const lessonAllowance = Math.min(Math.max(0, dailyLimit - lessonsToday), fresh.length);
  const byLevel: GrammarOverview["byLevel"] = {};
  for (const p of points) {
    const l = (byLevel[p.level] ??= { total: 0, started: 0, passed: 0 });
    l.total++;
    if (p.stage !== null) l.started++;
    if (p.stage !== null && p.stage >= GURU_STAGE) l.passed++;
  }
  return {
    points,
    dueCount: points.filter((p) => p.due).length,
    lessonAllowance,
    lessonsToday,
    dailyLimit,
    newAvailable: fresh.length,
    nextLessons: fresh.slice(0, Math.min(lessonAllowance, GRAMMAR_LESSON_BATCH)),
    byLevel,
  };
}

export interface GrammarSheet {
  id: string;
  slug: string;
  level: GrammarLevel;
  title: Segment[];
  meaning: string;
  structure: Segment[];
  explanation: string;
  examples: { ja: Segment[]; it: string }[];
}

/** Esercizio come arriva al browser: senza soluzione. */
export interface GrammarQuestion {
  id: string;
  kind: "choice" | "order";
  prompt: Segment[];
  choices: Segment[][];
}

export interface GrammarSessionItem {
  sheet: GrammarSheet;
  stage: number | null;
  /** Review: un solo esercizio. Lezione e pratica: tutti, nell'ordine in cui proporli. */
  questions: GrammarQuestion[];
}

type PointRow = {
  id: string;
  slug: string;
  level: string;
  title: string;
  meaning: string;
  structure: string;
  explanation: string;
  examples: string;
};
type ExerciseRow = { id: string; kind: string; prompt: string; choices: string };

const sheetOf = (p: PointRow): GrammarSheet => ({
  id: p.id,
  slug: p.slug,
  level: p.level as GrammarLevel,
  title: JSON.parse(p.title) as Segment[],
  meaning: p.meaning,
  structure: JSON.parse(p.structure) as Segment[],
  explanation: p.explanation,
  examples: JSON.parse(p.examples) as GrammarSheet["examples"],
});

const questionOf = (e: ExerciseRow): GrammarQuestion => ({
  id: e.id,
  kind: e.kind as GrammarQuestion["kind"],
  prompt: JSON.parse(e.prompt) as Segment[],
  choices: JSON.parse(e.choices) as Segment[][],
});

const exerciseSelect = { id: true, kind: true, prompt: true, choices: true, position: true } as const;

function segmentsOfItem(item: GrammarSessionItem): Segment[][] {
  return [item.sheet.title, item.sheet.structure, ...item.sheet.examples.map((e) => e.ja), ...item.questions.flatMap((q) => [q.prompt, ...q.choices])];
}

export interface GrammarSession {
  mode: GrammarMode;
  items: GrammarSessionItem[];
  kanjiStates: Record<string, KanjiState>;
}

export async function getGrammarSession(ctx: StudyContext, mode: GrammarMode, slug?: string, now = new Date()): Promise<GrammarSession> {
  let items: GrammarSessionItem[] = [];
  if (mode === "practice") {
    const point = slug ? await prisma.grammarPoint.findUnique({ where: { slug }, include: { exercises: { orderBy: { position: "asc" }, select: exerciseSelect } } }) : null;
    if (point) items = [{ sheet: sheetOf(point), stage: null, questions: point.exercises.map(questionOf) }];
  } else if (mode === "lesson") {
    const overview = await getGrammarOverview(ctx, now);
    const ids = overview.nextLessons.map((p) => p.id);
    const points = await prisma.grammarPoint.findMany({
      where: { id: { in: ids } },
      orderBy: { position: "asc" },
      include: { exercises: { orderBy: { position: "asc" }, select: exerciseSelect } },
    });
    items = points.map((p) => ({ sheet: sheetOf(p), stage: null, questions: p.exercises.map(questionOf) }));
  } else {
    const due = await prisma.userGrammarProgress.findMany({
      where: { userId: ctx.userId, nextReviewAt: { lte: now }, srsStage: { gte: 1, lte: 8 } },
      orderBy: { nextReviewAt: "asc" },
      take: GRAMMAR_REVIEW_BATCH,
      select: { srsStage: true, point: { include: { exercises: { orderBy: { position: "asc" }, select: exerciseSelect } } } },
    });
    // Rotazione: per ogni punto l'esercizio visto meno di recente (mai visto = primo).
    const lastSeen = await prisma.grammarAttempt.groupBy({
      by: ["exerciseId"],
      where: { userId: ctx.userId, pointId: { in: due.map((d) => d.point.id) }, exerciseId: { not: null } },
      _max: { attemptedAt: true },
    });
    const seenAt = new Map(lastSeen.map((l) => [l.exerciseId!, l._max.attemptedAt?.getTime() ?? 0]));
    items = due
      .filter((d) => d.point.exercises.length > 0)
      .map((d) => {
        const next = [...d.point.exercises].sort((a, b) => (seenAt.get(a.id) ?? 0) - (seenAt.get(b.id) ?? 0) || a.position - b.position)[0]!;
        return { sheet: sheetOf(d.point), stage: d.srsStage, questions: [questionOf(next)] };
      });
  }
  const kanjiStates = await loadKanjiStates(ctx.userId, kanjiIdsOf(items.flatMap(segmentsOfItem)));
  return { mode, items, kanjiStates };
}

export interface GrammarAnswerInput {
  clientAttemptId: string;
  exerciseId: string;
  chosenIndex: number;
  mode: GrammarMode;
}

export interface GrammarAnswerResult {
  correct: boolean;
  answerIndex: number;
  solution: Segment[];
  translation: string;
  explanation: string;
  /** Valorizzati quando la risposta ha cambiato lo stadio SRS. */
  previousStage: number | null;
  nextStage: number | null;
}

/**
 * Corregge una risposta sul server e, se serve, aggiorna lo SRS nella stessa transazione.
 * - lesson: la prima risposta corretta porta il punto ad Apprendista 1;
 * - review: vale solo se il punto è davvero in scadenza; giusto = +1 stadio, sbagliato = regressione del motore SRS;
 * - practice (e ogni altro caso): si registra il tentativo, lo SRS non cambia.
 * Idempotente su clientAttemptId: un doppio invio restituisce lo stesso risultato senza effetti.
 */
export async function answerGrammar(ctx: StudyContext, input: GrammarAnswerInput, now = new Date()): Promise<GrammarAnswerResult> {
  const exercise = await prisma.grammarExercise.findUniqueOrThrow({ where: { id: input.exerciseId } });
  const correct = input.chosenIndex === exercise.answerIndex;
  const base = {
    correct,
    answerIndex: exercise.answerIndex,
    solution: JSON.parse(exercise.solution) as Segment[],
    translation: exercise.translation,
    explanation: exercise.explanation,
  };
  const localDate = localDateKey(now, ctx.timeZone);

  return prisma.$transaction(async (tx) => {
    const previous = await tx.grammarAttempt.findUnique({ where: { clientAttemptId: input.clientAttemptId } });
    if (previous) {
      if (previous.userId !== ctx.userId || previous.exerciseId !== exercise.id) throw new Error("Tentativo non valido");
      return { ...base, correct: previous.isCorrect, previousStage: previous.previousStage, nextStage: previous.nextStage };
    }
    const progress = await tx.userGrammarProgress.findUnique({ where: { userId_pointId: { userId: ctx.userId, pointId: exercise.pointId } } });
    let previousStage: number | null = null;
    let nextStage: number | null = null;

    if (input.mode === "lesson" && !progress && correct) {
      const t = applyLessonCompletion(LESSON_STAGE, now, ctx.srs);
      await tx.userGrammarProgress.create({
        data: { userId: ctx.userId, pointId: exercise.pointId, srsStage: t.nextStage, lessonCompletedAt: now, nextReviewAt: t.nextReviewAt, correctCount: 1 },
      });
      await tx.studyActivity.create({ data: { userId: ctx.userId, activityType: "grammar_lesson", localDate, timestamp: now } });
      previousStage = LESSON_STAGE;
      nextStage = t.nextStage;
    } else if (input.mode === "review" && progress && progress.nextReviewAt && progress.nextReviewAt <= now && isReviewable(progress.srsStage as SrsStage)) {
      const t = applyReview(progress.srsStage as SrsStage, { meaningIncorrect: correct ? 0 : 1, readingIncorrect: 0 }, now, ctx.srs);
      await tx.userGrammarProgress.update({
        where: { id: progress.id },
        data: {
          srsStage: t.nextStage,
          nextReviewAt: t.nextReviewAt,
          burnedAt: t.burned ? now : null,
          correctCount: { increment: correct ? 1 : 0 },
          incorrectCount: { increment: correct ? 0 : 1 },
        },
      });
      await tx.studyActivity.create({ data: { userId: ctx.userId, activityType: "grammar_review", localDate, timestamp: now } });
      previousStage = t.previousStage;
      nextStage = t.nextStage;
    }
    await tx.grammarAttempt.create({
      data: {
        clientAttemptId: input.clientAttemptId,
        userId: ctx.userId,
        pointId: exercise.pointId,
        exerciseId: exercise.id,
        mode: input.mode,
        chosenIndex: input.chosenIndex,
        isCorrect: correct,
        previousStage,
        nextStage,
        attemptedAt: now,
      },
    });
    return { ...base, previousStage, nextStage };
  });
}

/** Segna un punto come già noto: va a Maestro, con il ripasso distribuito nel mese (come per i kanji noti). */
export async function markGrammarKnown(ctx: StudyContext, pointId: string, now = new Date()): Promise<boolean> {
  const existing = await prisma.userGrammarProgress.findUnique({ where: { userId_pointId: { userId: ctx.userId, pointId } } });
  if (existing) return false;
  const t = applyMarkKnown(7, pointId, now, ctx.srs);
  await prisma.userGrammarProgress.create({
    data: { userId: ctx.userId, pointId, srsStage: t.nextStage, lessonCompletedAt: now, nextReviewAt: t.nextReviewAt, markedKnownAt: now },
  });
  return true;
}

/** Toglie un punto dallo SRS: tornerà tra le lezioni nuove. I tentativi restano nello storico. */
export async function resetGrammarPoint(ctx: StudyContext, pointId: string): Promise<void> {
  await prisma.userGrammarProgress.deleteMany({ where: { userId: ctx.userId, pointId } });
}

export interface GrammarPointDetail {
  sheet: GrammarSheet;
  exerciseCount: number;
  progress: { stage: number; nextReviewAt: Date | null; markedKnown: boolean; correct: number; incorrect: number } | null;
  attempts: { isCorrect: boolean; mode: string; attemptedAt: Date; previousStage: number | null; nextStage: number | null }[];
  kanjiStates: Record<string, KanjiState>;
  previous: { slug: string; title: Segment[] } | null;
  next: { slug: string; title: Segment[] } | null;
}

export async function getGrammarPoint(ctx: StudyContext, slug: string): Promise<GrammarPointDetail | null> {
  const point = await prisma.grammarPoint.findUnique({ where: { slug }, include: { _count: { select: { exercises: true } } } });
  if (!point) return null;
  const sheet = sheetOf(point);
  const neighbour = (where: object, orderBy: "asc" | "desc") =>
    prisma.grammarPoint.findFirst({ where, orderBy: { position: orderBy }, select: { slug: true, title: true } });
  const [progress, attempts, kanjiStates, previous, next] = await Promise.all([
    prisma.userGrammarProgress.findUnique({ where: { userId_pointId: { userId: ctx.userId, pointId: point.id } } }),
    prisma.grammarAttempt.findMany({
      where: { userId: ctx.userId, pointId: point.id },
      orderBy: { attemptedAt: "desc" },
      take: 15,
      select: { isCorrect: true, mode: true, attemptedAt: true, previousStage: true, nextStage: true },
    }),
    loadKanjiStates(ctx.userId, kanjiIdsOf([sheet.title, sheet.structure, ...sheet.examples.map((e) => e.ja)])),
    neighbour({ position: { lt: point.position } }, "desc"),
    neighbour({ position: { gt: point.position } }, "asc"),
  ]);
  const titled = (n: { slug: string; title: string } | null) => (n ? { slug: n.slug, title: JSON.parse(n.title) as Segment[] } : null);
  return {
    sheet,
    exerciseCount: point._count.exercises,
    progress: progress
      ? {
          stage: progress.srsStage,
          nextReviewAt: progress.nextReviewAt,
          markedKnown: !!progress.markedKnownAt,
          correct: progress.correctCount,
          incorrect: progress.incorrectCount,
        }
      : null,
    attempts,
    kanjiStates,
    previous: titled(previous),
    next: titled(next),
  };
}
