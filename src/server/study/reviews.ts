import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  applyReview,
  isReviewable,
  replayAttempts,
  requiredQuestions,
  isItemComplete,
  pendingQuestions,
  assertSrsStage,
  type QuestionType,
} from "@/domain/srs";
import {
  meaningFeedback,
  readingFeedback,
  validateMeaning,
  validateReading,
  type Feedback,
  type MeaningVerdict,
  type ReadingVerdict,
  type ReadingType,
  type TypoTolerance,
} from "@/domain/answers";
import { localDateKey } from "@/domain/time";
import type { StudyContext } from "./context";
import { loadSubjectCards, meaningIndex, invalidateMeaningIndex, type SubjectCardDTO } from "./subjects";
import { isPassedProgress } from "@/domain/curriculum/lesson-queue";

export type SessionKind = "review" | "extra_study";

const MAX_BATCH = 50;

export interface QueueItem {
  card: SubjectCardDTO;
  stage: number;
  required: QuestionType[];
  pending: QuestionType[];
  meaningIncorrect: number;
  readingIncorrect: number;
}

export interface SessionState {
  sessionId: string;
  kind: SessionKind;
  remaining: number;
  completed: number;
  items: QueueItem[];
}

async function dueSubjectIds(userId: string, now: Date): Promise<string[]> {
  const rows = await prisma.userSubjectProgress.findMany({
    where: { userId, suspendedAt: null, srsStage: { gte: 1, lte: 8 }, nextReviewAt: { lte: now } },
    orderBy: [{ nextReviewAt: "asc" }, { srsStage: "asc" }],
    select: { subjectId: true },
  });
  return rows.map((r) => r.subjectId);
}

export async function countDueReviews(userId: string, now = new Date()) {
  return prisma.userSubjectProgress.count({
    where: { userId, suspendedAt: null, srsStage: { gte: 1, lte: 8 }, nextReviewAt: { lte: now } },
  });
}

/** Avvia o riprende la sessione attiva del tipo richiesto. */
export async function startOrResumeSession(
  ctx: StudyContext,
  kind: SessionKind,
  extra?: { subjectIds: string[] },
): Promise<string> {
  const active = await prisma.reviewSession.findFirst({
    where: { userId: ctx.userId, status: "active", kind },
    orderBy: { startedAt: "desc" },
  });
  if (active && !(kind === "extra_study" && extra)) return active.id;
  if (active) await prisma.reviewSession.update({ where: { id: active.id }, data: { status: "abandoned", completedAt: new Date() } });
  const session = await prisma.reviewSession.create({
    data: { userId: ctx.userId, kind, config: extra ? JSON.stringify({ subjectIds: extra.subjectIds.slice(0, 200) }) : null },
  });
  return session.id;
}

export async function getSessionState(ctx: StudyContext, sessionId: string, now = new Date()): Promise<SessionState> {
  const session = await prisma.reviewSession.findFirstOrThrow({ where: { id: sessionId, userId: ctx.userId } });
  const kind = session.kind as SessionKind;
  const attempts = await prisma.reviewAttempt.findMany({
    where: { sessionId },
    orderBy: { attemptedAt: "asc" },
    select: { subjectId: true, questionType: true, isCorrect: true },
  });

  let candidateIds: string[];
  let completedIds: Set<string>;
  if (kind === "review") {
    const transitions = await prisma.reviewTransition.findMany({ where: { sessionId }, select: { subjectId: true } });
    completedIds = new Set(transitions.map((t) => t.subjectId));
    // In corso in questa sessione prima, poi gli altri scaduti.
    const inProgress = [...new Set(attempts.map((a) => a.subjectId))].filter((id) => !completedIds.has(id));
    const due = (await dueSubjectIds(ctx.userId, now)).filter((id) => !completedIds.has(id) && !inProgress.includes(id));
    candidateIds = [...inProgress, ...due];
  } else {
    const cfg = z.object({ subjectIds: z.array(z.string()) }).safeParse(JSON.parse(session.config ?? "{}"));
    const ids = cfg.success ? cfg.data.subjectIds : [];
    completedIds = new Set<string>();
    candidateIds = ids;
  }

  const batchIds = candidateIds.slice(0, MAX_BATCH * 2);
  const [cards, progress] = await Promise.all([
    loadSubjectCards(batchIds, ctx.userId, { usedInLimit: 0 }),
    prisma.userSubjectProgress.findMany({ where: { userId: ctx.userId, subjectId: { in: batchIds } }, select: { subjectId: true, srsStage: true } }),
  ]);
  const stageOf = new Map(progress.map((p) => [p.subjectId, p.srsStage]));
  const items: QueueItem[] = [];
  let doneExtra = 0;
  for (const card of cards) {
    const required = requiredQuestions(card.type, card.readings.some((r) => r.isAccepted));
    const state = replayAttempts(
      required,
      attempts.filter((a) => a.subjectId === card.id).map((a) => ({ questionType: a.questionType as QuestionType, isCorrect: a.isCorrect })),
    );
    if (isItemComplete(state)) {
      if (kind === "extra_study") doneExtra++;
      continue;
    }
    items.push({
      card,
      stage: stageOf.get(card.id) ?? 0,
      required,
      pending: pendingQuestions(state),
      meaningIncorrect: state.meaningIncorrect,
      readingIncorrect: state.readingIncorrect,
    });
    if (items.length >= MAX_BATCH) break;
  }
  const remaining = kind === "review" ? candidateIds.length : Math.max(0, candidateIds.length - doneExtra);
  return { sessionId, kind, remaining, completed: kind === "review" ? completedIds.size : doneExtra, items };
}

