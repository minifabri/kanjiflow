/**
 * Normalizzazione del giapponese per il confronto delle letture.
 *
 * Regole (deliberatamente conservative):
 * - Unicode NFKC: katakana a mezza larghezza → larghezza piena, forme composte uniformate.
 * - Katakana → hiragana tramite offset di code point (ー resta ー).
 * - ー viene espanso nella vocale della mora precedente (こーひー → こおひい).
 *   Lo stesso trattamento è applicato alla lettura attesa, quindi conta solo la coerenza:
 *   "koohii" e コーヒー sono equivalenti, ma こうこう ≠ こおこお (高校) resta un errore.
 * - Nessuna fusione tra おう/おお, ず/づ, じ/ぢ, は/わ: sono ortografie diverse.
 */
import { toHiragana as wkToHiragana } from "wanakana";

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const KANA_OFFSET = 0x60;

export function katakanaToHiragana(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    // ヵ ヶ non hanno un equivalente hiragana d'uso comune nelle letture: li mappiamo comunque (ゕ ゖ).
    out += cp >= KATAKANA_START && cp <= KATAKANA_END ? String.fromCodePoint(cp - KANA_OFFSET) : ch;
  }
  return out;
}

const VOWEL_OF: Record<string, string> = {};
const ROWS: Array<[string, string]> = [
  ["あかさたなはまやらわがざだばぱぁゃゎ", "あ"],
  ["いきしちにひみりぎじぢびぴぃ", "い"],
  ["うくすつぬふむゆるぐずづぶぷぅゅゔっ", "う"],
  ["えけせてねへめれげぜでべぺぇ", "え"],
  ["おこそとのほもよろをごぞどぼぽぉょ", "お"],
];
for (const [chars, vowel] of ROWS) for (const c of chars) VOWEL_OF[c] = vowel;

export function expandChoonpu(hiragana: string): string {
  let out = "";
  for (const ch of hiragana) {
    if (ch === "ー") {
      const prev = out.at(-1);
      out += (prev && VOWEL_OF[prev]) ?? "ー";
    } else out += ch;
  }
  return out;
}

const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
};

export function enlargeSmallKana(s: string): string {
  return [...s].map((c) => SMALL_TO_LARGE[c] ?? c).join("");
}

/** True se la stringa contiene solo hiragana (dopo normalizzazione). */
export function isAllHiragana(s: string): boolean {
  return s.length > 0 && /^[ぁ-ゖ]+$/u.test(s);
}

const ROMAJI_RE = /^[a-z'\-\s]+$/;

export function looksLikeRomaji(raw: string): boolean {
  return ROMAJI_RE.test(raw.normalize("NFKC").toLowerCase().trim());
}

/**
 * Conversione romaji → hiragana con le convenzioni delle tastiere IME:
 * - "nn" a fine parola o davanti a consonante = ん ("honn" → ほん, "kannnin" → かんにん)
 * - "n'" separa ん dalla vocale successiva ("ken'ichi" → けんいち)
 * - "n" finale = ん
 * - Hepburn "m" davanti a b/p = ん ("shimbun" → しんぶん)
 * - "-" = ー
 */
export function romajiToHiragana(raw: string): string {
  const s = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/m(?=[bp])/g, "n")
    .replace(/nn(?=[^aiueoy]|$)/g, "n'");
  return wkToHiragana(s).replace(/'/g, "");
}

/**
 * Normalizza qualsiasi input (romaji, hiragana, katakana, IME) in una forma
 * confrontabile. Restituisce anche se l'input originale era romaji.
 */
export function normalizeReadingInput(raw: string): { normalized: string; wasRomaji: boolean } {
  const trimmed = raw.normalize("NFKC").trim();
  const wasRomaji = looksLikeRomaji(trimmed);
  // Kana e romaji misti ("かn", l'ultima lettera non ancora convertita durante la digitazione): si completa la conversione.
  const mixed = !wasRomaji && /[a-z]/i.test(trimmed) && /[\u3040-\u30ff]/.test(trimmed);
  const kana = wasRomaji || mixed ? romajiToHiragana(trimmed) : trimmed.replace(/\s+/g, "");
  return { normalized: expandChoonpu(katakanaToHiragana(kana)), wasRomaji };
}

/** Normalizza una lettura memorizzata (può contenere katakana, ー, o marcatori KANJIDIC). */
export function normalizeStoredReading(reading: string): string {
  return expandChoonpu(katakanaToHiragana(reading.normalize("NFKC").trim()));
}

/**
 * Le letture kun di KANJIDIC usano "." per separare l'okurigana e "-" per
 * affissi ("か.つ", "-が.ち"). Forme accettate: parola intera ("かつ") e radice ("か").
 */
export function kanjidicReadingForms(reading: string): string[] {
  const clean = normalizeStoredReading(reading).replace(/-/g, "");
  if (!clean.includes(".")) return [clean];
  const [stem, okurigana] = clean.split(".", 2) as [string, string];
  return [...new Set([stem + okurigana, stem])].filter(Boolean);
}
