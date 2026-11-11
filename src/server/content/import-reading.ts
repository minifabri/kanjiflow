/**
 * Import idempotente dei brani di lettura (data/curated/reading/*.json).
 *
 * - i brani sono identificati dallo slug: i tentativi dell'utente restano collegati;
 * - ogni parola annotata viene collegata ai soggetti presenti nel database (kanji e vocaboli);
 *   il collegamento si rifà a ogni import, così un dataset aggiornato arricchisce anche i brani esistenti;
 * - un brano il cui contenuto collegato non è cambiato non viene riscritto;
 * - i brani non più presenti nei file restano nel database (lo storico resta valido).
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { readingFileSchema, type ReadingPassageSource } from "@/domain/reading/content";
import { buildLinkIndex, countSubjects, inflectsFromPartOfSpeech, linkSegments, type LinkIndex } from "@/domain/reading/linking";
import { charCount, MarkupError, parseMarkup, type Segment } from "@/domain/reading/markup";

/** Voce mostrata in Impostazioni → Dati e fonti. Aggiorna la versione quando cambiano i brani. */
export const READING_SOURCE = {
  key: "kanjiflow-reading",
  name: "KanjiFlow – brani di lettura",
  url: null,
  license: "CC BY-SA 4.0",
  attribution:
    "Brani, domande, traduzioni e spiegazioni originali scritti per KanjiFlow in stile JLPT (N4 e N3). Non provengono da prove d'esame ufficiali e non sono stati rivisti da un madrelingua.",
  version: "2026.11.1",
} as const;

export interface ReadingImportReport {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface LinkedPassage {
  source: ReadingPassageSource;
  title: Segment[];
  paragraphs: Segment[][];
  questions: { prompt: Segment[]; choices: Segment[][]; answerIndex: number; explanation: string }[];
  /** Soggetti del titolo e del testo (non delle domande) con il numero di occorrenze. */
  subjects: Map<string, number>;
  charCount: number;
  contentVersion: string;
}

export function linkPassage(source: ReadingPassageSource, index: LinkIndex): LinkedPassage {
  const link = (markup: string) => {
    try {
      return linkSegments(parseMarkup(markup), index);
    } catch (e) {
      if (e instanceof MarkupError) throw new MarkupError(`${source.slug}: ${e.message}`);
      throw e;
    }
  };
  const title = link(source.title);
  const paragraphs = source.body.map(link);
  const questions = source.questions.map((q) => ({
    prompt: link(q.prompt),
    choices: q.choices.map(link),
    answerIndex: q.answer,
    explanation: q.explanation,
  }));
  const contentVersion = createHash("sha256")
    .update(JSON.stringify([source.level, source.format, source.titleIt, title, paragraphs, source.translation, questions]))
    .digest("hex")
    .slice(0, 16);
  return { source, title, paragraphs, questions, subjects: countSubjects([title, ...paragraphs]), charCount: charCount(paragraphs), contentVersion };
}

export async function loadLinkIndex(prisma: PrismaClient): Promise<LinkIndex> {
  const [kanji, vocab] = await Promise.all([
    prisma.subject.findMany({ where: { type: "kanji" }, select: { id: true, characters: true } }),
    prisma.subject.findMany({
      where: { type: "vocabulary" },
      orderBy: { lessonOrder: "asc" },
      select: { id: true, characters: true, partOfSpeech: true, readings: { select: { reading: true } } },
    }),
  ]);
  return buildLinkIndex(
    kanji,
    vocab.map((v) => ({
      id: v.id,
      characters: v.characters,
      readings: v.readings.map((r) => r.reading),
      inflects: inflectsFromPartOfSpeech(v.partOfSpeech ? (JSON.parse(v.partOfSpeech) as string[]) : []),
    })),
  );
}

export async function importReading(prisma: PrismaClient, rawFiles: unknown[]): Promise<ReadingImportReport> {
  const sources = rawFiles.flatMap((raw) => readingFileSchema.parse(raw).passages);
  const slugs = new Set<string>();
  for (const s of sources) {
    if (slugs.has(s.slug)) throw new Error(`Brano duplicato: ${s.slug}`);
    slugs.add(s.slug);
  }
  await prisma.contentSource.upsert({ where: { key: READING_SOURCE.key }, create: READING_SOURCE, update: READING_SOURCE });
  const index = await loadLinkIndex(prisma);
  const existing = new Map(
    (await prisma.readingPassage.findMany({ select: { id: true, slug: true, contentVersion: true, position: true } })).map((p) => [p.slug, p]),
  );
  const report: ReadingImportReport = { total: sources.length, created: 0, updated: 0, unchanged: 0 };

  for (const [position, source] of sources.entries()) {
    const linked = linkPassage(source, index);
    const prev = existing.get(source.slug);
    if (prev && prev.contentVersion === linked.contentVersion && prev.position === position) {
      report.unchanged++;
      continue;
    }
    const data = {
      level: source.level,
      format: source.format,
      title: JSON.stringify(linked.title),
      titleIt: source.titleIt,
      content: JSON.stringify(linked.paragraphs),
      translation: JSON.stringify(source.translation),
      position,
      charCount: linked.charCount,
      contentVersion: linked.contentVersion,
    };
    await prisma.$transaction(async (tx) => {
      const row = prev
        ? await tx.readingPassage.update({ where: { id: prev.id }, data, select: { id: true } })
        : await tx.readingPassage.create({ data: { slug: source.slug, ...data }, select: { id: true } });
      await tx.readingQuestion.deleteMany({ where: { passageId: row.id } });
      await tx.readingQuestion.createMany({
        data: linked.questions.map((q, i) => ({
          passageId: row.id,
          position: i,
          prompt: JSON.stringify(q.prompt),
          choices: JSON.stringify(q.choices),
          answerIndex: q.answerIndex,
          explanation: q.explanation,
        })),
      });
      await tx.readingPassageSubject.deleteMany({ where: { passageId: row.id } });
      await tx.readingPassageSubject.createMany({
        data: [...linked.subjects].map(([subjectId, occurrences]) => ({ passageId: row.id, subjectId, occurrences })),
      });
    });
    if (prev) report.updated++;
    else report.created++;
  }
  return report;
}