export const submitSchema = z.object({
  sessionId: z.string().min(1),
  subjectId: z.string().min(1),
  questionType: z.enum(["meaning", "reading"]),
  answer: z.string().max(200),
  clientAttemptId: z.string().min(8).max(64),
  responseTimeMs: z.number().int().min(0).max(30 * 60_000),
});

export interface SubmitResult {
  verdict: "correct" | "incorrect" | "retry";
  feedback: Feedback;
  attemptId: string | null;
  normalized: string;
  completed: null | { previousStage: number; nextStage: number; nextReviewAt: string | null };
  pending: QuestionType[];
  duplicate: boolean;
}

export async function submitAnswer(ctx: StudyContext, raw: unknown, now = new Date()): Promise<SubmitResult> {
  const input = submitSchema.parse(raw);
  const session = await prisma.reviewSession.findFirst({ where: { id: input.sessionId, userId: ctx.userId, status: "active" } });
  if (!session) throw new Error("Sessione non attiva");
  const kind = session.kind as SessionKind;

  // Idempotenza: lo stesso tentativo inviato due volte (doppio invio, rete instabile) non viene ripetuto.
  const dup = await prisma.reviewAttempt.findUnique({ where: { clientAttemptId: input.clientAttemptId } });
  if (dup) {
    if (dup.sessionId !== session.id) throw new Error("Tentativo non valido");
    return {
      verdict: dup.isCorrect ? "correct" : "incorrect",
      feedback: { tone: dup.isCorrect ? "success" : "error", message: dup.isCorrect ? "Corretto." : "Sbagliato." },
      attemptId: dup.id,
      normalized: dup.normalizedAnswer,
      completed: null,
      pending: [],
      duplicate: true,
    };
  }

  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: input.subjectId },
    include: { meanings: { where: { OR: [{ userId: null }, { userId: ctx.userId }] } }, readings: true },
  });
  const progress = await prisma.userSubjectProgress.findUnique({
    where: { userId_subjectId: { userId: ctx.userId, subjectId: subject.id } },
  });
  if (kind === "review") {
    if (!progress || progress.suspendedAt || !isReviewable(assertSrsStage(progress.srsStage))) throw new Error("Soggetto non in ripasso");
  }

  const required = requiredQuestions(subject.type as "radical" | "kanji" | "vocabulary", subject.readings.some((r) => r.isAccepted));
  if (!required.includes(input.questionType)) throw new Error("Domanda non prevista per questo soggetto");

  let verdict: MeaningVerdict | ReadingVerdict;
  let feedback: Feedback;
  if (input.questionType === "meaning") {
    const index = await meaningIndex();
    const others = { has: (v: string) => !!index.get(v) && !index.get(v)!.has(subject.id) };
    const mv = validateMeaning(input.answer, {
      meanings: subject.meanings,
      typoTolerance: ctx.settings.typoTolerance as TypoTolerance,
      otherSubjectMeanings: others,
    });
    verdict = mv;
    feedback = meaningFeedback(mv);
  } else {
    const rv = validateReading(input.answer, {
      subjectType: subject.type === "kanji" ? "kanji" : "vocabulary",
      readings: subject.readings.map((r) => ({ ...r, readingType: r.readingType as ReadingType })),
    });
    verdict = rv;
    feedback = readingFeedback(rv);
  }

  if (verdict.verdict === "retry") {
    return { verdict: "retry", feedback, attemptId: null, normalized: verdict.normalized, completed: null, pending: [input.questionType], duplicate: false };
  }
  const isCorrect = verdict.verdict === "correct";
  const outcome = verdict.outcome;

  return prisma.$transaction(async (tx) => {
    const attempt = await tx.reviewAttempt.create({
      data: {
        clientAttemptId: input.clientAttemptId,
        sessionId: session.id,
        subjectId: subject.id,
        questionType: input.questionType,
        submittedAnswer: input.answer,
        normalizedAnswer: verdict.normalized,
        isCorrect,
        outcome,
        responseTimeMs: input.responseTimeMs,
        attemptedAt: now,
      },
    });
    const result = await settleItem(tx, ctx, session.id, kind, subject.id, required, now);
    if (kind === "review" && progress) {
      const field =
        input.questionType === "meaning"
          ? isCorrect
            ? "meaningCorrectCount"
            : "meaningIncorrectCount"
          : isCorrect
            ? "readingCorrectCount"
            : "readingIncorrectCount";
      await tx.userSubjectProgress.update({ where: { id: progress.id }, data: { [field]: { increment: 1 } } });
    }
    return {
      verdict: isCorrect ? ("correct" as const) : ("incorrect" as const),
      feedback,
      attemptId: attempt.id,
      normalized: verdict.normalized,
      completed: result.completed,
      pending: result.pending,
      duplicate: false,
    };
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Se tutte le dimensioni sono state risposte correttamente, applica la transizione SRS (una sola volta). */
async function settleItem(tx: Tx, ctx: StudyContext, sessionId: string, kind: SessionKind, subjectId: string, required: QuestionType[], now: Date) {
  const attempts = await tx.reviewAttempt.findMany({
    where: { sessionId, subjectId },
    orderBy: { attemptedAt: "asc" },
    select: { questionType: true, isCorrect: true },
  });
  const state = replayAttempts(required, attempts.map((a) => ({ questionType: a.questionType as QuestionType, isCorrect: a.isCorrect })));
  if (!isItemComplete(state)) return { completed: null, pending: pendingQuestions(state) };
  if (kind !== "review") return { completed: null, pending: [] as QuestionType[] };

  const existing = await tx.reviewTransition.findUnique({ where: { sessionId_subjectId: { sessionId, subjectId } } });
  if (existing) {
    return {
      completed: { previousStage: existing.previousStage, nextStage: existing.nextStage, nextReviewAt: existing.scheduledAt?.toISOString() ?? null },
      pending: [] as QuestionType[],
    };
  }
  const progress = await tx.userSubjectProgress.findUniqueOrThrow({ where: { userId_subjectId: { userId: ctx.userId, subjectId } } });
  const t = applyReview(assertSrsStage(progress.srsStage), { meaningIncorrect: state.meaningIncorrect, readingIncorrect: state.readingIncorrect }, now, ctx.srs);
  await tx.reviewTransition.create({
    data: {
      subjectId,
      userId: ctx.userId,
      sessionId,
      previousStage: t.previousStage,
      nextStage: t.nextStage,
      meaningIncorrect: state.meaningIncorrect,
      readingIncorrect: state.readingIncorrect,
      scheduledAt: t.nextReviewAt,
      createdAt: now,
    },
  });
  await tx.userSubjectProgress.update({
    where: { id: progress.id },
    data: { srsStage: t.nextStage, nextReviewAt: t.nextReviewAt, burnedAt: t.burned ? now : progress.burnedAt },
  });
  await tx.studyActivity.create({
    data: { userId: ctx.userId, subjectId, activityType: "review_completed", localDate: localDateKey(now, ctx.timeZone), timestamp: now },
  });
  return {
    completed: { previousStage: t.previousStage, nextStage: t.nextStage, nextReviewAt: t.nextReviewAt?.toISOString() ?? null },
    pending: [] as QuestionType[],
  };
}

/**
 * Correzione manuale: l'utente dichiara corretta la sua ultima risposta errata.
 * Consentita solo prima che il soggetto abbia completato la transizione in questa sessione.
 * Il tentativo resta tracciato come "override" (mai silenzioso).
 */
export async function overrideAttempt(ctx: StudyContext, attemptId: string, addAsSynonym: boolean, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.reviewAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { session: true } });
    if (attempt.session.userId !== ctx.userId || attempt.session.status !== "active") throw new Error("Tentativo non modificabile");
    if (attempt.isCorrect) throw new Error("Il tentativo è già corretto");
    const later = await tx.reviewAttempt.count({
      where: { sessionId: attempt.sessionId, subjectId: attempt.subjectId, attemptedAt: { gt: attempt.attemptedAt } },
    });
    if (later > 0) throw new Error("Si può correggere solo l'ultima risposta");
    const done = await tx.reviewTransition.findUnique({ where: { sessionId_subjectId: { sessionId: attempt.sessionId, subjectId: attempt.subjectId } } });
    if (done) throw new Error("Ripasso già concluso per questo elemento");

    await tx.reviewAttempt.update({ where: { id: attempt.id }, data: { isCorrect: true, outcome: "override", overridden: true } });
    const kind = attempt.session.kind as SessionKind;
    if (kind === "review") {
      const inc = attempt.questionType === "meaning" ? "meaningIncorrectCount" : "readingIncorrectCount";
      const cor = attempt.questionType === "meaning" ? "meaningCorrectCount" : "readingCorrectCount";
      await tx.userSubjectProgress.updateMany({
        where: { userId: ctx.userId, subjectId: attempt.subjectId, [inc]: { gt: 0 } },
        data: { [inc]: { decrement: 1 }, [cor]: { increment: 1 } },
      });
    }
    if (addAsSynonym && attempt.questionType === "meaning" && attempt.normalizedAnswer) {
      await tx.subjectMeaning.upsert({
        where: {
          subjectId_language_meaning_origin: { subjectId: attempt.subjectId, language: "it", meaning: attempt.normalizedAnswer, origin: "user" },
        },
        create: {
          subjectId: attempt.subjectId,
          userId: ctx.userId,
          language: "it",
          meaning: attempt.normalizedAnswer,
          isPrimary: false,
          isAccepted: true,
          origin: "user",
          position: 999,
        },
        update: { isAccepted: true },
      });
    }
    const subject = await tx.subject.findUniqueOrThrow({ where: { id: attempt.subjectId }, include: { readings: true } });
    const required = requiredQuestions(subject.type as "radical" | "kanji" | "vocabulary", subject.readings.some((r) => r.isAccepted));
    const result = await settleItem(tx, ctx, attempt.sessionId, kind, attempt.subjectId, required, now);
    if (addAsSynonym) invalidateMeaningIndex();
    return result;
  });
}

export async function finishSession(ctx: StudyContext, sessionId: string) {
  await prisma.reviewSession.updateMany({
    where: { id: sessionId, userId: ctx.userId, status: "active" },
    data: { status: "completed", completedAt: new Date() },
  });
}

/** Selezione per lo studio extra (nessun effetto sullo SRS): elementi già noti di una fascia. */
export async function pickExtraStudy(ctx: StudyContext, opts: { band: string | null; type: string | null; count: number; burnedOnly: boolean }) {
  const progress = await prisma.userSubjectProgress.findMany({
    where: {
      userId: ctx.userId,
      ...(opts.burnedOnly ? { srsStage: 9 } : {}),
      subject: {
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.band
          ? { classifications: { some: { classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] }, classificationValue: opts.band } } }
          : {}),
      },
    },
    select: { subjectId: true, srsStage: true, markedKnownAt: true, suspendedAt: true },
  });
  const pool = progress
    .filter((p) => isPassedProgress({ stage: p.srsStage, markedKnown: !!p.markedKnownAt, suspended: !!p.suspendedAt }) || p.srsStage >= 1)
    .map((p) => p.subjectId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(1, Math.min(100, opts.count)));
}
