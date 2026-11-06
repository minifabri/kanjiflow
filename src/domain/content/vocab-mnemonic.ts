/**
 * Spiegazioni generate per i vocaboli: da quali kanji sono composti (significato) e da quali letture
 * deriva la pronuncia (lettura). Solo affermazioni verificabili dai dati: se la lettura non si ricava
 * dalle letture di dizionario, lo si dice invece di inventare un legame.
 * Markup: **grassetto**, reso dall'interfaccia.
 */
import { segmentReading, type KanjiReadings, type Segment, type SoundChange } from "./reading-segmentation";

export interface MnemonicKanji extends KanjiReadings {
  meaning: string; // significato italiano primario
  primaryReadings: string[];
}

export interface VocabMnemonics {
  meaning: string;
  reading: string;
}

const q = (s: string) => `«${s}»`;
const isKanji = (c: string) => /[㐀-鿿豈-﫿々]/.test(c);

const TYPE_IT = { onyomi: "on'yomi", kunyomi: "kun'yomi" } as const;

function changeNotes(seg: Extract<Segment, { kind: "kanji" }>): string[] {
  const parts: string[] = [];
  const has = (c: SoundChange) => seg.changes.includes(c);
  if (has("okurigana")) parts.push("include l'okurigana, che qui non è scritta");
  if (has("rendaku")) parts.push("rendaku: la consonante iniziale diventa sonora");
  if (has("handakuten")) parts.push("dopo っ o ん la h diventa p");
  if (has("sokuon")) parts.push("l'ultima sillaba diventa っ davanti alla consonante che segue");
  return parts;
}

function describeSegment(seg: Extract<Segment, { kind: "kanji" }>, kanji: Map<string, MnemonicKanji>): string {
  if (!seg.base || !seg.readingType) return `${seg.text} **${seg.reading}** (kanji non presente nel corso)`;
  const label = seg.repeat ? "々 (ripete il kanji precedente)" : seg.text;
  const k = kanji.get(seg.text);
  const notes: string[] = [TYPE_IT[seg.readingType]];
  if (!seg.repeat && k?.primaryReadings.includes(seg.base)) notes.push("lettura studiata");
  const stemOnly = seg.changes.length === 0 && seg.base !== seg.reading && seg.base.startsWith(seg.reading);
  if (stemOnly) {
    // Kun'yomi con okurigana scritta in kana: 食べる → 食 た + べる.
    notes[0] = `${TYPE_IT[seg.readingType]} ${seg.base}, di cui ${seg.base.slice(seg.reading.length)} è l'okurigana scritta in kana`;
    return `${label} **${seg.reading}** (${notes.join(", ")})`;
  }
  notes.push(...changeNotes(seg));
  return seg.reading === seg.base
    ? `${label} **${seg.reading}** (${notes.join(", ")})`
    : `${label} ${seg.base} → **${seg.reading}** (${notes.join("; ")})`;
}

function readingStyle(kanjiSegs: Extract<Segment, { kind: "kanji" }>[]): string {
  const types = kanjiSegs.map((s) => s.readingType);
  if (types.some((t) => t === null) || kanjiSegs.length < 2) return "";
  if (types.every((t) => t === "onyomi")) return " Tutte letture on'yomi: è il caso tipico dei composti di origine cinese.";
  if (types.every((t) => t === "kunyomi")) return " Tutte letture kun'yomi: è il caso tipico delle parole di origine giapponese.";
  if (kanjiSegs.length === 2) {
    return types[0] === "onyomi"
      ? " Lettura mista on'yomi + kun'yomi (detta 重箱読み, jūbako-yomi)."
      : " Lettura mista kun'yomi + on'yomi (detta 湯桶読み, yutō-yomi).";
  }
  return " Letture miste on'yomi e kun'yomi.";
}

export function vocabMnemonics(written: string, reading: string, meaning: string, kanji: Map<string, MnemonicKanji>): VocabMnemonics {
  const chars = [...written];
  const kanjiChars = chars.filter((c) => isKanji(c) && c !== "々");
  const okurigana = chars.filter((c) => !isKanji(c)).join("");
  const known = kanjiChars.filter((c) => kanji.has(c));

  // Significato
  let meaningText: string;
  const part = (c: string) => (kanji.has(c) ? `**${c}** ${q(kanji.get(c)!.meaning)}` : `**${c}**`);
  if (kanjiChars.length === 1 && known.length === 1) {
    const k = kanji.get(kanjiChars[0]!)!;
    const same = k.meaning.toLowerCase() === meaning.toLowerCase();
    if (okurigana) {
      meaningText = `${part(kanjiChars[0]!)} con il kana ${okurigana} forma la parola ${q(meaning)}.`;
    } else if (same) {
      meaningText = `Il kanji ${part(kanjiChars[0]!)} da solo è già la parola: stesso significato.`;
    } else {
      meaningText = `Il kanji ${part(kanjiChars[0]!)} usato da solo come parola significa ${q(meaning)}.`;
    }
  } else if (kanjiChars.length > 1) {
    meaningText = `${kanjiChars.map(part).join(" + ")} → **${meaning}**.`;
  } else {
    meaningText = `Parola scritta ${written}: ${q(meaning)}.`;
  }

  // Lettura
  const seg = segmentReading(written, reading, kanji);
  let readingText: string;
  if (!seg) {
    readingText =
      `**${reading}** non si ottiene dalle letture di dizionario dei singoli kanji: è una lettura speciale o irregolare ` +
      `(come 今日 きょう o 大人 おとな). Va memorizzata come parola intera.`;
  } else {
    const kanjiSegs = seg.filter((s): s is Extract<Segment, { kind: "kanji" }> => s.kind === "kanji");
    const parts = seg.map((s) => (s.kind === "kana" ? null : describeSegment(s, kanji))).filter(Boolean);
    readingText = `**${reading}** = ${parts.join(" + ")}`;
    readingText += "." + readingStyle(kanjiSegs);
  }

  return { meaning: meaningText, reading: readingText };
}
