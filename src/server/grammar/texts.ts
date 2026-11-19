import "server-only";
import { prisma } from "@/server/db";
import type { GrammarLevel } from "@/domain/grammar/content";
import type { ProgressInfo } from "@/domain/curriculum/lesson-queue";
import { kanjiIdsOf, type Segment } from "@/domain/reading/markup";
import type { KanjiState, Readability } from "@/domain/reading/readability";
import { readability } from "@/domain/reading/readability";
import { localDateKey } from "@/domain/time";
import { loadKanjiStates } from "@/server/reading/kanji-states";
import type { StudyContext } from "@/server/study/context";

export interface GrammarTextSummary {
  id: string;
  slug: string;
  level: GrammarLevel;
  title: Segment[];
  titleIt: string;
  blankCount: number;
  readability: Readability;
  attempts: number;
  best: { correct: number; total: number } | null;
}

/** Testi non ancora svolti per primi, poi l'ordine di studio (N4 prima di N3). */
export function orderTexts<T extends { attempts: number }>(texts: readonly T[]): T[] {
  return texts.map((t, i) => ({ t, i })).sort((a, b) => Number(a.t.attempts > 0) - Number(b.t.attempts > 0) || a.i - b.i).map(({ t }) => t);
}

export async function listGrammarTexts(ctx: StudyContext): Promise<GrammarTextSummary[]> {
  const [rows, attempts] = await Promise.all([
    prisma.grammarText.findMany({
      orderBy: { position: "asc" },
      select: { id: true, slug: true, level: true, title: true, titleIt: true, content: true, _count: { select: { blanks: true } } },
    }),
    prisma.grammarTextAttempt.findMany({ where: { userId: ctx.userId }, select: { textId: true, correctCount: true, totalCount: true } }),
  ]);
  const parsed = rows.map((r) => ({ r, title: JSON.parse(r.title) as Segment[], paragraphs: JSON.parse(r.content) as Segment[][] }));
  const kanjiIds = new Map(parsed.map(({ r, title, paragraphs }) => [r.id, kanjiIdsOf([title, ...paragraphs])]));
  const allIds = [...new Set([...kanjiIds.values()].flat())];
  const progressRows = allIds.length
    ? await prisma.userSubjectProgress.findMany({
        where: { userId: ctx.userId, subjectId: { in: allIds } },
        select: { subjectId: true, srsStage: true, markedKnownAt: true, suspendedAt: true },
      })
    : [];
  const progress = new Map<string, ProgressInfo>(
    progressRows.map((p) => [p.subjectId, { stage: p.srsStage, markedKnown: !!p.markedKnownAt, suspended: !!p.suspendedAt }]),
  );
  return parsed.map(({ r, title }) => {
    const mine = attempts.filter((a) => a.textId === r.id);
    const best = mine.reduce<{ correct: number; total: number } | null>(
      (b, a) => (!b || a.correctCount / a.totalCount > b.correct / b.total ? { correct: a.correctCount, total: a.totalCount } : b),
      null,
    );
    return {
      id: r.id,
      slug: r.slug,
      level: r.level as GrammarLevel,
      title,
      titleIt: r.titleIt,
      blankCount: r._count.blanks,
      readability: readability(kanjiIds.get(r.id) ?? [], progress),
      attempts: mine.length,
      best,
    };
  });
}

/** Spazio come arriva al browser: solo le risposte, senza soluzione né punto verificato. */
export interface GrammarTextBlankView {
  id: string;
  choices: Segment[][];
}

export interface GrammarTextDetail {
  id: string;
  slug: string;
  level: GrammarLevel;
  title: Segment[];
  titleIt: string;
  paragraphs: Segment[][];
  blanks: GrammarTextBlankView[];
  kanjiStates: Record<string, KanjiState>;
  readability: Readability;
  lastAttempt: { correctCount: number; totalCount: number; completedAt: Date } | null;
}

