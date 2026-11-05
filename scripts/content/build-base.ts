/**
 * Costruisce data/build/base.json a partire dalle fonti grezze (data/raw).
 * Riproducibile: stesso input → stesso output (ordinamenti stabili, nessun timestamp variabile nei dati).
 *
 * Contenuto:
 * - kanji N5–N3 (classificazione non ufficiale Waller), con significati inglesi, letture, tratti, frequenza;
 * - componenti grafici (KRADFILE) usati da quei kanji → soggetti "radicale";
 * - vocaboli N5–N3 (Open Anki) composti solo da kanji presenti nel set, abbinati a JMdict;
 * - frasi d'esempio Tatoeba collegate a JMdict (traduzione inglese verificata dalla fonte).
 *
 * Uso: npm run content:build
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BUILD_DIR, RAW_DIR, rawJson, readJson } from "./paths";
import { katakanaToHiragana } from "../../src/domain/answers/kana";

type Jlpt = "N5" | "N4" | "N3";
const LEVELS: Jlpt[] = ["N5", "N4", "N3"];

// ---------- tipi delle fonti ----------
interface Kd2Char {
  literal: string;
  misc: { grade: number | null; strokeCounts: number[]; frequency: number | null; jlptLevel: number | null };
  readingMeaning: {
    groups: Array<{ readings: Array<{ type: string; value: string }>; meanings: Array<{ lang: string; value: string }> }>;
    nanori: string[];
  } | null;
}
interface JmWord {
  id: string;
  kanji: Array<{ text: string; common: boolean }>;
  kana: Array<{ text: string; common: boolean; appliesToKanji: string[] }>;
  sense: Array<{
    partOfSpeech: string[];
    appliesToKanji: string[];
    appliesToKana: string[];
    misc: string[];
    info: string[];
    gloss: Array<{ lang: string; text: string }>;
    examples?: Array<{ source: { type: string; value: string }; text: string; sentences: Array<{ lang: string; text: string }> }>;
  }>;
}

// ---------- tipi di output ----------
export interface BaseKanji {
  char: string;
  jlpt: Jlpt;
  jlptOld: number | null;
  grade: number | null;
  strokes: number | null;
  frequency: number | null;
  meaningsEn: string[];
  onyomi: string[]; // hiragana
  kunyomi: string[]; // hiragana con "." e "-" di KANJIDIC
  nanori: string[];
  primaryType: "onyomi" | "kunyomi";
  primaryReadings: string[];
  components: string[];
  lessonOrder: number;
}
export interface BaseRadical {
  char: string;
  usedBy: string[];
  lessonOrder: number;
}
export interface BaseExample {
  ja: string;
  en: string;
  tatoebaId: string;
}
export interface BaseVocab {
  slug: string;
  written: string;
  readings: string[];
  jlpt: Jlpt;
  glossesEn: string[];
  listGlossEn: string;
  partOfSpeech: string[];
  kanji: string[];
  jmdictId: string | null;
  examples: BaseExample[];
  lessonOrder: number;
}

const isKanji = (c: string) => /[一-鿿㐀-䶿]/u.test(c);

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ""])));
}

function main() {
  // ---- kanji set (solo campo jlpt_new) ----
  const kanjiData = readJson<Record<string, { jlpt_new: number | null }>>(path.join(RAW_DIR, "kanji-data.json"));
  const jlptOf = new Map<string, Jlpt>();
  for (const [ch, v] of Object.entries(kanjiData)) {
    if (v.jlpt_new === 5 || v.jlpt_new === 4 || v.jlpt_new === 3) jlptOf.set(ch, `N${v.jlpt_new}` as Jlpt);
  }

  // ---- KANJIDIC2 ----
  const kd2 = rawJson<{ characters: Kd2Char[] }>("kanjidic2-en");
  const kd2By = new Map(kd2.characters.map((c) => [c.literal, c]));

  // ---- KRADFILE ----
  const krad = rawJson<{ kanji: Record<string, string[]> }>("kradfile").kanji;

  // ---- JMdict comune ----
  const jm = rawJson<{ words: JmWord[] }>("jmdict-eng-common").words;
  const jmByKanji = new Map<string, JmWord[]>();
  for (const w of jm) for (const k of w.kanji) jmByKanji.set(k.text, [...(jmByKanji.get(k.text) ?? []), w]);

  // ---- Vocabolario JLPT ----
  const vocabRaw: Array<{ written: string; readings: string[]; listGloss: string; jlpt: Jlpt }> = [];
  const seen = new Set<string>();
  for (const lvl of LEVELS) {
    const rows = parseCsv(readFileSync(path.join(RAW_DIR, `vocab-${lvl.toLowerCase()}.csv`), "utf8"));
    for (const r of rows) {
      const written = (r.expression ?? "").split(/[;；、,，]/)[0]!.replace(/[～〜~]/g, "").trim();
      const readings = (r.reading ?? "")
        .split(/[;；、,，]/)
        .map((x) => katakanaToHiragana(x.replace(/[～〜~]/g, "").replace(/[(（][^)）]*[)）]/g, "").replace(/\s+/g, "").trim()))
        // Le liste aggiungono "する" alla lettura dei sostantivi verbali: la forma scritta non lo contiene.
        .map((x) => (x.endsWith("する") && !written.endsWith("する") ? x.slice(0, -2) : x))
        .filter(Boolean);
      if (!written || readings.length === 0) continue;
      const chars = [...written].filter(isKanji);
      if (chars.length === 0) continue; // solo kana: escluso da questa versione
      if (!chars.every((c) => jlptOf.has(c))) continue; // contiene kanji fuori da N5–N3
      const key = `${written}:${readings[0]}`;
      if (seen.has(key)) continue; // il livello più basso vince
      seen.add(key);
      vocabRaw.push({ written, readings, listGloss: r.meaning ?? "", jlpt: lvl });
    }
  }

  // ---- Esempi Tatoeba (indicizzati per forma scritta) ----
  const exWords = rawJson<{ words: JmWord[] }>("jmdict-examples-eng").words;
  const neededWritten = new Set(vocabRaw.map((v) => v.written));
  const examplesBy = new Map<string, BaseExample[]>();
  for (const w of exWords) {
    for (const s of w.sense) {
      for (const ex of s.examples ?? []) {
        if (!neededWritten.has(ex.text) || ex.source.type !== "tatoeba") continue;
        const ja = ex.sentences.find((x) => x.lang === "jpn")?.text;
        const en = ex.sentences.find((x) => x.lang === "eng")?.text;
        if (!ja || !en || !ja.includes(ex.text)) continue;
        const list = examplesBy.get(ex.text) ?? [];
        if (!list.some((e) => e.tatoebaId === ex.source.value)) list.push({ ja, en, tatoebaId: ex.source.value });
        examplesBy.set(ex.text, list);
      }
    }
  }

  // ---- Vocaboli abbinati a JMdict ----
  const vocab: BaseVocab[] = vocabRaw.map((v) => {
    const candidates = jmByKanji.get(v.written) ?? [];
    const match =
      candidates.find((w) => w.kana.some((k) => katakanaToHiragana(k.text) === v.readings[0])) ?? candidates[0] ?? null;
    let glosses: string[] = [];
    let pos: string[] = [];
    let readings = v.readings;
    if (match) {
      const senses = match.sense.filter(
        (s) =>
          (s.appliesToKanji.includes("*") || s.appliesToKanji.includes(v.written)) &&
          (s.appliesToKana.includes("*") || s.appliesToKana.some((k) => katakanaToHiragana(k) === v.readings[0])),
      );
      glosses = senses.slice(0, 3).flatMap((s) => s.gloss.filter((g) => g.lang === "eng").map((g) => g.text));
      pos = [...new Set(senses.flatMap((s) => s.partOfSpeech))];
      const jmReadings = match.kana
        .filter((k) => k.appliesToKanji.includes("*") || k.appliesToKanji.includes(v.written))
        .filter((k) => k.common)
        .map((k) => katakanaToHiragana(k.text));
      readings = [...new Set([...v.readings, ...jmReadings.filter((r) => v.readings.includes(r))])];
    }
    const examples = (examplesBy.get(v.written) ?? [])
      .sort((a, b) => [...a.ja].length - [...b.ja].length || a.tatoebaId.localeCompare(b.tatoebaId))
      .slice(0, 3);
    return {
      slug: `vocab:${v.written}:${v.readings[0]}`,
      written: v.written,
      readings,
      jlpt: v.jlpt,
      glossesEn: [...new Set(glosses)].slice(0, 8),
      listGlossEn: v.listGloss,
      partOfSpeech: pos,
      kanji: [...new Set([...v.written].filter(isKanji))],
      jmdictId: match?.id ?? null,
      examples,
      lessonOrder: 0,
    };
  });

  // ---- Kanji ----
  const kanji: BaseKanji[] = [];
  for (const [ch, jlpt] of jlptOf) {
    const c = kd2By.get(ch);
    if (!c || !c.readingMeaning) {
      console.warn(`! ${ch} assente in KANJIDIC2, saltato`);
      continue;
    }
    const groups = c.readingMeaning.groups;
    const onyomi = [...new Set(groups.flatMap((g) => g.readings.filter((r) => r.type === "ja_on").map((r) => katakanaToHiragana(r.value))))];
    const kunyomi = [...new Set(groups.flatMap((g) => g.readings.filter((r) => r.type === "ja_kun").map((r) => r.value)))];
    const meaningsEn = [...new Set(groups.flatMap((g) => g.meanings.filter((m) => m.lang === "en").map((m) => m.value)))];

    // Lettura primaria: il tipo (on/kun) più frequente nel vocabolario JLPT che contiene il kanji.
    const usage = { onyomi: new Map<string, number>(), kunyomi: new Map<string, number>() };
    // Ogni vocabolo conta al massimo una volta per tipo; per il kun si verifica anche l'okurigana scritto.
    const typeVotes = { onyomi: 0, kunyomi: 0 };
    for (const v of vocab.filter((x) => x.kanji.includes(ch))) {
      const r = v.readings[0]!;
      const onHits = onyomi.filter((on) => on && r.includes(on.replace(/-/g, "")));
      const after = v.written.startsWith(ch) ? v.written.slice(ch.length) : null;
      const kunHits =
        after === null
          ? []
          : kunyomi.filter((kun) => {
              const [stem = "", okuri = ""] = katakanaToHiragana(kun).replace(/-/g, "").split(".");
              if (!stem || !r.startsWith(stem)) return false;
              return okuri ? after.startsWith(okuri) && r.startsWith(stem + okuri) : after.length === 0 || isKanji(after[0]!);
            });
      // Se entrambe le interpretazioni sono possibili, la più lunga è la più plausibile.
      const bestOn = Math.max(0, ...onHits.map((x) => x.length));
      const bestKun = Math.max(0, ...kunHits.map((x) => x.replace(/[.-]/g, "").length));
      if (bestKun > bestOn) {
        typeVotes.kunyomi++;
        for (const k of kunHits) usage.kunyomi.set(k, (usage.kunyomi.get(k) ?? 0) + 1);
      } else if (bestOn > 0) {
        typeVotes.onyomi++;
        for (const o of onHits) usage.onyomi.set(o, (usage.onyomi.get(o) ?? 0) + 1);
      }
    }
    let primaryType: "onyomi" | "kunyomi" =
      typeVotes.kunyomi > typeVotes.onyomi ? "kunyomi" : onyomi.length > 0 ? "onyomi" : "kunyomi";
    if (primaryType === "onyomi" && onyomi.length === 0) primaryType = "kunyomi";
    if (primaryType === "kunyomi" && kunyomi.length === 0) primaryType = "onyomi";
    const used = [...usage[primaryType].entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    const pool = primaryType === "onyomi" ? onyomi : kunyomi;
    // Al massimo due letture primarie, e mai due grafie della stessa parola (う.まれる / うま.れる).
    const primaryReadings: string[] = [];
    const candidates = (used.length > 0 ? used : pool.slice(0, 1)).map((r) => {
      // Preferisce la forma autonoma ("で.る") a quella da affisso ("-で").
      if (!r.startsWith("-") && !r.endsWith("-")) return r;
      const plain = r.replace(/-/g, "");
      return pool.find((x) => !x.includes("-") && x.replace(/\./g, "").startsWith(plain.replace(/\./g, ""))) ?? r;
    });
    for (const r of candidates) {
      const full = r.replace(/[.-]/g, "");
      const stem = r.replace(/-/g, "").split(".")[0];
      if (primaryReadings.some((p) => p.replace(/[.-]/g, "") === full)) continue;
      if (r.includes("-") && candidates.some((c) => !c.includes("-") && c.split(".")[0] === stem)) continue;
      if (primaryReadings.length < 2) primaryReadings.push(r);
    }

    kanji.push({
      char: ch,
      jlpt,
      jlptOld: c.misc.jlptLevel,
      grade: c.misc.grade,
      strokes: c.misc.strokeCounts[0] ?? null,
      frequency: c.misc.frequency,
      meaningsEn,
      onyomi,
      kunyomi,
      nanori: c.readingMeaning.nanori,
      primaryType,
      primaryReadings,
      components: (krad[ch] ?? []).filter((x) => x !== ch),
      lessonOrder: 0,
    });
  }

  // ---- Ordine di base: livello JLPT, poi frequenza ----
  const lvlRank = (j: Jlpt) => LEVELS.indexOf(j);
  kanji.sort(
    (a, b) => lvlRank(a.jlpt) - lvlRank(b.jlpt) || (a.frequency ?? 9999) - (b.frequency ?? 9999) || a.char.localeCompare(b.char),
  );
  const radicalsMap = new Map<string, BaseRadical>();
  let order = 0;
  const kanjiOrder = new Map<string, number>();
  for (const k of kanji) {
    for (const comp of k.components) {
      const r = radicalsMap.get(comp);
      if (r) r.usedBy.push(k.char);
      else radicalsMap.set(comp, { char: comp, usedBy: [k.char], lessonOrder: (order += 1) });
    }
    k.lessonOrder = order += 1;
    kanjiOrder.set(k.char, k.lessonOrder);
  }
  for (const v of vocab) v.lessonOrder = Math.max(...v.kanji.map((c) => kanjiOrder.get(c) ?? 0)) * 10 + 5;
  for (const k of kanji) k.lessonOrder *= 10;
  for (const r of radicalsMap.values()) r.lessonOrder *= 10;
  vocab.sort((a, b) => a.lessonOrder - b.lessonOrder || lvlRank(a.jlpt) - lvlRank(b.jlpt) || a.slug.localeCompare(b.slug));

  const radicals = [...radicalsMap.values()].sort((a, b) => a.lessonOrder - b.lessonOrder);

  mkdirSync(BUILD_DIR, { recursive: true });
  writeFileSync(path.join(BUILD_DIR, "base.json"), JSON.stringify({ kanji, radicals, vocab }, null, 1));
  const byLvl = (xs: Array<{ jlpt: Jlpt }>) => LEVELS.map((l) => `${l}:${xs.filter((x) => x.jlpt === l).length}`).join(" ");
  console.log(`kanji ${kanji.length} (${byLvl(kanji)}) · radicali ${radicals.length} · vocaboli ${vocab.length} (${byLvl(vocab)})`);
  console.log(`vocaboli senza JMdict: ${vocab.filter((v) => !v.jmdictId).length} · con esempi: ${vocab.filter((v) => v.examples.length).length}`);
}

main();
