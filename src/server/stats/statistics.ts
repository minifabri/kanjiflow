import "server-only";
import { prisma } from "@/server/db";
import { stageGroup, type SrsGroup, type SrsStage } from "@/domain/srs";
import {
  bucketize,
  forecastByDay,
  median,
  responseHistogram,
  topConfusions,
  type Bucket,
  type StatsRange,
} from "@/domain/stats/aggregate";
import { currentStreak, localDateKey, longestStreak, startOfLocalDay, addDaysKey } from "@/domain/time";
import type { StudyContext } from "@/server/study/context";

const STUDY_ACTIVITIES = ["lesson_completed", "review_completed", "reading_completed", "grammar_lesson", "grammar_review", "grammar_text"];
const FORECAST_DAYS = 14;

type SubjectType = "radical" | "kanji" | "vocabulary";
type StageRow = Record<Exclude<SrsGroup, "lesson">, number> & { total: number; passed: number };

export interface AccuracyRow {
  key: string;
  label: string;
  correct: number;
  total: number;
  medianMs: number | null;
}

export interface StatisticsData {
  range: StatsRange;
  reviews: {
    total: number;
    correct: number;
    medianMs: number | null;
    activeDays: number;
    buckets: Bucket[];
    byQuestion: AccuracyRow[];
    histogram: { label: string; count: number }[];
  };
  streak: { current: number; longest: number };
  confusions: {
    subjectId: string;
    characters: string;
    type: SubjectType;
    questionType: "meaning" | "reading";
    answer: string;
    count: number;
    expected: string;
  }[];
  hardest: { id: string; characters: string; type: SubjectType; meaning: string; incorrect: number; total: number }[];
  stages: { label: string; row: StageRow }[];
  forecast: { key: string; count: number; srs: number; grammar: number }[];
  reading: { attempts: number; passages: number; correct: number; total: number; medianMs: number | null };
  grammar: { reviews: number; correct: number; texts: number; textCorrect: number; textTotal: number };
}

const QUESTION_ROWS: { key: string; label: string; type: SubjectType; question: "meaning" | "reading" }[] = [
  { key: "radical:meaning", label: "Radicali · significato", type: "radical", question: "meaning" },
  { key: "kanji:meaning", label: "Kanji · significato", type: "kanji", question: "meaning" },
  { key: "kanji:reading", label: "Kanji · lettura", type: "kanji", question: "reading" },
  { key: "vocabulary:meaning", label: "Vocaboli · significato", type: "vocabulary", question: "meaning" },
  { key: "vocabulary:reading", label: "Vocaboli · lettura", type: "vocabulary", question: "reading" },
];

const emptyStageRow = (): StageRow => ({ apprentice: 0, guru: 0, master: 0, enlightened: 0, burned: 0, total: 0, passed: 0 });

function addToStageRow(row: StageRow, stage: number) {
  if (stage < 1) return;
  const g = stageGroup(stage as SrsStage);
  if (g === "lesson") return;
  row[g]++;
  row.total++;
  if (stage >= 5) row.passed++;
}

