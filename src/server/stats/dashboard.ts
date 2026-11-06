import "server-only";
import { prisma } from "@/server/db";
import { stageGroup, type SrsGroup, type SrsStage } from "@/domain/srs";
import { currentStreak, localDateKey, startOfLocalDay, addDaysKey } from "@/domain/time";
import { isPassedProgress } from "@/domain/curriculum/lesson-queue";
import type { StudyContext } from "@/server/study/context";
import { getLessonQueue } from "@/server/study/lessons";
import { countDueReviews } from "@/server/study/reviews";

export interface DashboardData {
  displayName: string;
  level: { current: number; total: number; passedInLevel: number; levelSize: number };
  lessons: { available: number; allowance: number; doneToday: number; dailyLimit: number };
  reviews: { now: number; next24h: number; next7d: number };
  stages: Record<Exclude<SrsGroup, "lesson">, number>;
  accuracyToday: { correct: number; total: number };
  streak: number;
  learnedKanji: number;
  /** Fascia JLPT obiettivo (N2/N1 non sono ancora nel dataset: si mostra N3). */
  band: { name: string; kanjiPassed: number; kanjiTotal: number; vocabPassed: number; vocabTotal: number };
  forecastHourly: { label: string; count: number }[];
  forecastDaily: { label: string; count: number }[];
  heatmap: { date: string; count: number }[];
  weak: { id: string; characters: string; meaning: string; incorrect: number; total: number }[];
  nextKanji: { id: string; characters: string; meaning: string; readings: string } | null;
  suspended: number;
}

const LEVEL_SIZE = 20;

