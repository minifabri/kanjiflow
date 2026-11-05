/** Messaggi di feedback in italiano: spiegano sempre perché una risposta è stata accettata o rifiutata. */
import type { MeaningVerdict } from "./meaning-validator";
import type { ReadingType, ReadingVerdict } from "./reading-validator";

export const READING_TYPE_LABEL: Record<ReadingType, string> = {
  onyomi: "on'yomi",
  kunyomi: "kun'yomi",
  nanori: "nanori",
  vocabulary: "lettura del vocabolo",
};

export interface Feedback {
  tone: "success" | "warning" | "error" | "info";
  message: string;
}

export function readingFeedback(v: ReadingVerdict): Feedback {
  switch (v.verdict) {
    case "correct":
      return { tone: "success", message: `Corretto: ${v.normalized} (${READING_TYPE_LABEL[v.matchedType]}).` };
    case "retry":
      switch (v.reason) {
        case "empty":
          return { tone: "info", message: "Scrivi una lettura in romaji o in kana." };
        case "not_kana":
          return { tone: "info", message: "La lettura va scritta in kana o romaji, non in kanji o caratteri latini misti." };
        case "wrong_reading_type":
          return {
            tone: "warning",
            message: `È una lettura valida, ma qui si chiede la ${v.expectedTypes?.map((t) => READING_TYPE_LABEL[t]).join(" o ")}. Riprova: non conta come errore.`,
          };
        case "n_ambiguity":
          return {
            tone: "warning",
            message: `In romaji "n" davanti a vocale si legge come な/に/ぬ…: per ん scrivi "n'" o "nn" (forse intendevi ${v.suggestion}). Riprova: non conta come errore.`,
          };
      }
      break;
    case "incorrect": {
      if (v.outcome === "rejected_reading") return { tone: "error", message: "Questa lettura è stata esclusa esplicitamente." };
      const hints: Record<NonNullable<typeof v.hint>, string> = {
        small_kana: "attenzione ai kana piccoli (ゃゅょっ).",
        sokuon: "manca o è in più una っ (consonante doppia).",
        long_vowel: "attenzione alla vocale lunga.",
        dakuten: "attenzione ai segni sonori (゛゜).",
      };
      return { tone: "error", message: v.hint ? `Sbagliato, ma ci sei quasi: ${hints[v.hint]}` : "Sbagliato." };
    }
  }
  return { tone: "error", message: "Sbagliato." };
}

export function meaningFeedback(v: MeaningVerdict): Feedback {
  switch (v.verdict) {
    case "correct":
      switch (v.outcome) {
        case "exact":
          return { tone: "success", message: "Corretto." };
        case "synonym":
          return { tone: "success", message: `Corretto (sinonimo accettato: «${v.matched}»).` };
        case "accent":
          return { tone: "warning", message: `Accettato, ma la grafia corretta è «${v.matched}» (accento).` };
        case "typo":
          return { tone: "warning", message: `Accettato con refuso: la grafia corretta è «${v.matched}».` };
      }
      break;
    case "retry":
      return v.reason === "empty"
        ? { tone: "info", message: "Scrivi il significato in italiano." }
        : { tone: "info", message: "Qui si chiede il significato, non la lettura. Riprova: non conta come errore." };
    case "incorrect":
      if (v.outcome === "rejected_meaning") return { tone: "error", message: `«${v.matched}» è un significato escluso per questo soggetto.` };
      if (v.outcome === "other_subject")
        return { tone: "error", message: "Sbagliato: è il significato di un altro elemento, quindi non viene trattato come refuso." };
      return { tone: "error", message: "Sbagliato." };
  }
  return { tone: "error", message: "Sbagliato." };
}
