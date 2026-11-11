import "server-only";
import { prisma } from "@/server/db";
import { currentStreak, localDateKey } from "@/domain/time";
import {
  buildOptions,
  chooseDistractors,
  displayReading,
  maskFirst,
  pickOne,
  pickSparkSubject,
  seededRng,
  shuffled,
  sparkSlot,
  type Rng,
  type Spark,
  type SparkFact,
  type SparkKind,
  type SparkPoolItem,
  type SparkReason,
  type SparkSubjectType,
} from "@/domain/spark/spark";
import type { StudyContext } from "./context";

/**
 * Stimoli della dashboard. Le risposte finiscono in StudyActivity (spark_correct / spark_incorrect):
 * non toccano SRS, serie di studio né heatmap, che contano solo lezioni e ripassi.
 */
const SPARK_CORRECT = "spark_correct";
const SPARK_INCORRECT = "spark_incorrect";
const SPARK_TYPES = [SPARK_CORRECT, SPARK_INCORRECT];
const DAY = 86_400_000;

export interface SparkSummary {
  today: { correct: number; total: number };
  /** Giorni consecutivi con almeno uno stimolo. */
  streak: number;
  answeredInSlot: number;
}

export interface SparkState extends SparkSummary {
  /** null quando lo stimolo della fascia è già stato fatto (o non c'è nulla da chiedere). */
  spark: Spark | null;
  slotLabel: string;
  nextLabel: string;
}

interface History extends SparkSummary {
  missed: Set<string>;
  recent: Set<string>;
}

async function loadHistory(ctx: StudyContext, now: Date): Promise<History> {
  const slot = sparkSlot(now, ctx.timeZone);
  const todayKey = localDateKey(now, ctx.timeZone);
  const rows = await prisma.studyActivity.findMany({
    where: { userId: ctx.userId, activityType: { in: SPARK_TYPES }, timestamp: { gte: new Date(now.getTime() - 60 * DAY) } },
    orderBy: { timestamp: "asc" },
    select: { activityType: true, subjectId: true, localDate: true, timestamp: true },
  });
  const today = { correct: 0, total: 0 };
  const days = new Set<string>();
  const lastResult = new Map<string, boolean>();
  const recent = new Set<string>();
  const justAsked = new Set<string>();
  let answeredInSlot = 0;
  for (const r of rows) {
    const correct = r.activityType === SPARK_CORRECT;
    days.add(r.localDate);
    if (r.localDate === todayKey) {
      today.total++;
      if (correct) today.correct++;
    }
    if (r.timestamp >= slot.startsAt) answeredInSlot++;
    if (!r.subjectId) continue;
    if (now.getTime() - r.timestamp.getTime() <= 7 * DAY) lastResult.set(r.subjectId, correct);
    if (now.getTime() - r.timestamp.getTime() <= 2 * DAY) recent.add(r.subjectId);
    if (now.getTime() - r.timestamp.getTime() <= 4 * 3600_000) justAsked.add(r.subjectId);
  }
  const missed = new Set([...lastResult].filter(([, ok]) => !ok).map(([id]) => id));
  // Un errore torna già alla fascia successiva ("rivincita"); una risposta giusta riposa due giorni.
  for (const id of missed) if (!justAsked.has(id)) recent.delete(id);
  return { today, streak: currentStreak(days, todayKey), answeredInSlot, missed, recent };
}

/** Stato per la dashboard. Con `force` genera una domanda anche se quella della fascia è già stata fatta. */
export async function getSparkState(ctx: StudyContext, now = new Date(), force = false): Promise<SparkState> {
  const slot = sparkSlot(now, ctx.timeZone);
  const h = await loadHistory(ctx, now);
  const wanted = force || h.answeredInSlot === 0;
  // Il seme cambia solo dopo una risposta: ricaricando la pagina la domanda resta la stessa.
  const spark = wanted ? await buildSpark(ctx, `${ctx.userId}:${slot.id}:${h.answeredInSlot}`, now, h) : null;
  return { spark, today: h.today, streak: h.streak, answeredInSlot: h.answeredInSlot, slotLabel: slot.label, nextLabel: slot.nextLabel };
}