export async function getGrammarText(ctx: StudyContext, slug: string): Promise<GrammarTextDetail | null> {
  const row = await prisma.grammarText.findUnique({
    where: { slug },
    include: { blanks: { orderBy: { position: "asc" }, select: { id: true, choices: true } } },
  });
  if (!row) return null;
  const title = JSON.parse(row.title) as Segment[];
  const paragraphs = JSON.parse(row.content) as Segment[][];
  const blanks = row.blanks.map((b) => ({ id: b.id, choices: JSON.parse(b.choices) as Segment[][] }));
  const bodyKanji = kanjiIdsOf([title, ...paragraphs]);
  const [kanjiStates, last] = await Promise.all([
    loadKanjiStates(ctx.userId, [...new Set([...bodyKanji, ...kanjiIdsOf(blanks.flatMap((b) => b.choices))])]),
    prisma.grammarTextAttempt.findFirst({
      where: { userId: ctx.userId, textId: row.id },
      orderBy: { completedAt: "desc" },
      select: { correctCount: true, totalCount: true, completedAt: true },
    }),
  ]);
  const known = bodyKanji.filter((id) => kanjiStates[id] === "known").length;
  const learning = bodyKanji.filter((id) => kanjiStates[id] === "learning").length;
  return {
    id: row.id,
    slug: row.slug,
    level: row.level as GrammarLevel,
    title,
    titleIt: row.titleIt,
    paragraphs,
    blanks,
    kanjiStates,
    readability: {
      total: bodyKanji.length,
      known,
      learning,
      missing: bodyKanji.length - known - learning,
      percent: bodyKanji.length === 0 ? 100 : Math.round((known / bodyKanji.length) * 100),
    },
    lastAttempt: last,
  };
}

export interface GrammarTextSubmission {
  textId: string;
  /** Indice scelto per ogni spazio, null se lasciato senza risposta. */
  answers: (number | null)[];
  durationMs: number;
}

export interface GrammarTextResult {
  correctCount: number;
  totalCount: number;
  blanks: {
    answerIndex: number;
    chosen: number | null;
    correct: boolean;
    explanation: string;
    /** Punto grammaticale verificato dallo spazio, con lo stadio SRS dell'utente (null = non ancora studiato). */
    point: { slug: string; title: Segment[]; stage: number | null } | null;
  }[];
  translation: string[];
}

/**
 * Corregge sul server (la pagina non riceve mai le soluzioni) e registra il tentativo.
 * È pratica: non modifica lo stadio SRS di nessun punto grammaticale.
 */
export async function submitGrammarText(ctx: StudyContext, input: GrammarTextSubmission, now = new Date()): Promise<GrammarTextResult> {
  const text = await prisma.grammarText.findUniqueOrThrow({
    where: { id: input.textId },
    include: { blanks: { orderBy: { position: "asc" }, include: { point: { select: { id: true, slug: true, title: true } } } } },
  });
  const progress = await prisma.userGrammarProgress.findMany({
    where: { userId: ctx.userId, pointId: { in: text.blanks.flatMap((b) => (b.pointId ? [b.pointId] : [])) } },
    select: { pointId: true, srsStage: true },
  });
  const stageOf = new Map(progress.map((p) => [p.pointId, p.srsStage]));
  const blanks = text.blanks.map((b, i) => {
    const chosen = input.answers[i] ?? null;
    return {
      answerIndex: b.answerIndex,
      chosen,
      correct: chosen === b.answerIndex,
      explanation: b.explanation,
      point: b.point ? { slug: b.point.slug, title: JSON.parse(b.point.title) as Segment[], stage: stageOf.get(b.point.id) ?? null } : null,
    };
  });
  const correctCount = blanks.filter((b) => b.correct).length;
  await prisma.$transaction([
    prisma.grammarTextAttempt.create({
      data: {
        userId: ctx.userId,
        textId: text.id,
        answers: JSON.stringify(blanks.map((b) => b.chosen)),
        correctCount,
        totalCount: blanks.length,
        durationMs: Math.max(0, Math.min(input.durationMs, 6 * 3600_000)),
        completedAt: now,
      },
    }),
    prisma.studyActivity.create({ data: { userId: ctx.userId, activityType: "grammar_text", localDate: localDateKey(now, ctx.timeZone), timestamp: now } }),
  ]);
  return { correctCount, totalCount: blanks.length, blanks, translation: JSON.parse(text.translation) as string[] };
}

export interface PointText {
  slug: string;
  level: string;
  title: Segment[];
  titleIt: string;
  read: boolean;
}

/** Testi in cui un punto grammaticale compare in uno spazio: per rivederlo in contesto dalla sua scheda. */
export async function textsForPoint(ctx: StudyContext, pointId: string): Promise<PointText[]> {
  const rows = await prisma.grammarTextBlank.findMany({
    where: { pointId },
    orderBy: { text: { position: "asc" } },
    select: { text: { select: { slug: true, level: true, title: true, titleIt: true, attempts: { where: { userId: ctx.userId }, take: 1, select: { id: true } } } } },
  });
  return rows.map(({ text }) => ({
    slug: text.slug,
    level: text.level,
    title: JSON.parse(text.title) as Segment[],
    titleIt: text.titleIt,
    read: text.attempts.length > 0,
  }));
}
