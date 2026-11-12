/**
 * Import idempotente dei punti grammaticali (data/curated/grammar/*.json).
 *
 * - i punti sono identificati dallo slug e gli esercizi dalla posizione: progressi e tentativi restano collegati;
 * - le frasi usano lo stesso markup dei brani e vengono collegate ai kanji, per il furigana adattivo;
 * - un punto il cui contenuto non è cambiato non viene riscritto;
 * - i punti non più presenti nei file restano nel database (lo storico resta valido).
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { GRAMMAR_LEVELS, grammarFileSchema, type GrammarPointSource } from "@/domain/grammar/content";
import { buildExercise } from "@/domain/grammar/exercise";
import { linkSegments, type LinkIndex } from "@/domain/reading/linking";
import { MarkupError, parseMarkup, type Segment } from "@/domain/reading/markup";
import { loadLinkIndex } from "./import-reading";

export const GRAMMAR_SOURCE = {
  key: "kanjiflow-grammar",
  name: "KanjiFlow – grammatica",
  url: null,
  license: "CC BY-SA 4.0",
  attribution:
    "Schede dei punti grammaticali N4 e N3, frasi d'esempio ed esercizi in stile JLPT scritti per KanjiFlow. Non provengono da prove d'esame ufficiali e non sono stati rivisti da un madrelingua.",
  version: "2026.11.1",
} as const;

export interface GrammarImportReport {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface LinkedGrammarPoint {
  title: Segment[];
  structure: Segment[];
  examples: { ja: Segment[]; it: string }[];
  exercises: {
    kind: string;
    prompt: Segment[];
    choices: Segment[][];
    answerIndex: number;
    solution: Segment[];
    translation: string;
    explanation: string;
  }[];
  contentVersion: string;
}

export function linkGrammarPoint(source: GrammarPointSource, index: LinkIndex): LinkedGrammarPoint {
  const link = (markup: string) => {
    try {
      return linkSegments(parseMarkup(markup), index);
    } catch (e) {
      if (e instanceof MarkupError) throw new MarkupError(`${source.slug}: ${e.message}`);
      throw e;
    }
  };
  const title = link(source.title);
  const structure = link(source.structure);
  const examples = source.examples.map((e) => ({ ja: link(e.ja), it: e.it }));
  const exercises = source.exercises.map((e, i) => {
    const built = buildExercise(e, `${source.slug}:${i}`);
    return {
      kind: built.kind,
      prompt: link(built.prompt),
      choices: built.choices.map(link),
      answerIndex: built.answerIndex,
      solution: link(built.solution),
      translation: built.translation,
      explanation: built.explanation,
    };
  });
  const contentVersion = createHash("sha256")
    .update(JSON.stringify([source.level, title, source.meaning, structure, source.explanation, examples, exercises]))
    .digest("hex")
    .slice(0, 16);
  return { title, structure, examples, exercises, contentVersion };
}

export async function importGrammar(prisma: PrismaClient, rawFiles: unknown[]): Promise<GrammarImportReport> {
  // Ordine di studio: prima il livello più facile, poi l'ordine in cui i punti compaiono nei file.
  const sources = rawFiles
    .flatMap((raw) => grammarFileSchema.parse(raw).points)
    .map((point, i) => ({ point, i }))
    .sort((a, b) => GRAMMAR_LEVELS.indexOf(a.point.level) - GRAMMAR_LEVELS.indexOf(b.point.level) || a.i - b.i)
    .map(({ point }) => point);
  const slugs = new Set<string>();
  for (const s of sources) {
    if (slugs.has(s.slug)) throw new Error(`Punto grammaticale duplicato: ${s.slug}`);
    slugs.add(s.slug);
  }
  await prisma.contentSource.upsert({ where: { key: GRAMMAR_SOURCE.key }, create: GRAMMAR_SOURCE, update: GRAMMAR_SOURCE });
  const index = await loadLinkIndex(prisma);
  const existing = new Map(
    (await prisma.grammarPoint.findMany({ select: { id: true, slug: true, contentVersion: true, position: true } })).map((p) => [p.slug, p]),
  );
  const report: GrammarImportReport = { total: sources.length, created: 0, updated: 0, unchanged: 0 };

  for (const [position, source] of sources.entries()) {
    const linked = linkGrammarPoint(source, index);
    const prev = existing.get(source.slug);
    if (prev && prev.contentVersion === linked.contentVersion && prev.position === position) {
      report.unchanged++;
      continue;
    }
    const data = {
      level: source.level,
      position,
      title: JSON.stringify(linked.title),
      meaning: source.meaning,
      structure: JSON.stringify(linked.structure),
      explanation: source.explanation,
      examples: JSON.stringify(linked.examples),
      contentVersion: linked.contentVersion,
    };
    await prisma.$transaction(async (tx) => {
      const row = prev
        ? await tx.grammarPoint.update({ where: { id: prev.id }, data, select: { id: true } })
        : await tx.grammarPoint.create({ data: { slug: source.slug, ...data }, select: { id: true } });
      for (const [i, e] of linked.exercises.entries()) {
        const exercise = {
          kind: e.kind,
          prompt: JSON.stringify(e.prompt),
          choices: JSON.stringify(e.choices),
          answerIndex: e.answerIndex,
          solution: JSON.stringify(e.solution),
          translation: e.translation,
          explanation: e.explanation,
        };
        await tx.grammarExercise.upsert({
          where: { pointId_position: { pointId: row.id, position: i } },
          create: { pointId: row.id, position: i, ...exercise },
          update: exercise,
        });
      }
      await tx.grammarExercise.deleteMany({ where: { pointId: row.id, position: { gte: linked.exercises.length } } });
    });
    if (prev) report.updated++;
    else report.created++;
  }
  return report;
}
