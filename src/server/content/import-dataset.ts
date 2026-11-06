/**
 * Import idempotente e incrementale del dataset.
 *
 * Garanzie:
 * - i soggetti sono identificati dallo slug stabile → nessun duplicato, progresso preservato;
 * - si sostituiscono solo i contenuti di origine "dictionary"/"generated" (mnemonici generati inclusi);
 *   sinonimi, mnemonici e note dell'utente (righe con userId) non vengono mai toccati;
 * - i soggetti assenti dal nuovo dataset non vengono cancellati (il loro storico resta valido).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { datasetSchema, type Dataset, type DatasetSubject } from "@/domain/content/dataset";

export interface ImportReport {
  version: string;
  created: number;
  updated: number;
  unchanged: number;
}

// Lotti con poche query ciascuno: il costo è dominato dai viaggi di andata e ritorno verso il database
// (le build Vercel girano negli USA, il database è a Francoforte).
const BATCH = 300;
const TX_OPTIONS = { timeout: 120_000, maxWait: 30_000 };

export async function importDataset(prisma: PrismaClient, raw: unknown, log: (m: string) => void = () => {}): Promise<ImportReport> {
  const dataset: Dataset = datasetSchema.parse(raw);
  const force = !!process.env.KANJIFLOW_FORCE_IMPORT;

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
  const classificationSystems = [...new Set(dataset.subjects.flatMap((s) => s.classifications.map((c) => c.system)))];

  const existing = new Map(
    (await prisma.subject.findMany({ select: { id: true, slug: true, contentVersion: true } })).map((s) => [s.slug, s]),
  );
  const report: ImportReport = { version: dataset.version, created: 0, updated: 0, unchanged: 0 };

  const subjectData = (s: DatasetSubject) => ({
    type: s.type,
    characters: s.characters,
    primaryMeaning: s.primaryMeaning,
    lessonOrder: s.lessonOrder,
    strokeCount: s.strokeCount,
    frequencyRank: s.frequencyRank,
    partOfSpeech: s.partOfSpeech ? JSON.stringify(s.partOfSpeech) : null,
    contentSourceId: sourceId(s.sourceKey),
    contentVersion: dataset.version,
  });

  // Passo 1: soggetti e contenuti propri.
  for (let i = 0; i < dataset.subjects.length; i += BATCH) {
    const batch = dataset.subjects.slice(i, i + BATCH);
    const todo = batch.filter((s) => {
      const prev = existing.get(s.slug);
      return force || !prev || prev.contentVersion !== dataset.version;
    });
    report.unchanged += batch.length - todo.length;
    if (todo.length > 0) {
      await prisma.$transaction(async (tx) => {
        const fresh = todo.filter((s) => !existing.has(s.slug));
        const old = todo.filter((s) => existing.has(s.slug));
        if (fresh.length) {
          const rows = await tx.subject.createManyAndReturn({
            data: fresh.map((s) => ({ slug: s.slug, ...subjectData(s) })),
            select: { id: true, slug: true },
          });
          for (const r of rows) existing.set(r.slug, { id: r.id, slug: r.slug, contentVersion: dataset.version });
        }
        // Gli aggiornamenti servono solo quando cambia la versione del dataset.
        for (const s of old) {
          await tx.subject.update({ where: { id: existing.get(s.slug)!.id }, data: subjectData(s) });
          existing.set(s.slug, { ...existing.get(s.slug)!, contentVersion: dataset.version });
        }
        report.created += fresh.length;
        report.updated += old.length;

        const idOf = (s: DatasetSubject) => existing.get(s.slug)!.id;
        const ids = todo.map(idOf);

        // Solo i contenuti della fonte: le righe dell'utente (userId valorizzato, origin "user") restano intatte.
        await tx.subjectMeaning.deleteMany({ where: { subjectId: { in: ids }, userId: null, origin: { in: ["dictionary", "generated"] } } });
        await tx.subjectMeaning.createMany({
          data: todo.flatMap((s) =>
            s.meanings.map((m, position) => ({
              subjectId: idOf(s),
              language: m.language,
              meaning: m.meaning,
              isPrimary: m.isPrimary,
              isAccepted: true,
              origin: m.origin,
              verified: m.origin === "dictionary",
              position,
            })),
          ),
        });
        await tx.subjectReading.deleteMany({ where: { subjectId: { in: ids } } });
        await tx.subjectReading.createMany({
          data: todo.flatMap((s) => s.readings.map((r, position) => ({ subjectId: idOf(s), ...r, position }))),
        });
        await tx.exampleSentence.deleteMany({ where: { subjectId: { in: ids } } });
        await tx.exampleSentence.createMany({
          data: todo.flatMap((s) =>
            s.examples.map((e) => ({
              subjectId: idOf(s),
              japaneseText: e.japaneseText,
              translatedText: e.translatedText,
              translationLanguage: e.translationLanguage,
              sourceId: sourceId(e.sourceKey),
              externalId: e.externalId,
              verified: e.verified,
            })),
          ),
        });
        // Mnemonici generati: si sostituiscono; quelli dell'utente (userId, sourceType "user") restano intatti.
        await tx.mnemonic.deleteMany({ where: { subjectId: { in: ids }, userId: null, sourceType: "generated" } });
        await tx.mnemonic.createMany({
          data: todo.flatMap((s) =>
            s.mnemonics.map((m) => ({ subjectId: idOf(s), mnemonicType: m.type, language: m.language, content: m.content, sourceType: "generated" })),
          ),
        });
        await tx.subjectClassification.deleteMany({ where: { subjectId: { in: ids }, classificationSystem: { in: classificationSystems } } });
        await tx.subjectClassification.createMany({
          data: todo.flatMap((s) =>
            s.classifications.map((c) => ({
              subjectId: idOf(s),
              classificationSystem: c.system,
              classificationValue: c.value,
              sourceId: sourceId(c.sourceKey),
              confidence: c.confidence,
            })),
          ),
        });
      }, TX_OPTIONS);
    }
    log(`  soggetti ${Math.min(i + BATCH, dataset.subjects.length)}/${dataset.subjects.length}`);
  }

  // Passo 2: relazioni tra soggetti (richiede che tutti esistano). Ricostruite per ogni soggetto alla versione corrente
  // che non ha ancora componenti o che è stato appena importato: un import interrotto si completa da solo.
  const withComponents = new Set(
    (await prisma.subjectComponent.findMany({ distinct: ["parentSubjectId"], select: { parentSubjectId: true } })).map((c) => c.parentSubjectId),
  );
  const touched = dataset.subjects.filter((s) => {
    const e = existing.get(s.slug);
    return e && s.components.length > 0 && (force || report.created + report.updated > 0 || !withComponents.has(e.id));
  });
  for (let i = 0; i < touched.length; i += BATCH) {
    const batch = touched.slice(i, i + BATCH);
    await prisma.$transaction(async (tx) => {
      const ids = batch.map((s) => existing.get(s.slug)!.id);
      await tx.subjectComponent.deleteMany({ where: { parentSubjectId: { in: ids } } });
      await tx.subjectComponent.createMany({
        data: batch.flatMap((s) => {
          const parentSubjectId = existing.get(s.slug)!.id;
          return [...new Set(s.components)]
            .map((slug) => existing.get(slug)?.id)
            .filter((x): x is string => !!x)
            .map((componentSubjectId) => ({
              parentSubjectId,
              componentSubjectId,
              relationshipType: s.type === "kanji" ? "radical_of_kanji" : "kanji_of_vocabulary",
            }));
        }),
      });
    }, TX_OPTIONS);
  }

  return report;
}
