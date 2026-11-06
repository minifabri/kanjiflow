/**
 * Import idempotente e incrementale del dataset.
 *
 * Garanzie:
 * - i soggetti sono identificati dallo slug stabile → nessun duplicato, progresso preservato;
 * - si sostituiscono solo i contenuti di origine "dictionary"/"generated";
 *   sinonimi, mnemonici e note dell'utente (righe con userId) non vengono mai toccati;
 * - i soggetti assenti dal nuovo dataset non vengono cancellati (il loro storico resta valido).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { datasetSchema, type Dataset } from "@/domain/content/dataset";

export interface ImportReport {
  version: string;
  created: number;
  updated: number;
  unchanged: number;
}

const BATCH = 150;
// Su un database remoto un lotto richiede centinaia di query: il timeout predefinito (5 s) non basta.
const TX_OPTIONS = { timeout: 120_000, maxWait: 30_000 };

export async function importDataset(prisma: PrismaClient, raw: unknown, log: (m: string) => void = () => {}): Promise<ImportReport> {
  const dataset: Dataset = datasetSchema.parse(raw);

  const sourceIds = new Map<string, string>();
  for (const s of dataset.sources) {
    const row = await prisma.contentSource.upsert({
      where: { key: s.key },
      create: { key: s.key, name: s.name, url: s.url, license: s.license, attribution: s.attribution, version: s.version },
      update: { name: s.name, url: s.url, license: s.license, attribution: s.attribution, version: s.version },
    });
    sourceIds.set(s.key, row.id);
  }
  const sourceId = (key: string) => {
    const id = sourceIds.get(key);
    if (!id) throw new Error(`Fonte sconosciuta nel dataset: ${key}`);
    return id;
  };

  const existing = new Map(
    (await prisma.subject.findMany({ select: { id: true, slug: true, contentVersion: true } })).map((s) => [s.slug, s]),
  );
  const report: ImportReport = { version: dataset.version, created: 0, updated: 0, unchanged: 0 };

  // Passo 1: soggetti e contenuti propri.
  for (let i = 0; i < dataset.subjects.length; i += BATCH) {
    const batch = dataset.subjects.slice(i, i + BATCH);
    await prisma.$transaction(async (tx) => {
      for (const s of batch) {
        const prev = existing.get(s.slug);
        if (prev && prev.contentVersion === dataset.version && !process.env.KANJIFLOW_FORCE_IMPORT) {
          report.unchanged++;
          continue;
        }
        const data = {
          type: s.type,
          characters: s.characters,
          primaryMeaning: s.primaryMeaning,
          lessonOrder: s.lessonOrder,
          strokeCount: s.strokeCount,
          frequencyRank: s.frequencyRank,
          partOfSpeech: s.partOfSpeech ? JSON.stringify(s.partOfSpeech) : null,
          contentSourceId: sourceId(s.sourceKey),
          contentVersion: dataset.version,
        };
        const subject = prev
          ? await tx.subject.update({ where: { id: prev.id }, data })
          : await tx.subject.create({ data: { slug: s.slug, ...data } });
        existing.set(s.slug, { id: subject.id, slug: s.slug, contentVersion: dataset.version });
        if (prev) report.updated++;
        else report.created++;

        await tx.subjectMeaning.deleteMany({ where: { subjectId: subject.id, userId: null, origin: { in: ["dictionary", "generated"] } } });
        await tx.subjectMeaning.createMany({
          data: s.meanings.map((m, position) => ({
            subjectId: subject.id,
            language: m.language,
            meaning: m.meaning,
            isPrimary: m.isPrimary,
            isAccepted: true,
            origin: m.origin,
            verified: m.origin === "dictionary",
            position,
          })),
        });
        await tx.subjectReading.deleteMany({ where: { subjectId: subject.id } });
        if (s.readings.length) {
          await tx.subjectReading.createMany({
            data: s.readings.map((r, position) => ({ subjectId: subject.id, ...r, position })),
          });
        }
        await tx.exampleSentence.deleteMany({ where: { subjectId: subject.id } });
        if (s.examples.length) {
          await tx.exampleSentence.createMany({
            data: s.examples.map((e) => ({
              subjectId: subject.id,
              japaneseText: e.japaneseText,
              translatedText: e.translatedText,
              translationLanguage: e.translationLanguage,
              sourceId: sourceId(e.sourceKey),
              externalId: e.externalId,
              verified: e.verified,
            })),
          });
        }
        for (const c of s.classifications) {
          await tx.subjectClassification.upsert({
            where: { subjectId_classificationSystem: { subjectId: subject.id, classificationSystem: c.system } },
            create: {
              subjectId: subject.id,
              classificationSystem: c.system,
              classificationValue: c.value,
              sourceId: sourceId(c.sourceKey),
              confidence: c.confidence,
            },
            update: { classificationValue: c.value, sourceId: sourceId(c.sourceKey), confidence: c.confidence },
          });
        }
      }
    }, TX_OPTIONS);
    log(`  soggetti ${Math.min(i + BATCH, dataset.subjects.length)}/${dataset.subjects.length}`);
  }

  // Passo 2: relazioni tra soggetti (richiede che tutti esistano).
  const touched = dataset.subjects.filter((s) => existing.get(s.slug)?.contentVersion === dataset.version);
  for (let i = 0; i < touched.length; i += BATCH) {
    const batch = touched.slice(i, i + BATCH);
    await prisma.$transaction(async (tx) => {
      for (const s of batch) {
        const parentId = existing.get(s.slug)!.id;
        await tx.subjectComponent.deleteMany({ where: { parentSubjectId: parentId } });
        const comps = [...new Set(s.components)].map((slug) => existing.get(slug)?.id).filter((x): x is string => !!x);
        if (comps.length) {
          await tx.subjectComponent.createMany({
            data: comps.map((componentSubjectId) => ({
              parentSubjectId: parentId,
              componentSubjectId,
              relationshipType: s.type === "kanji" ? "radical_of_kanji" : "kanji_of_vocabulary",
            })),
          });
        }
      }
    }, TX_OPTIONS);
  }

  return report;
}
