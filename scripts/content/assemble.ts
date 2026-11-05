/**
 * Combina data/build/base.json con i file curati italiani (data/curated/it/*.tsv)
 * e produce il dataset versionato data/dataset/kanjiflow-n5-n3.json (validato).
 *
 * Uso: npm run content:assemble
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { datasetSchema, type Dataset, type DatasetSubject } from "../../src/domain/content/dataset";
import { BUILD_DIR, CURATED_DIR, DATA_DIR, loadSources, readJson } from "./paths";
import type { BaseKanji, BaseRadical, BaseVocab } from "./build-base";

function readTsv(file: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of readFileSync(path.join(CURATED_DIR, "it", file), "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cols = line.split("\t");
    const key = cols[0]!;
    if (map.has(key)) throw new Error(`${file}: chiave duplicata ${key}`);
    map.set(key, cols.slice(1));
  }
  return map;
}

const splitMeanings = (s: string | undefined) =>
  (s ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

function meanings(it: string[], en: string[]): DatasetSubject["meanings"] {
  if (it.length === 0) throw new Error("significato italiano mancante");
  const seen = new Set<string>();
  const out: DatasetSubject["meanings"] = [];
  it.forEach((m, i) => {
    const k = `it:${m.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ language: "it", meaning: m, isPrimary: i === 0, origin: "generated" });
  });
  for (const m of en) {
    const k = `en:${m.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ language: "en", meaning: m, isPrimary: false, origin: "dictionary" });
  }
  return out;
}

function main() {
  const base = readJson<{ kanji: BaseKanji[]; radicals: BaseRadical[]; vocab: BaseVocab[] }>(
    path.join(BUILD_DIR, "base.json"),
  );
  const itKanji = readTsv("kanji.tsv");
  const itRad = readTsv("radicals.tsv");
  const itVocab = readTsv("vocab.tsv");
  const sources = loadSources();
  const generated = sources.find((s) => s.key === "kanjiflow-generated")!;

  const subjects: DatasetSubject[] = [];

  for (const r of base.radicals) {
    const row = itRad.get(r.char);
    if (!row) throw new Error(`Radicale senza nome italiano: ${r.char}`);
    const [display, names] = row;
    const it = splitMeanings(names);
    subjects.push({
      slug: `radical:${r.char}`,
      type: "radical",
      characters: display || r.char,
      primaryMeaning: it[0]!,
      lessonOrder: r.lessonOrder,
      strokeCount: null,
      frequencyRank: null,
      partOfSpeech: null,
      sourceKey: "kradfile",
      meanings: meanings(it, []),
      readings: [],
      components: [],
      classifications: [],
      examples: [],
    });
  }

  for (const k of base.kanji) {
    const it = splitMeanings(itKanji.get(k.char)?.[0]);
    if (it.length === 0) throw new Error(`Kanji senza significato italiano: ${k.char}`);
    const primary = new Set(k.primaryReadings);
    subjects.push({
      slug: `kanji:${k.char}`,
      type: "kanji",
      characters: k.char,
      primaryMeaning: it[0]!,
      lessonOrder: k.lessonOrder,
      strokeCount: k.strokes,
      frequencyRank: k.frequency,
      partOfSpeech: null,
      sourceKey: "kanjidic2",
      meanings: meanings(it, k.meaningsEn),
      readings: [
        ...k.onyomi.map((r) => ({ reading: r, readingType: "onyomi" as const, isPrimary: primary.has(r), isAccepted: true })),
        ...k.kunyomi.map((r) => ({ reading: r, readingType: "kunyomi" as const, isPrimary: primary.has(r), isAccepted: true })),
      ],
      components: k.components.map((c) => `radical:${c}`),
      classifications: [
        { system: "jlpt-waller", value: k.jlpt, sourceKey: "jlpt-kanji-waller", confidence: "community" },
        ...(k.jlptOld ? [{ system: "jlpt-old", value: String(k.jlptOld), sourceKey: "kanjidic2", confidence: "official" as const }] : []),
        ...(k.grade ? [{ system: "jouyou-grade", value: String(k.grade), sourceKey: "kanjidic2", confidence: "official" as const }] : []),
      ],
      examples: [],
    });
  }

  for (const v of base.vocab) {
    const key = v.slug.slice("vocab:".length);
    const it = splitMeanings(itVocab.get(key)?.[0]);
    if (it.length === 0) throw new Error(`Vocabolo senza significato italiano: ${key}`);
    const en = v.glossesEn.length > 0 ? v.glossesEn : v.listGlossEn.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    subjects.push({
      slug: v.slug,
      type: "vocabulary",
      characters: v.written,
      primaryMeaning: it[0]!,
      lessonOrder: v.lessonOrder,
      strokeCount: null,
      frequencyRank: null,
      partOfSpeech: v.partOfSpeech.length ? v.partOfSpeech : null,
      sourceKey: v.jmdictId ? "jmdict" : "jlpt-vocab-open-anki",
      meanings: meanings(it, en),
      readings: v.readings.map((r, i) => ({ reading: r, readingType: "vocabulary" as const, isPrimary: i === 0, isAccepted: true })),
      components: v.kanji.map((c) => `kanji:${c}`),
      classifications: [{ system: "jlpt-open-anki", value: v.jlpt, sourceKey: "jlpt-vocab-open-anki", confidence: "community" }],
      examples: v.examples.map((e) => ({
        japaneseText: e.ja,
        translatedText: e.en,
        translationLanguage: "en" as const,
        sourceKey: "jmdict-examples",
        externalId: e.tatoebaId,
        verified: true, // traduzione inglese della fonte Tatoeba, non generata
      })),
    });
  }

  const dataset: Dataset = datasetSchema.parse({
    format: "kanjiflow-dataset/1",
    version: generated.version,
    sources: sources.map(({ key, name, url, license, attribution, version }) => ({ key, name, url, license, attribution, version })),
    subjects,
  });

  const slugs = new Set(dataset.subjects.map((s) => s.slug));
  for (const s of dataset.subjects) for (const c of s.components) if (!slugs.has(c)) throw new Error(`${s.slug}: componente ${c} assente`);

  const outDir = path.join(DATA_DIR, "dataset");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "kanjiflow-n5-n3.json");
  writeFileSync(out, JSON.stringify(dataset));
  const count = (t: string) => dataset.subjects.filter((s) => s.type === t).length;
  console.log(`✓ ${path.relative(process.cwd(), out)} — v${dataset.version}: ${count("radical")} radicali, ${count("kanji")} kanji, ${count("vocabulary")} vocaboli`);
}

main();
