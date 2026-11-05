/**
 * Validatore delle letture. Puro e indipendente dalla UI.
 *
 * Esiti possibili:
 * - correct   → risposta accettata (sempre con motivazione)
 * - incorrect → risposta sbagliata; può includere un suggerimento (kana piccolo, っ, vocale lunga…)
 * - retry     → nessun punteggio: input non valido, oppure lettura valida ma del tipo sbagliato
 *               (es. kun'yomi quando si studia l'on'yomi), oppure romaji ambiguo con ん.
 * Una risposta errata non viene mai trasformata in corretta.
 */
import {
  enlargeSmallKana,
  isAllHiragana,
  kanjidicReadingForms,
  normalizeReadingInput,
  normalizeStoredReading,
  romajiToHiragana,
  expandChoonpu,
  katakanaToHiragana,
} from "./kana";

export type ReadingType = "onyomi" | "kunyomi" | "nanori" | "vocabulary";

export interface ExpectedReading {
  reading: string;
  readingType: ReadingType;
  isPrimary: boolean;
  isAccepted: boolean;
}

export type ReadingHint = "small_kana" | "sokuon" | "long_vowel" | "dakuten";

export type ReadingVerdict =
  | { verdict: "correct"; outcome: "exact"; normalized: string; matched: string; matchedType: ReadingType }
  | { verdict: "incorrect"; outcome: "incorrect" | "rejected_reading"; normalized: string; hint?: ReadingHint; closest?: string }
  | {
      verdict: "retry";
      reason: "empty" | "not_kana" | "wrong_reading_type" | "n_ambiguity";
      normalized: string;
      expectedTypes?: ReadingType[];
      suggestion?: string;
    };

export interface ReadingQuestion {
  subjectType: "kanji" | "vocabulary";
  readings: readonly ExpectedReading[];
}

function forms(subjectType: ReadingQuestion["subjectType"], r: ExpectedReading): string[] {
  return subjectType === "kanji" ? kanjidicReadingForms(r.reading) : [normalizeStoredReading(r.reading)];
}

const LONG_AFTER: Record<string, string> = { あ: "あ", い: "い", う: "う", え: "いえ", お: "うお" };
const ROW_VOWEL: Record<string, string> = {};
for (const [row, v] of [
  ["あかさたなはまやらわがざだばぱゃ", "あ"],
  ["いきしちにひみりぎじぢびぴ", "い"],
  ["うくすつぬふむゆるぐずづぶぷゅ", "う"],
  ["えけせてねへめれげぜでべぺ", "え"],
  ["おこそとのほもよろをごぞどぼぽょ", "お"],
] as const)
  for (const c of row) ROW_VOWEL[c] = v;

/** Rimuove le vocali di allungamento (おう→お, えい→え…) per riconoscere errori di vocale lunga. */
function collapseLongVowels(s: string): string {
  let out = "";
  for (const ch of s) {
    const prev = out.at(-1);
    const v = prev ? ROW_VOWEL[prev] : undefined;
    if (v && LONG_AFTER[v]?.includes(ch)) continue;
    out += ch;
  }
  return out;
}

function stripDakuten(s: string): string {
  return s.normalize("NFD").replace(/[゙゚]/g, "").normalize("NFC");
}

function nearMiss(answer: string, target: string): ReadingHint | undefined {
  if (answer === target) return undefined;
  if (enlargeSmallKana(answer) === enlargeSmallKana(target)) return "small_kana";
  if (answer.replace(/っ/g, "") === target.replace(/っ/g, "")) return "sokuon";
  if (collapseLongVowels(answer) === collapseLongVowels(target)) return "long_vowel";
  if (stripDakuten(answer) === stripDakuten(target)) return "dakuten";
  return undefined;
}

/** Interpretazione alternativa del romaji: "n" singola davanti a vocale/y letta come ん. */
function alternateNReading(raw: string): string | null {
  const s = raw.normalize("NFKC").toLowerCase();
  if (!/n(?=[aiueoy])/.test(s)) return null;
  const alt = s.replace(/(?<!n)n(?=[aiueoy])/g, "n'");
  return expandChoonpu(katakanaToHiragana(romajiToHiragana(alt)));
}

export function validateReading(rawAnswer: string, q: ReadingQuestion): ReadingVerdict {
  const { normalized, wasRomaji } = normalizeReadingInput(rawAnswer);
  if (normalized.length === 0) return { verdict: "retry", reason: "empty", normalized };
  if (!isAllHiragana(normalized)) return { verdict: "retry", reason: "not_kana", normalized };

  const accepted = q.readings.filter((r) => r.isAccepted);
  const rejected = q.readings.filter((r) => !r.isAccepted);
  if (accepted.length === 0) throw new Error("Nessuna lettura accettata per questa domanda");

  // Per i kanji si richiede il tipo delle letture primarie (es. on'yomi); per i vocaboli qualsiasi lettura accettata.
  const primaryTypes = [...new Set(accepted.filter((r) => r.isPrimary).map((r) => r.readingType))];
  const requiredTypes: ReadingType[] =
    q.subjectType === "kanji" && primaryTypes.length > 0 ? primaryTypes : [...new Set(accepted.map((r) => r.readingType))];

  for (const r of accepted) {
    if (requiredTypes.includes(r.readingType) && forms(q.subjectType, r).includes(normalized)) {
      return { verdict: "correct", outcome: "exact", normalized, matched: r.reading, matchedType: r.readingType };
    }
  }
  for (const r of accepted) {
    if (forms(q.subjectType, r).includes(normalized)) {
      return { verdict: "retry", reason: "wrong_reading_type", normalized, expectedTypes: requiredTypes };
    }
  }
  for (const r of rejected) {
    if (forms(q.subjectType, r).includes(normalized)) return { verdict: "incorrect", outcome: "rejected_reading", normalized };
  }

  if (wasRomaji) {
    const alt = alternateNReading(rawAnswer);
    if (alt && accepted.some((r) => requiredTypes.includes(r.readingType) && forms(q.subjectType, r).includes(alt))) {
      return { verdict: "retry", reason: "n_ambiguity", normalized, suggestion: alt };
    }
  }

  const targets = accepted.filter((r) => requiredTypes.includes(r.readingType)).flatMap((r) => forms(q.subjectType, r));
  for (const t of targets) {
    const hint = nearMiss(normalized, t);
    if (hint) return { verdict: "incorrect", outcome: "incorrect", normalized, hint, closest: t };
  }
  return { verdict: "incorrect", outcome: "incorrect", normalized };
}
