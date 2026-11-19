import "server-only";
import { prisma } from "@/server/db";
import type { ProgressInfo } from "@/domain/curriculum/lesson-queue";
import type { ReadingFormat, ReadingLevel } from "@/domain/reading/content";
import { isRuby, type Segment } from "@/domain/reading/markup";
import { kanjiState, readability, type KanjiState, type Readability } from "@/domain/reading/readability";
import { localDateKey } from "@/domain/time";
import type { StudyContext } from "@/server/study/context";

export interface PassageSummary {
  id: string;
  slug: string;
  level: ReadingLevel;
  format: ReadingFormat;
  title: Segment[];
  titleIt: string;
  charCount: number;
  questionCount: number;
  readability: Readability;
  /** Kanji del brano che l'utente sbaglia spesso nei ripassi. */
  weakKanji: number;
  attempts: number;
  best: { correct: number; total: number } | null;
  lastCompletedAt: Date | null;
}

/** Un kanji è "debole" se è in ripasso e ha almeno un quarto di risposte sbagliate (minimo 4 risposte). */
function isWeak(p: { srsStage: number; suspendedAt: Date | null; meaningCorrectCount: number; meaningIncorrectCount: number; readingCorrectCount: number; readingIncorrectCount: number }) {
  if (p.suspendedAt || p.srsStage < 1 || p.srsStage > 8) return false;
  const incorrect = p.meaningIncorrectCount + p.readingIncorrectCount;
  const total = incorrect + p.meaningCorrectCount + p.readingCorrectCount;
  return total >= 4 && incorrect / total >= 0.25;
}

export async function listPassages(ctx: StudyContext): Promise<PassageSummary[]> {
  const [passages, kanjiLinks, progressRows, attempts] = await Promise.all([
    prisma.readingPassage.findMany({
      orderBy: { position: "asc" },
      select: { id: true, slug: true, level: true, format: true, title: true, titleIt: true, charCount: true, _count: { select: { questions: true } } },
    }),
    prisma.readingPassageSubject.findMany({ where: { subject: { type: "kanji" } }, select: { passageId: true, subjectId: true } }),
    prisma.userSubjectProgress.findMany({
      where: { userId: ctx.userId, subject: { type: "kanji" } },
      select: {
        subjectId: true,
        srsStage: true,
        markedKnownAt: true,
        suspendedAt: true,
        meaningCorrectCount: true,
        meaningIncorrectCount: true,
        readingCorrectCount: true,
        readingIncorrectCount: true,
      },
    }),
    prisma.readingAttempt.findMany({
      where: { userId: ctx.userId },
      orderBy: { completedAt: "asc" },
      select: { passageId: true, correctCount: true, totalCount: true, completedAt: true },
    }),
  ]);
  const progress = new Map<string, ProgressInfo>(
    progressRows.map((r) => [r.subjectId, { stage: r.srsStage, markedKnown: !!r.markedKnownAt, suspended: !!r.suspendedAt }]),
  );
  const weak = new Set(progressRows.filter(isWeak).map((r) => r.subjectId));
  const kanjiByPassage = new Map<string, string[]>();
  for (const l of kanjiLinks) {
    const list = kanjiByPassage.get(l.passageId);
    if (list) list.push(l.subjectId);
    else kanjiByPassage.set(l.passageId, [l.subjectId]);
  }
  const attemptsByPassage = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const list = attemptsByPassage.get(a.passageId);
    if (list) list.push(a);
    else attemptsByPassage.set(a.passageId, [a]);
  }
  return passages.map((p) => {
    const kanji = kanjiByPassage.get(p.id) ?? [];
    const mine = attemptsByPassage.get(p.id) ?? [];
    const best = mine.reduce<{ correct: number; total: number } | null>(
      (b, a) => (!b || a.correctCount / a.totalCount > b.correct / b.total ? { correct: a.correctCount, total: a.totalCount } : b),
      null,
    );
    return {
      id: p.id,
      slug: p.slug,
      level: p.level as ReadingLevel,
      format: p.format as ReadingFormat,
      title: JSON.parse(p.title) as Segment[],
      titleIt: p.titleIt,
      charCount: p.charCount,
      questionCount: p._count.questions,
      readability: readability(kanji, progress),
      weakKanji: kanji.filter((id) => weak.has(id)).length,
      attempts: mine.length,
      best,
      lastCompletedAt: mine.at(-1)?.completedAt ?? null,
    };
  });
}

/**
 * Ordine consigliato: prima i brani non ancora letti, dal più leggibile; a parità, quelli che fanno
 * incontrare in contesto i kanji deboli. I brani già letti vanno in fondo.
 */
export function recommendPassages(passages: readonly PassageSummary[]): PassageSummary[] {
  return [...passages].sort(
    (a, b) =>
      Number(a.attempts > 0) - Number(b.attempts > 0) ||
      b.readability.percent - a.readability.percent ||
      b.weakKanji - a.weakKanji ||
      a.charCount - b.charCount,
  );
}

