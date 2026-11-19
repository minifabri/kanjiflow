/**
 * Import idempotente dei testi con spazi vuoti (data/curated/grammar-texts/*.json).
 * Va eseguito dopo l'import dei punti grammaticali: ogni spazio può rimandare a un punto per slug.
 *
 * - i testi sono identificati dallo slug e gli spazi dalla posizione: tentativi e storico restano collegati;
 * - testo, titolo e risposte usano il markup dei brani e vengono collegati ai kanji (furigana adattivo);
 * - un testo il cui contenuto non è cambiato non viene riscritto;
 * - i testi non più presenti nei file restano nel database.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { GRAMMAR_LEVELS } from "@/domain/grammar/content";
import { grammarTextFileSchema, type GrammarTextSource } from "@/domain/grammar/text";
import { linkSegments, type LinkIndex } from "@/domain/reading/linking";
import { MarkupError, parseMarkup, type Segment } from "@/domain/reading/markup";
import { loadLinkIndex } from "./import-reading";

export interface GrammarTextImportReport {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface LinkedGrammarText {
  title: Segment[];
  paragraphs: Segment[][];
  blanks: { point: string | null; choices: Segment[][]; answerIndex: number; explanation: string }[];
  contentVersion: string;
}

export function linkGrammarText(source: GrammarTextSource, index: LinkIndex): LinkedGrammarText {
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
  const blanks = source.blanks.map((b) => ({
    point: b.point,
    choices: b.choices.map(link),
    answerIndex: b.answer,
    explanation: b.explanation,
  }));
  const contentVersion = createHash("sha256")
    .update(JSON.stringify([source.level, source.titleIt, title, paragraphs, source.translation, blanks]))
    .digest("hex")
    .slice(0, 16);
  return { title, paragraphs, blanks, contentVersion };
}

export async function importGrammarTexts(prisma: PrismaClient, rawFiles: unknown[]): Promise<GrammarTextImportReport> {
  // Ordine di studio: prima il livello più facile, poi l'ordine in cui i testi compaiono nei file.
  const sources = rawFiles
    .flatMap((raw) => grammarTextFileSchema.parse(raw).texts)
    .map((text, i) => ({ text, i }))
    .sort((a, b) => GRAMMAR_LEVELS.indexOf(a.text.level) - GRAMMAR_LEVELS.indexOf(b.text.level) || a.i - b.i)
    .map(({ text }) => text);
  const slugs = new Set<string>();
  for (const s of sources) {
    if (slugs.has(s.slug)) throw new Error(`Testo duplicato: ${s.slug}`);
    slugs.add(s.slug);
  }
  const index = await loadLinkIndex(prisma);
  const pointIds = new Map((await prisma.grammarPoint.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]));
  const existing = new Map(
    (await prisma.grammarText.findMany({ select: { id: true, slug: true, contentVersion: true, position: true } })).map((t) => [t.slug, t]),
  );
  const report: GrammarTextImportReport = { total: sources.length, created: 0, updated: 0, unchanged: 0 };

  for (const [position, source] of sources.entries()) {
    const linked = linkGrammarText(source, index);
    const resolvePoint = (slug: string | null) => {
      if (slug === null) return null;
      const id = pointIds.get(slug);
      if (!id) throw new Error(`${source.slug}: punto grammaticale sconosciuto "${slug}"`);
      return id;
    };
    const blankRows = linked.blanks.map((b, i) => ({
      position: i,
      pointId: resolvePoint(b.point),
      choices: JSON.stringify(b.choices),
      answerIndex: b.answerIndex,
      explanation: b.explanation,
    }));
    const prev = existing.get(source.slug);
    if (prev && prev.contentVersion === linked.contentVersion && prev.position === position) {
      report.unchanged++;
      continue;
    }
    const data = {
      level: source.level,
      position,
      title: JSON.stringify(linked.title),
      titleIt: source.titleIt,
      content: JSON.stringify(linked.paragraphs),
      translation: JSON.stringify(source.translation),
      contentVersion: linked.contentVersion,
    };
    await prisma.$transaction(async (tx) => {
      const row = prev
        ? await tx.grammarText.update({ where: { id: prev.id }, data, select: { id: true } })
        : await tx.grammarText.create({ data: { slug: source.slug, ...data }, select: { id: true } });
      for (const b of blankRows) {
        const { position: p, ...rest } = b;
        await tx.grammarTextBlank.upsert({
          where: { textId_position: { textId: row.id, position: p } },
          create: { textId: row.id, position: p, ...rest },
          update: rest,
        });
      }
      await tx.grammarTextBlank.deleteMany({ where: { textId: row.id, position: { gte: blankRows.length } } });
    });
    if (prev) report.updated++;
    else report.created++;
  }
  return report;
}
