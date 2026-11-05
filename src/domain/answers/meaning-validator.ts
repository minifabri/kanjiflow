/**
 * Validatore dei significati (italiano, con l'inglese della fonte come alternativa).
 *
 * Normalizzazione: NFC, minuscole, spazi compressi, apostrofi tipografici uniformati,
 * punteggiatura finale rimossa, articolo iniziale facoltativo ("la scuola" = "scuola"),
 * "to" iniziale facoltativo per i verbi inglesi, parti tra parentesi facoltative.
 *
 * Tolleranza:
 * - accenti: una risposta che differisce solo per gli accenti è accettata ma segnalata;
 * - refusi (Damerau-Levenshtein) secondo la soglia configurata, MAI quando la risposta
 *   coincide con il significato di un altro soggetto (protezione semantica: "calvo" non diventa "caldo").
 * - i significati esplicitamente non accettati (blacklist) sono sempre rifiutati.
 */
import { editDistance } from "./distance";

export type TypoTolerance = "off" | "conservative" | "lenient";

export interface ExpectedMeaning {
  meaning: string;
  language: string;
  isPrimary: boolean;
  isAccepted: boolean;
}

export type MeaningVerdict =
  | { verdict: "correct"; outcome: "exact" | "synonym"; normalized: string; matched: string }
  | { verdict: "correct"; outcome: "accent" | "typo"; normalized: string; matched: string; distance: number }
  | { verdict: "incorrect"; outcome: "incorrect" | "rejected_meaning" | "other_subject"; normalized: string; matched?: string }
  | { verdict: "retry"; reason: "empty" | "looks_japanese"; normalized: string };

export interface MeaningQuestion {
  meanings: readonly ExpectedMeaning[];
  typoTolerance: TypoTolerance;
  /** Significati normalizzati di altri soggetti, per bloccare correzioni semanticamente sbagliate. */
  otherSubjectMeanings?: ReadonlySet<string>;
}

const LEADING_ARTICLE = /^(?:(?:il|lo|la|i|gli|le|un|uno|una|the|a|an)\s+|(?:l|un)')/u;

export function normalizeMeaning(input: string): string {
  return input
    .normalize("NFC")
    .toLocaleLowerCase("it")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:,]+$/u, "")
    .trim();
}

/** Varianti confrontabili di un significato: con/senza articolo, con/senza parentesi, con/senza "to". */
export function meaningVariants(input: string): string[] {
  const base = normalizeMeaning(input);
  const out = new Set<string>([base]);
  const noParens = normalizeMeaning(base.replace(/\([^)]*\)/g, " "));
  const withParensContent = normalizeMeaning(base.replace(/[()]/g, " "));
  for (const v of [base, noParens, withParensContent]) {
    if (!v) continue;
    out.add(v);
    const noArticle = v.replace(LEADING_ARTICLE, "").trim();
    if (noArticle) out.add(noArticle);
    if (v.startsWith("to ")) out.add(v.slice(3).trim());
  }
  return [...out].filter(Boolean);
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

export function typoThreshold(length: number, tolerance: TypoTolerance): number {
  if (tolerance === "off") return 0;
  if (tolerance === "conservative") return length <= 4 ? 0 : length <= 8 ? 1 : 2;
  return length <= 3 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : 3;
}

const JAPANESE = /[぀-ヿ一-鿿]/u;

export function validateMeaning(rawAnswer: string, q: MeaningQuestion): MeaningVerdict {
  const normalized = normalizeMeaning(rawAnswer);
  if (!normalized) return { verdict: "retry", reason: "empty", normalized };
  if (JAPANESE.test(normalized)) return { verdict: "retry", reason: "looks_japanese", normalized };

  const answerVariants = meaningVariants(rawAnswer);
  const accepted = q.meanings.filter((m) => m.isAccepted);
  const rejected = q.meanings.filter((m) => !m.isAccepted);

  // 1. Blacklist esplicita: ha la precedenza su tutto.
  for (const m of rejected) {
    if (meaningVariants(m.meaning).some((v) => answerVariants.includes(v))) {
      return { verdict: "incorrect", outcome: "rejected_meaning", normalized, matched: m.meaning };
    }
  }

  // 2. Corrispondenza esatta (dopo normalizzazione).
  for (const m of accepted) {
    if (meaningVariants(m.meaning).some((v) => answerVariants.includes(v))) {
      return { verdict: "correct", outcome: m.isPrimary ? "exact" : "synonym", normalized, matched: m.meaning };
    }
  }

  // 3. Solo accenti diversi.
  const answerNoAccents = answerVariants.map(stripAccents);
  for (const m of accepted) {
    for (const v of meaningVariants(m.meaning)) {
      if (answerNoAccents.includes(stripAccents(v))) {
        // "pero" (pianta) vs "però": se la forma senza accento è un significato di un altro soggetto, non accettiamo.
        if (q.otherSubjectMeanings?.has(normalized)) {
          return { verdict: "incorrect", outcome: "other_subject", normalized };
        }
        return { verdict: "correct", outcome: "accent", normalized, matched: m.meaning, distance: 0 };
      }
    }
  }

  // 4. Protezione semantica prima della tolleranza ai refusi.
  if (q.otherSubjectMeanings && answerVariants.some((v) => q.otherSubjectMeanings!.has(v))) {
    return { verdict: "incorrect", outcome: "other_subject", normalized };
  }

  // 5. Refusi.
  let best: { matched: string; distance: number } | null = null;
  for (const m of accepted) {
    for (const v of meaningVariants(m.meaning)) {
      const target = stripAccents(v);
      const max = typoThreshold([...target].length, q.typoTolerance);
      if (max === 0) continue;
      for (const a of answerNoAccents) {
        // Prima lettera diversa = parola diversa più spesso che refuso: non tollerata.
        if (a[0] !== target[0]) continue;
        const d = editDistance(a, target, max);
        if (d <= max && (!best || d < best.distance)) best = { matched: m.meaning, distance: d };
      }
    }
  }
  if (best) return { verdict: "correct", outcome: "typo", normalized, matched: best.matched, distance: best.distance };

  return { verdict: "incorrect", outcome: "incorrect", normalized };
}