export interface ReaderSubject {
  id: string;
  type: "kanji" | "vocabulary";
  characters: string;
  meaning: string;
  reading: string | null;
  jlpt: string | null;
  state: KanjiState;
  stage: number | null;
}

export interface PassageDetail {
  id: string;
  slug: string;
  level: ReadingLevel;
  format: ReadingFormat;
  title: Segment[];
  titleIt: string;
  paragraphs: Segment[][];
  charCount: number;
  questions: { id: string; prompt: Segment[]; choices: Segment[][] }[];
  /** Soggetti collegati a testo, domande e risposte, per id. */
  subjects: Record<string, ReaderSubject>;
  readability: Readability;
  /** Kanji del testo non ancora iniziati, nell'ordine di studio. */
  missingKanji: ReaderSubject[];
  /** Kanji mancanti già messi in cima alla coda delle lezioni. */
  prioritized: string[];
  attempts: { correctCount: number; totalCount: number; mode: string; completedAt: Date }[];
}

function subjectIdsOf(groups: readonly (readonly Segment[])[]): string[] {
  const ids = new Set<string>();
  for (const g of groups) {
    for (const s of g) {
      if (!isRuby(s)) continue;
      for (const id of s.k ?? []) ids.add(id);
      if (s.v) ids.add(s.v);
    }
  }
  return [...ids];
}

export async function getPassage(ctx: StudyContext, slug: string): Promise<PassageDetail | null> {
  const row = await prisma.readingPassage.findUnique({
    where: { slug },
    include: { questions: { orderBy: { position: "asc" } }, subjects: { where: { subject: { type: "kanji" } }, select: { subjectId: true } } },
  });
  if (!row) return null;
  const title = JSON.parse(row.title) as Segment[];
  const paragraphs = JSON.parse(row.content) as Segment[][];
  const questions = row.questions.map((q) => ({ id: q.id, prompt: JSON.parse(q.prompt) as Segment[], choices: JSON.parse(q.choices) as Segment[][] }));
  const ids = subjectIdsOf([title, ...paragraphs, ...questions.flatMap((q) => [q.prompt, ...q.choices])]);

  const [subjectRows, progressRows, priorities, attempts] = await Promise.all([
    prisma.subject.findMany({
      where: { id: { in: ids } },
      orderBy: { lessonOrder: "asc" },
      select: {
        id: true,
        type: true,
        characters: true,
        primaryMeaning: true,
        readings: { where: { isPrimary: true }, take: 1, select: { reading: true } },
        classifications: { where: { classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] } }, select: { classificationValue: true } },
      },
    }),
    prisma.userSubjectProgress.findMany({
      where: { userId: ctx.userId, subjectId: { in: ids } },
      select: { subjectId: true, srsStage: true, markedKnownAt: true, suspendedAt: true },
    }),
    prisma.lessonPriority.findMany({ where: { userId: ctx.userId, subjectId: { in: ids } }, select: { subjectId: true } }),
    prisma.readingAttempt.findMany({
      where: { userId: ctx.userId, passageId: row.id },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { correctCount: true, totalCount: true, mode: true, completedAt: true },
    }),
  ]);
  const progress = new Map<string, ProgressInfo>(
    progressRows.map((r) => [r.subjectId, { stage: r.srsStage, markedKnown: !!r.markedKnownAt, suspended: !!r.suspendedAt }]),
  );
  const subjects: Record<string, ReaderSubject> = {};
  for (const s of subjectRows) {
    const p = progress.get(s.id);
    subjects[s.id] = {
      id: s.id,
      type: s.type as ReaderSubject["type"],
      characters: s.characters,
      meaning: s.primaryMeaning,
      reading: s.readings[0]?.reading.replace(/[.-]/g, "") ?? null,
      jlpt: s.classifications[0]?.classificationValue ?? null,
      state: kanjiState(p),
      stage: p ? p.stage : null,
    };
  }
  const bodyKanji = row.subjects.map((s) => s.subjectId);
  return {
    id: row.id,
    slug: row.slug,
    level: row.level as ReadingLevel,
    format: row.format as ReadingFormat,
    title,
    titleIt: row.titleIt,
    paragraphs,
    charCount: row.charCount,
    questions,
    subjects,
    readability: readability(bodyKanji, progress),
    missingKanji: subjectRows.filter((s) => bodyKanji.includes(s.id) && !progress.has(s.id)).map((s) => subjects[s.id]!),
    prioritized: priorities.map((p) => p.subjectId),
    attempts,
  };
}

export interface ReadingSubmission {
  passageId: string;
  mode: "study" | "exam";
  /** Indice scelto per ogni domanda, null se lasciata senza risposta. */
  answers: (number | null)[];
  /** Soggetti consultati durante la lettura. */
  lookups: string[];
  durationMs: number;
}