export async function getStatistics(ctx: StudyContext, range: StatsRange, now = new Date()): Promise<StatisticsData> {
  const since = startOfLocalDay(new Date(now.getTime() - (range - 1) * 86_400_000), ctx.timeZone);
  const horizon = new Date(`${addDaysKey(localDateKey(now, ctx.timeZone), FORECAST_DAYS)}T12:00:00Z`);

  const [attempts, progress, grammarProgress, days, readingAttempts, grammarAttempts, textAttempts] = await Promise.all([
    prisma.reviewAttempt.findMany({
      where: { attemptedAt: { gte: since }, session: { userId: ctx.userId, kind: "review" } },
      select: {
        attemptedAt: true,
        questionType: true,
        isCorrect: true,
        responseTimeMs: true,
        normalizedAnswer: true,
        subjectId: true,
        subject: { select: { type: true } },
      },
    }),
    prisma.userSubjectProgress.findMany({
      where: { userId: ctx.userId },
      select: {
        subjectId: true,
        srsStage: true,
        suspendedAt: true,
        nextReviewAt: true,
        meaningCorrectCount: true,
        meaningIncorrectCount: true,
        readingCorrectCount: true,
        readingIncorrectCount: true,
        subject: { select: { type: true, characters: true, primaryMeaning: true } },
      },
    }),
    prisma.userGrammarProgress.findMany({ where: { userId: ctx.userId }, select: { srsStage: true, nextReviewAt: true } }),
    prisma.studyActivity.findMany({
      where: { userId: ctx.userId, activityType: { in: STUDY_ACTIVITIES } },
      distinct: ["localDate"],
      select: { localDate: true },
    }),
    prisma.readingAttempt.findMany({
      where: { userId: ctx.userId, completedAt: { gte: since } },
      select: { passageId: true, correctCount: true, totalCount: true, durationMs: true },
    }),
    prisma.grammarAttempt.findMany({ where: { userId: ctx.userId, mode: "review", attemptedAt: { gte: since } }, select: { isCorrect: true } }),
    prisma.grammarTextAttempt.findMany({
      where: { userId: ctx.userId, completedAt: { gte: since } },
      select: { textId: true, correctCount: true, totalCount: true },
    }),
  ]);

  // --- ripassi nel periodo ---
  const correct = attempts.filter((a) => a.isCorrect).length;
  const buckets = bucketize(
    attempts.map((a) => ({ at: a.attemptedAt, isCorrect: a.isCorrect })),
    range,
    ctx.timeZone,
    now,
  );
  const activeDays = new Set(attempts.map((a) => localDateKey(a.attemptedAt, ctx.timeZone))).size;
  const byQuestion = QUESTION_ROWS.map((q) => {
    const rows = attempts.filter((a) => a.subject.type === q.type && a.questionType === q.question);
    return {
      key: q.key,
      label: q.label,
      correct: rows.filter((r) => r.isCorrect).length,
      total: rows.length,
      medianMs: median(rows.map((r) => r.responseTimeMs)),
    };
  }).filter((r) => r.total > 0);

  // --- errori ripetuti: stessa risposta sbagliata sullo stesso elemento ---
  const top = topConfusions(
    attempts.filter((a) => !a.isCorrect).map((a) => ({ subjectId: a.subjectId, questionType: a.questionType, answer: a.normalizedAnswer })),
    10,
  ).filter((c) => c.count >= 2);
  const confusionSubjects = top.length
    ? await prisma.subject.findMany({
        where: { id: { in: [...new Set(top.map((c) => c.subjectId))] } },
        select: {
          id: true,
          type: true,
          characters: true,
          primaryMeaning: true,
          readings: { where: { isPrimary: true }, orderBy: { position: "asc" }, select: { reading: true } },
        },
      })
    : [];
  const subjectById = new Map(confusionSubjects.map((s) => [s.id, s]));
  const confusions = top.flatMap((c) => {
    const s = subjectById.get(c.subjectId);
    if (!s) return [];
    const questionType = c.questionType === "reading" ? ("reading" as const) : ("meaning" as const);
    return [
      {
        subjectId: s.id,
        characters: s.characters,
        type: s.type as SubjectType,
        questionType,
        answer: c.answer,
        count: c.count,
        expected: questionType === "reading" ? s.readings.map((r) => r.reading.replace(/[.-]/g, "")).join("・") : s.primaryMeaning,
      },
    ];
  });

  // --- elementi più difficili (da sempre) ---
  const hardest = progress
    .filter((p) => !p.suspendedAt)
    .map((p) => {
      const incorrect = p.meaningIncorrectCount + p.readingIncorrectCount;
      const total = incorrect + p.meaningCorrectCount + p.readingCorrectCount;
      return { id: p.subjectId, characters: p.subject.characters, type: p.subject.type as SubjectType, meaning: p.subject.primaryMeaning, incorrect, total };
    })
    .filter((h) => h.total >= 4 && h.incorrect > 0)
    .sort((a, b) => b.incorrect / b.total - a.incorrect / a.total || b.incorrect - a.incorrect)
    .slice(0, 10);

  // --- stadi per tipo ---
  const stageRows: Record<SubjectType | "grammar", StageRow> = {
    radical: emptyStageRow(),
    kanji: emptyStageRow(),
    vocabulary: emptyStageRow(),
    grammar: emptyStageRow(),
  };
  for (const p of progress) if (!p.suspendedAt) addToStageRow(stageRows[p.subject.type as SubjectType], p.srsStage);
  for (const g of grammarProgress) addToStageRow(stageRows.grammar, g.srsStage);
  const stages = (
    [
      ["Radicali", stageRows.radical],
      ["Kanji", stageRows.kanji],
      ["Vocaboli", stageRows.vocabulary],
      ["Grammatica", stageRows.grammar],
    ] as const
  )
    .filter(([, row]) => row.total > 0)
    .map(([label, row]) => ({ label, row }));

  // --- carico previsto: SRS di kanji/vocaboli/radicali e grammatica, separati nel dettaglio ---
  const srsDue = progress
    .filter((p) => !p.suspendedAt && p.nextReviewAt && p.srsStage >= 1 && p.srsStage <= 8 && p.nextReviewAt < horizon)
    .map((p) => p.nextReviewAt!);
  const grammarDue = grammarProgress.filter((g) => g.nextReviewAt && g.srsStage >= 1 && g.srsStage <= 8 && g.nextReviewAt < horizon).map((g) => g.nextReviewAt!);
  const srsDays = forecastByDay(srsDue, FORECAST_DAYS, ctx.timeZone, now);
  const grammarDays = forecastByDay(grammarDue, FORECAST_DAYS, ctx.timeZone, now);
  const forecast = srsDays.map((d, i) => ({ key: d.key, srs: d.count, grammar: grammarDays[i]!.count, count: d.count + grammarDays[i]!.count }));

  const dayKeys = new Set(days.map((d) => d.localDate));
  return {
    range,
    reviews: {
      total: attempts.length,
      correct,
      medianMs: median(attempts.map((a) => a.responseTimeMs)),
      activeDays,
      buckets,
      byQuestion,
      histogram: responseHistogram(attempts.map((a) => a.responseTimeMs)),
    },
    streak: { current: currentStreak(dayKeys, localDateKey(now, ctx.timeZone)), longest: longestStreak(dayKeys) },
    confusions,
    hardest,
    stages,
    forecast,
    reading: {
      attempts: readingAttempts.length,
      passages: new Set(readingAttempts.map((r) => r.passageId)).size,
      correct: readingAttempts.reduce((n, r) => n + r.correctCount, 0),
      total: readingAttempts.reduce((n, r) => n + r.totalCount, 0),
      medianMs: median(readingAttempts.map((r) => r.durationMs)),
    },
    grammar: {
      reviews: grammarAttempts.length,
      correct: grammarAttempts.filter((g) => g.isCorrect).length,
      texts: new Set(textAttempts.map((t) => t.textId)).size,
      textCorrect: textAttempts.reduce((n, t) => n + t.correctCount, 0),
      textTotal: textAttempts.reduce((n, t) => n + t.totalCount, 0),
    },
  };
}