export async function getDashboard(ctx: StudyContext, now = new Date()): Promise<DashboardData> {
  const tz = ctx.timeZone;
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const in7d = new Date(now.getTime() + 7 * 24 * 3600_000);
  const todayStart = startOfLocalDay(now, tz);
  const todayKey = localDateKey(now, tz);
  const heatStartKey = addDaysKey(todayKey, -7 * 26 + 1);
  const targetBand = ["N5", "N4", "N3"].includes(ctx.settings.targetJlpt) ? ctx.settings.targetJlpt : "N3";

  const [progress, lessonInfo, dueNow, todayAttempts, activityDays, bandSubjects, kanjiOrder] = await Promise.all([
    prisma.userSubjectProgress.findMany({
      where: { userId: ctx.userId },
      select: {
        subjectId: true,
        srsStage: true,
        nextReviewAt: true,
        markedKnownAt: true,
        suspendedAt: true,
        meaningIncorrectCount: true,
        readingIncorrectCount: true,
        meaningCorrectCount: true,
        readingCorrectCount: true,
        subject: { select: { type: true, characters: true, primaryMeaning: true } },
      },
    }),
    getLessonQueue(ctx, now),
    countDueReviews(ctx.userId, now),
    prisma.reviewAttempt.findMany({
      where: { attemptedAt: { gte: todayStart }, session: { userId: ctx.userId, kind: "review" } },
      select: { isCorrect: true },
    }),
    prisma.studyActivity.groupBy({
      by: ["localDate"],
      where: { userId: ctx.userId, localDate: { gte: heatStartKey }, activityType: { in: ["lesson_completed", "review_completed"] } },
      _count: { _all: true },
    }),
    prisma.subjectClassification.findMany({
      where: { classificationValue: targetBand, classificationSystem: { in: ["jlpt-waller", "jlpt-open-anki"] } },
      select: { subjectId: true, subject: { select: { type: true } } },
    }),
    prisma.subject.findMany({ where: { type: "kanji" }, orderBy: { lessonOrder: "asc" }, select: { id: true } }),
  ]);

  const stages = { apprentice: 0, guru: 0, master: 0, enlightened: 0, burned: 0 };
  const pmap = new Map<string, (typeof progress)[number]>();
  let suspended = 0;
  let next24h = 0;
  let next7d = 0;
  const hourly = new Array<number>(24).fill(0);
  const daily = new Array<number>(7).fill(0);
  for (const p of progress) {
    pmap.set(p.subjectId, p);
    if (p.suspendedAt) {
      suspended++;
      continue;
    }
    if (p.srsStage >= 1) {
      const g = stageGroup(p.srsStage as SrsStage);
      if (g !== "lesson") stages[g]++;
    }
    if (p.nextReviewAt && p.srsStage >= 1 && p.srsStage <= 8) {
      const t = p.nextReviewAt.getTime();
      if (t > now.getTime() && t <= in24h.getTime()) {
        next24h++;
        hourly[Math.min(23, Math.floor((t - now.getTime()) / 3600_000))]!++;
      }
      if (t > now.getTime() && t <= in7d.getTime()) {
        next7d++;
        const dayIdx = Math.round(
          (new Date(`${localDateKey(p.nextReviewAt, tz)}T12:00:00Z`).getTime() - new Date(`${todayKey}T12:00:00Z`).getTime()) / 86_400_000,
        );
        if (dayIdx >= 0 && dayIdx < 7) daily[dayIdx]!++;
      }
    }
  }
  const passed = (id: string) => {
    const p = pmap.get(id);
    return !!p && isPassedProgress({ stage: p.srsStage, markedKnown: !!p.markedKnownAt, suspended: !!p.suspendedAt });
  };

  const learnedKanji = progress.filter((p) => p.subject.type === "kanji" && passed(p.subjectId)).length;
  const bandKanji = bandSubjects.filter((s) => s.subject.type === "kanji");
  const bandVocab = bandSubjects.filter((s) => s.subject.type === "vocabulary");

  // Livelli: blocchi di 20 kanji nell'ordine di studio; si passa al successivo al 90% superato.
  const totalLevels = Math.ceil(kanjiOrder.length / LEVEL_SIZE);
  let level = 1;
  let passedInLevel = 0;
  for (let i = 0; i < totalLevels; i++) {
    const block = kanjiOrder.slice(i * LEVEL_SIZE, (i + 1) * LEVEL_SIZE);
    const n = block.filter((k) => passed(k.id)).length;
    if (n >= Math.ceil(block.length * 0.9) && i < totalLevels - 1) continue;
    level = i + 1;
    passedInLevel = n;
    break;
  }

  const hourFmt = new Intl.DateTimeFormat("it-IT", { timeZone: tz, hour: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat("it-IT", { timeZone: tz, weekday: "short" });
  const forecastHourly = hourly.map((count, i) => ({ label: `${hourFmt.format(new Date(now.getTime() + (i + 1) * 3600_000))}`, count }));
  const forecastDaily = daily.map((count, i) => ({
    label: i === 0 ? "oggi" : dayFmt.format(new Date(new Date(`${addDaysKey(todayKey, i)}T12:00:00Z`))),
    count,
  }));

  const weak = progress
    .filter((p) => p.subject.type === "kanji" && !p.suspendedAt)
    .map((p) => {
      const incorrect = p.meaningIncorrectCount + p.readingIncorrectCount;
      const total = incorrect + p.meaningCorrectCount + p.readingCorrectCount;
      return { id: p.subjectId, characters: p.subject.characters, meaning: p.subject.primaryMeaning, incorrect, total };
    })
    .filter((w) => w.total >= 4 && w.incorrect / w.total >= 0.25)
    .sort((a, b) => b.incorrect / b.total - a.incorrect / a.total || b.incorrect - a.incorrect)
    .slice(0, 6);

  const nextId = lessonInfo.queue.find((s) => s.type === "kanji")?.id ?? null;
  let nextKanji: DashboardData["nextKanji"] = null;
  if (nextId) {
    const s = await prisma.subject.findUnique({ where: { id: nextId }, include: { readings: { where: { isPrimary: true } } } });
    if (s) {
      const { katakanaToHiragana } = await import("@/domain/answers");
      const toKata = (h: string) => [...katakanaToHiragana(h)].map((c) => {
        const cp = c.codePointAt(0)!;
        return cp >= 0x3041 && cp <= 0x3096 ? String.fromCodePoint(cp + 0x60) : c;
      }).join("");
      nextKanji = {
        id: s.id,
        characters: s.characters,
        meaning: s.primaryMeaning,
        readings: s.readings.map((r) => (r.readingType === "onyomi" ? toKata(r.reading) : r.reading.replace(/\./g, ""))).join(" · "),
      };
    }
  }

  const days = new Set(activityDays.map((a) => a.localDate));
  return {
    displayName: ctx.displayName,
    level: { current: level, total: totalLevels, passedInLevel, levelSize: LEVEL_SIZE },
    lessons: {
      available: lessonInfo.totalAvailable,
      allowance: Math.min(lessonInfo.allowance, lessonInfo.totalAvailable),
      doneToday: lessonInfo.lessonsCompletedToday,
      dailyLimit: ctx.settings.dailyLessonLimit,
    },
    reviews: { now: dueNow, next24h, next7d },
    stages,
    accuracyToday: { correct: todayAttempts.filter((a) => a.isCorrect).length, total: todayAttempts.length },
    streak: currentStreak(days, todayKey),
    learnedKanji,
    band: {
      name: targetBand,
      kanjiPassed: bandKanji.filter((s) => passed(s.subjectId)).length,
      kanjiTotal: bandKanji.length,
      vocabPassed: bandVocab.filter((s) => passed(s.subjectId)).length,
      vocabTotal: bandVocab.length,
    },
    forecastHourly,
    forecastDaily,
    heatmap: activityDays.map((a) => ({ date: a.localDate, count: a._count._all })),
    weak,
    nextKanji,
    suspended,
  };
}