export async function recordSparkAnswer(ctx: StudyContext, subjectId: string, correct: boolean, now = new Date()): Promise<SparkSummary> {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (subject) {
    // Doppio tocco o richiesta ripetuta: una sola riga.
    const duplicate = await prisma.studyActivity.findFirst({
      where: { userId: ctx.userId, subjectId, activityType: { in: SPARK_TYPES }, timestamp: { gte: new Date(now.getTime() - 5000) } },
      select: { id: true },
    });
    if (!duplicate) {
      await prisma.studyActivity.create({
        data: { userId: ctx.userId, subjectId, activityType: correct ? SPARK_CORRECT : SPARK_INCORRECT, localDate: localDateKey(now, ctx.timeZone), timestamp: now },
      });
    }
  }
  const { today, streak, answeredInSlot } = await loadHistory(ctx, now);
  return { today, streak, answeredInSlot };
}

/* ---------- Costruzione della domanda ---------- */

interface Brief {
  id: string;
  type: SparkSubjectType;
  characters: string;
  primaryMeaning: string;
  lessonOrder: number;
}

const TYPE_WORD: Record<SparkSubjectType, string> = { radical: "radicale", kanji: "kanji", vocabulary: "parola" };
const lower = (s: string) => s.normalize("NFKC").trim().toLowerCase();
const len = (s: string) => [...s].length;

/** Opzioni della stessa lunghezza della risposta, quando ce ne sono abbastanza: la lunghezza non deve tradire la soluzione. */
function sameLength<T>(cands: T[], text: (c: T) => string, target: string): T[] {
  const same = cands.filter((c) => len(text(c)) === len(target));
  return same.length >= 6 ? same : cands;
}
const hasKanji = (s: string) => /[\u4e00-\u9fff々]/.test(s);

