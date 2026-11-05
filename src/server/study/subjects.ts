import "server-only";
import { prisma } from "@/server/db";
import type { SubjectType } from "@/domain/content/dataset";
import type { ReadingType } from "@/domain/answers";

export interface MeaningDTO {
  meaning: string;
  language: string;
  isPrimary: boolean;
  isAccepted: boolean;
  origin: string;
}
export interface ReadingDTO {
  reading: string;
  readingType: ReadingType;
  isPrimary: boolean;
  isAccepted: boolean;
}
export interface ComponentDTO {
  id: string;
  type: SubjectType;
  characters: string;
  primaryMeaning: string;
}
export interface ExampleDTO {
  japaneseText: string;
  translatedText: string;
  translationLanguage: string;
  verified: boolean;
  sourceName: string;
}
export interface SubjectCardDTO {
  id: string;
  slug: string;
  type: SubjectType;
  characters: string;
  primaryMeaning: string;
  meanings: MeaningDTO[];
  readings: ReadingDTO[];
  partOfSpeech: string[];
  strokeCount: number | null;
  frequencyRank: number | null;
  jlpt: string | null;
  components: ComponentDTO[];
  usedIn: ComponentDTO[];
  examples: ExampleDTO[];
  mnemonics: { type: string; content: string; sourceType: string; isUser: boolean }[];
  note: string | null;
}

/** Carica soggetti completi per lezioni, ripassi e scheda dettaglio, inclusi i dati personali dell'utente. */
export async function loadSubjectCards(ids: string[], userId: string, opts: { usedInLimit?: number } = {}): Promise<SubjectCardDTO[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.subject.findMany({
    where: { id: { in: ids } },
    include: {
      meanings: { where: { OR: [{ userId: null }, { userId }] }, orderBy: { position: "asc" } },
      readings: { orderBy: { position: "asc" } },
      classifications: true,
      components: { include: { component: { select: { id: true, type: true, characters: true, primaryMeaning: true } } } },
      usedIn: {
        take: opts.usedInLimit ?? 12,
        include: { parent: { select: { id: true, type: true, characters: true, primaryMeaning: true, lessonOrder: true } } },
      },
      examples: { include: { source: { select: { name: true } } } },
      mnemonics: { where: { OR: [{ userId: null }, { userId }] } },
      notes: { where: { userId } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => {
      const jlpt =
        r.classifications.find((c) => c.classificationSystem === "jlpt-waller")?.classificationValue ??
        r.classifications.find((c) => c.classificationSystem === "jlpt-open-anki")?.classificationValue ??
        null;
      return {
        id: r.id,
        slug: r.slug,
        type: r.type as SubjectType,
        characters: r.characters,
        primaryMeaning: r.primaryMeaning,
        meanings: r.meanings.map((m) => ({
          meaning: m.meaning,
          language: m.language,
          isPrimary: m.isPrimary,
          isAccepted: m.isAccepted,
          origin: m.origin,
        })),
        readings: r.readings.map((x) => ({
          reading: x.reading,
          readingType: x.readingType as ReadingType,
          isPrimary: x.isPrimary,
          isAccepted: x.isAccepted,
        })),
        partOfSpeech: r.partOfSpeech ? (JSON.parse(r.partOfSpeech) as string[]) : [],
        strokeCount: r.strokeCount,
        frequencyRank: r.frequencyRank,
        jlpt,
        components: r.components.map((c) => ({ ...c.component, type: c.component.type as SubjectType })),
        usedIn: r.usedIn
          .map((u) => u.parent)
          .sort((a, b) => a.lessonOrder - b.lessonOrder)
          .map(({ lessonOrder: _lo, ...p }) => ({ ...p, type: p.type as SubjectType })),
        examples: r.examples.map((e) => ({
          japaneseText: e.japaneseText,
          translatedText: e.translatedText,
          translationLanguage: e.translationLanguage,
          verified: e.verified,
          sourceName: e.source.name,
        })),
        mnemonics: r.mnemonics.map((m) => ({ type: m.mnemonicType, content: m.content, sourceType: m.sourceType, isUser: !!m.userId })),
        note: r.notes[0]?.content ?? null,
      };
    });
}

/** Significati normalizzati di tutti i soggetti (per la protezione semantica dei refusi). */
let meaningIndexCache: { at: number; set: Map<string, Set<string>> } | null = null;
export async function meaningIndex(): Promise<Map<string, Set<string>>> {
  if (meaningIndexCache && Date.now() - meaningIndexCache.at < 10 * 60_000) return meaningIndexCache.set;
  const rows = await prisma.subjectMeaning.findMany({ where: { isAccepted: true }, select: { subjectId: true, meaning: true } });
  const { normalizeMeaning } = await import("@/domain/answers");
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const n = normalizeMeaning(r.meaning);
    const set = map.get(n) ?? new Set<string>();
    set.add(r.subjectId);
    map.set(n, set);
  }
  meaningIndexCache = { at: Date.now(), set: map };
  return map;
}

export function invalidateMeaningIndex() {
  meaningIndexCache = null;
}