export interface ReadingResult {
  correctCount: number;
  totalCount: number;
  questions: { answerIndex: number; chosen: number | null; correct: boolean; explanation: string }[];
  translation: string[];
}

/** Corregge le risposte sul server (la pagina non riceve mai le soluzioni) e registra il tentativo. */
export async function submitReading(ctx: StudyContext, input: ReadingSubmission, now = new Date()): Promise<ReadingResult> {
  const passage = await prisma.readingPassage.findUniqueOrThrow({
    where: { id: input.passageId },
    include: { questions: { orderBy: { position: "asc" } } },
  });
  const questions = passage.questions.map((q, i) => {
    const chosen = input.answers[i] ?? null;
    return { answerIndex: q.answerIndex, chosen, correct: chosen === q.answerIndex, explanation: q.explanation };
  });
  const correctCount = questions.filter((q) => q.correct).length;
  await prisma.$transaction([
    prisma.readingAttempt.create({
      data: {
        userId: ctx.userId,
        passageId: passage.id,
        mode: input.mode,
        answers: JSON.stringify(questions.map((q) => q.chosen)),
        correctCount,
        totalCount: questions.length,
        lookups: JSON.stringify([...new Set(input.lookups)].slice(0, 200)),
        durationMs: Math.max(0, Math.min(input.durationMs, 6 * 3600_000)),
        completedAt: now,
      },
    }),
    prisma.studyActivity.create({
      data: { userId: ctx.userId, activityType: "reading_completed", localDate: localDateKey(now, ctx.timeZone), timestamp: now },
    }),
  ]);
  return { correctCount, totalCount: questions.length, questions, translation: JSON.parse(passage.translation) as string[] };
}

/** Mette in cima alla coda delle lezioni i soggetti non ancora iniziati (es. i kanji che mancano per un brano). */
export async function prioritizeLessons(ctx: StudyContext, subjectIds: string[]): Promise<number> {
  const unique = [...new Set(subjectIds)].slice(0, 100);
  const [valid, started, existing] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: unique }, type: { in: ["kanji", "vocabulary"] } }, select: { id: true } }),
    prisma.userSubjectProgress.findMany({ where: { userId: ctx.userId, subjectId: { in: unique } }, select: { subjectId: true } }),
    prisma.lessonPriority.findMany({ where: { userId: ctx.userId, subjectId: { in: unique } }, select: { subjectId: true } }),
  ]);
  const skip = new Set([...started, ...existing].map((r) => r.subjectId));
  const validIds = new Set(valid.map((v) => v.id));
  const todo = unique.filter((id) => validIds.has(id) && !skip.has(id));
  if (todo.length === 0) return 0;
  // Date crescenti: la coda rispetta l'ordine in cui i soggetti sono stati chiesti.
  const base = Date.now();
  await prisma.lessonPriority.createMany({ data: todo.map((subjectId, i) => ({ userId: ctx.userId, subjectId, createdAt: new Date(base + i) })) });
  return todo.length;
}

export interface SubjectPassage {
  slug: string;
  level: string;
  title: Segment[];
  titleIt: string;
  occurrences: number;
  read: boolean;
}

/** Brani in cui compare un soggetto: per rivederlo in contesto dalla sua scheda. */
export async function passagesForSubject(ctx: StudyContext, subjectId: string, limit = 8): Promise<SubjectPassage[]> {
  const rows = await prisma.readingPassageSubject.findMany({
    where: { subjectId },
    orderBy: [{ occurrences: "desc" }, { passage: { position: "asc" } }],
    take: limit,
    select: {
      occurrences: true,
      passage: {
        select: { slug: true, level: true, title: true, titleIt: true, attempts: { where: { userId: ctx.userId }, take: 1, select: { id: true } } },
      },
    },
  });
  return rows.map((r) => ({
    slug: r.passage.slug,
    level: r.passage.level,
    title: JSON.parse(r.passage.title) as Segment[],
    titleIt: r.passage.titleIt,
    occurrences: r.occurrences,
    read: r.passage.attempts.length > 0,
  }));
}

export interface ReadingOverview {
  total: number;
  read: number;
  byLevel: Record<string, { total: number; read: number }>;
  accuracy: { correct: number; total: number };
  suggested: PassageSummary | null;
}

export function readingOverview(passages: readonly PassageSummary[]): ReadingOverview {
  const byLevel: ReadingOverview["byLevel"] = {};
  let correct = 0;
  let total = 0;
  for (const p of passages) {
    const l = (byLevel[p.level] ??= { total: 0, read: 0 });
    l.total++;
    if (p.attempts > 0) l.read++;
    if (p.best) {
      correct += p.best.correct;
      total += p.best.total;
    }
  }
  const suggested = recommendPassages(passages).find((p) => p.attempts === 0) ?? null;
  return { total: passages.length, read: passages.filter((p) => p.attempts > 0).length, byLevel, accuracy: { correct, total }, suggested };
}