async function buildSpark(ctx: StudyContext, key: string, now: Date, history: History): Promise<Spark | null> {
  const rng = seededRng(key);
  const progress = await prisma.userSubjectProgress.findMany({
    where: { userId: ctx.userId, suspendedAt: null, srsStage: { gte: 1 } },
    select: {
      subjectId: true,
      srsStage: true,
      markedKnownAt: true,
      nextReviewAt: true,
      lessonCompletedAt: true,
      meaningCorrectCount: true,
      meaningIncorrectCount: true,
      readingCorrectCount: true,
      readingIncorrectCount: true,
      subject: { select: { type: true, characters: true, primaryMeaning: true, lessonOrder: true } },
    },
  });

  let briefs: Brief[] = progress.map((p) => ({ id: p.subjectId, ...p.subject, type: p.subject.type as SparkSubjectType }));
  let targetId: string;
  let reason: SparkReason;
  if (progress.length > 0) {
    const pool: SparkPoolItem[] = progress.map((p) => {
      const incorrect = p.meaningIncorrectCount + p.readingIncorrectCount;
      return {
        id: p.subjectId,
        type: p.subject.type as SparkSubjectType,
        stage: p.srsStage,
        markedKnown: !!p.markedKnownAt,
        incorrect,
        total: incorrect + p.meaningCorrectCount + p.readingCorrectCount,
        nextReviewAt: p.nextReviewAt,
        lessonCompletedAt: p.lessonCompletedAt,
        missedInSpark: history.missed.has(p.subjectId),
      };
    });
    const picked = pickSparkSubject(pool, rng, now, history.recent)!;
    targetId = picked.item.id;
    reason = picked.reason;
  } else {
    // Nessuna lezione ancora fatta: si gioca a indovinare i primi kanji del percorso.
    const first = await prisma.subject.findMany({
      where: { type: "kanji" },
      orderBy: { lessonOrder: "asc" },
      take: 40,
      select: { id: true, type: true, characters: true, primaryMeaning: true, lessonOrder: true },
    });
    briefs = first.map((s) => ({ ...s, type: s.type as SparkSubjectType }));
    const fresh = briefs.filter((b) => !history.recent.has(b.id));
    const t = pickOne(fresh.length ? fresh : briefs, rng);
    if (!t) return null;
    targetId = t.id;
    reason = "discover";
  }

  const subject = await prisma.subject.findUnique({
    where: { id: targetId },
    include: {
      meanings: { where: { language: "it", OR: [{ userId: null }, { userId: ctx.userId }] }, select: { meaning: true } },
      readings: { orderBy: { position: "asc" } },
      components: { include: { component: { select: { id: true, type: true, characters: true, primaryMeaning: true, lessonOrder: true } } } },
      usedIn: {
        take: 40,
        include: {
          parent: {
            select: {
              id: true,
              type: true,
              characters: true,
              primaryMeaning: true,
              readings: { where: { isPrimary: true }, take: 1, select: { reading: true } },
            },
          },
        },
      },
      examples: { take: 6, select: { japaneseText: true, translatedText: true } },
      mnemonics: { where: { OR: [{ userId: null }, { userId: ctx.userId }] }, select: { mnemonicType: true, content: true, userId: true } },
    },
  });
  if (!subject) return null;
  const type = subject.type as SparkSubjectType;
  const learned = new Set(briefs.map((b) => b.id));

  /** Soggetti simili per posizione nel percorso: distrattori plausibili, presi da ciò che si è già studiato. */
  const near = async (ofType: SparkSubjectType, order: number): Promise<Brief[]> => {
    const own = briefs
      .filter((b) => b.type === ofType && b.id !== subject.id)
      .sort((a, b) => Math.abs(a.lessonOrder - order) - Math.abs(b.lessonOrder - order))
      .slice(0, 60);
    if (own.length >= 12) return own;
    const extra = await prisma.subject.findMany({
      where: { type: ofType, id: { notIn: [subject.id, ...own.map((o) => o.id)] }, lessonOrder: { gte: order - 400, lte: order + 400 } },
      take: 40,
      select: { id: true, type: true, characters: true, primaryMeaning: true, lessonOrder: true },
    });
    return [...own, ...extra.map((s) => ({ ...s, type: s.type as SparkSubjectType }))];
  };

  const targetMeanings = [subject.primaryMeaning, ...subject.meanings.map((m) => m.meaning)];
  const meaningSet = new Set(targetMeanings.map(lower));
  const primaryReading = subject.readings.find((r) => r.isPrimary && r.isAccepted) ?? subject.readings[0] ?? null;
  const readingLabel = primaryReading ? displayReading(primaryReading.reading, primaryReading.readingType) : null;

  // Parola da completare: per un vocabolo si nasconde un suo kanji, per un kanji una parola che lo contiene.
  let cloze: { word: string; meaning: string; reading: string | null; hidden: string; order: number } | null = null;
  if (type === "vocabulary") {
    const parts = subject.components.map((c) => c.component).filter((c) => c.type === "kanji" && subject.characters.includes(c.characters));
    const part = pickOne(parts, rng);
    if (part && [...subject.characters].length >= 2) {
      cloze = { word: subject.characters, meaning: subject.primaryMeaning, reading: primaryReading?.reading ?? null, hidden: part.characters, order: part.lessonOrder };
    }
  } else if (type === "kanji") {
    const words = subject.usedIn.map((u) => u.parent).filter((p) => p.type === "vocabulary" && [...p.characters].length >= 2 && p.characters.includes(subject.characters));
    const known = words.filter((w) => learned.has(w.id));
    const word = pickOne(known.length ? known : words, rng);
    if (word) cloze = { word: word.characters, meaning: word.primaryMeaning, reading: word.readings[0]?.reading ?? null, hidden: subject.characters, order: subject.lessonOrder };
  }
  const sentence =
    type === "vocabulary" && [...subject.characters].length >= 2
      ? (pickOne(subject.examples.filter((e) => e.japaneseText.includes(subject.characters)), rng) ?? null)
      : null;

  const kinds: SparkKind[] = ["meaning", "meaning", "meaning"];
  if (reason !== "discover") {
    kinds.push("reverse", "reverse");
    if (readingLabel && hasKanji(subject.characters)) kinds.push("reading", "reading", "reading");
    if (cloze) kinds.push("cloze", "cloze");
    if (sentence) kinds.push("sentence", "sentence");
  }
  const wanted = pickOne(kinds, rng)!;

  type Question = Pick<Spark, "kind" | "prompt" | "display" | "displayJp" | "hint" | "options" | "correctIndex">;
  const ask = async (kind: SparkKind): Promise<Question | null> => {
    const make = (correct: string, distractors: string[], jp: boolean, rest: Pick<Spark, "prompt" | "display" | "displayJp" | "hint">): Question | null =>
      distractors.length < 2 ? null : { kind, ...rest, ...buildOptions(correct, distractors, jp, rng) };

    if (kind === "meaning") {
      const cands = await near(type, subject.lessonOrder);
      return make(subject.primaryMeaning, chooseDistractors(cands.map((c) => c.primaryMeaning), targetMeanings, rng), false, {
        prompt: reason === "discover" ? "Secondo te, che cosa significa?" : "Che cosa significa?",
        display: subject.characters,
        displayJp: true,
        hint: null,
      });
    }
    if (kind === "reverse") {
      // Un sinonimo tra le opzioni sarebbe una seconda risposta giusta: si escludono i significati coincidenti.
      const all = (await near(type, subject.lessonOrder)).filter((c) => !meaningSet.has(lower(c.primaryMeaning)));
      const cands = sameLength(all, (c) => c.characters, subject.characters);
      return make(subject.characters, chooseDistractors(cands.map((c) => c.characters), [subject.characters], rng), true, {
        prompt: `Quale ${TYPE_WORD[type]} significa «${subject.primaryMeaning}»?`,
        display: null,
        displayJp: false,
        hint: null,
      });
    }
    if (kind === "reading" && primaryReading && readingLabel) {
      const cands = shuffled(sameLength(await near(type, subject.lessonOrder), (c) => c.characters, subject.characters), rng).slice(0, 30);
      const rows = await prisma.subjectReading.findMany({
        where: { subjectId: { in: cands.map((c) => c.id) }, isPrimary: true, ...(type === "kanji" ? { readingType: primaryReading.readingType } : {}) },
        orderBy: { position: "asc" },
        select: { reading: true, readingType: true },
      });
      const forbidden = subject.readings.flatMap((r) => [displayReading(r.reading, r.readingType), displayReading(r.reading, "kunyomi"), displayReading(r.reading, "onyomi")]);
      const labels = sameLength(rows.map((r) => displayReading(r.reading, r.readingType)), (l) => l, readingLabel);
      return make(readingLabel, chooseDistractors(labels, forbidden, rng), true, {
        prompt: type === "kanji" ? (primaryReading.readingType === "onyomi" ? "Qual è la lettura on'yomi?" : "Qual è la lettura kun'yomi?") : "Come si legge?",
        display: subject.characters,
        displayJp: true,
        hint: `«${subject.primaryMeaning}»`,
      });
    }
    if (kind === "cloze" && cloze) {
      const cands = await near("kanji", cloze.order);
      return make(cloze.hidden, chooseDistractors(cands.map((c) => c.characters), [...cloze.word], rng), true, {
        prompt: "Quale kanji completa la parola?",
        display: maskFirst(cloze.word, cloze.hidden),
        displayJp: true,
        hint: `«${cloze.meaning}»`,
      });
    }
    if (kind === "sentence" && sentence) {
      const fitting = (await near("vocabulary", subject.lessonOrder)).filter((c) => !sentence.japaneseText.includes(c.characters));
      const cands = sameLength(fitting, (c) => c.characters, subject.characters);
      return make(subject.characters, chooseDistractors(cands.map((c) => c.characters), [subject.characters], rng), true, {
        prompt: "Quale parola completa la frase?",
        display: maskFirst(sentence.japaneseText, subject.characters, "＿＿"),
        displayJp: true,
        hint: sentence.translatedText,
      });
    }
    return null;
  };

  const question = (await ask(wanted)) ?? (wanted === "meaning" ? null : await ask("meaning"));
  if (!question) return null;

  const showWord = question.kind === "cloze" && cloze && type === "kanji" ? cloze : null;
  return {
    key,
    reason,
    subjectId: subject.id,
    subjectType: type,
    ...question,
    reveal: {
      characters: showWord ? showWord.word : subject.characters,
      reading: showWord ? showWord.reading : readingLabel,
      speech: (showWord ? showWord.reading : primaryReading?.reading)?.replace(/[.\-]/g, "") ?? null,
      meaning: showWord ? showWord.meaning : subject.primaryMeaning,
      facts: buildFacts(question.kind, type, subject, sentence, rng),
    },
  };
}

interface FactSource {
  characters: string;
  strokeCount: number | null;
  components: { component: { type: string; characters: string; primaryMeaning: string } }[];
  usedIn: { parent: { type: string; characters: string; primaryMeaning: string; readings: { reading: string }[] } }[];
  examples: { japaneseText: string; translatedText: string }[];
  mnemonics: { mnemonicType: string; content: string; userId: string | null }[];
}

/** Dopo la risposta: il mnemonico (quello personale ha la precedenza) e una curiosità presa dai dati del soggetto. */
function buildFacts(kind: SparkKind, type: SparkSubjectType, s: FactSource, usedSentence: { japaneseText: string } | null, rng: Rng): SparkFact[] {
  const facts: SparkFact[] = [];
  const wantedType = kind === "reading" ? "reading" : "meaning";
  const mnemonics = s.mnemonics.filter((m) => m.mnemonicType === wantedType);
  const mnemonic = mnemonics.find((m) => m.userId) ?? mnemonics[0];
  if (mnemonic) facts.push({ title: "Per ricordarlo", text: mnemonic.content });

  const extras: SparkFact[] = [];
  const parts = s.components.map((c) => c.component);
  if (type === "kanji") {
    const words = s.usedIn.map((u) => u.parent).filter((p) => p.type === "vocabulary");
    if (words.length) {
      const sample = shuffled(words, rng).slice(0, 3);
      extras.push({
        title: "Dove lo incontri",
        text: sample.map((w) => `**${w.characters}**${w.readings[0] ? ` (${w.readings[0].reading})` : ""} «${w.primaryMeaning}»`).join(" · "),
      });
    }
    if (parts.length) {
      const strokes = s.strokeCount ? ` · ${s.strokeCount} tratti` : "";
      extras.push({ title: "Com'è fatto", text: parts.map((p) => `**${p.characters}** «${p.primaryMeaning}»`).join(" + ") + strokes });
    }
  } else if (type === "vocabulary") {
    const example = pickOne(s.examples.filter((e) => e.japaneseText !== usedSentence?.japaneseText), rng);
    if (example) extras.push({ title: "In una frase", text: `${example.japaneseText} — ${example.translatedText}`, jp: true });
    if (!mnemonic && parts.length) extras.push({ title: "Com'è fatta", text: parts.map((p) => `**${p.characters}** «${p.primaryMeaning}»`).join(" + ") });
  } else {
    const kanji = s.usedIn.map((u) => u.parent).filter((p) => p.type === "kanji");
    if (kanji.length) {
      extras.push({ title: "Lo trovi in", text: shuffled(kanji, rng).slice(0, 5).map((k) => `**${k.characters}** «${k.primaryMeaning}»`).join(" · ") });
    }
  }
  const extra = pickOne(extras, rng);
  if (extra) facts.push(extra);
  return facts;
}
