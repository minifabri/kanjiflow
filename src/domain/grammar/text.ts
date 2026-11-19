/**
 * Testi con spazi vuoti (文章の文法): formato dei file versionati (data/curated/grammar-texts/*.json)
 * e funzioni pure per i segnaposto ［1］ ［2］… dentro il testo.
 */
import { z } from "zod";
import { isRuby, type Segment } from "../reading/markup";
import { GRAMMAR_LEVELS } from "./content";

/** Un segnaposto è un numero tra parentesi quadre a tutta larghezza: ［1］. */
const BLANK_SOURCE = "［(\\d)］";

/** Numeri dei segnaposto in ordine di comparsa, dentro i paragrafi di un testo. */
export function blankMarkers(body: readonly string[]): number[] {
  return body.flatMap((p) => [...p.matchAll(new RegExp(BLANK_SOURCE, "g"))].map((m) => Number(m[1])));
}

export const grammarTextBlankSchema = z.object({
  /** Slug del punto grammaticale verificato; null per connettivi, particelle e simili. */
  point: z
    .string()
    .regex(/^n[34]-[a-z0-9-]+$/)
    .nullable(),
  choices: z.array(z.string().min(1)).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});

export const grammarTextSchema = z
  .object({
    slug: z.string().regex(/^n[34]-[a-z0-9-]+$/),
    level: z.enum(GRAMMAR_LEVELS),
    title: z.string().min(1),
    titleIt: z.string().min(1),
    /** Paragrafi con i segnaposto ［1］…［n］, ognuno una volta sola e in ordine crescente. */
    body: z.array(z.string().min(1)).min(1),
    translation: z.array(z.string().min(1)).min(1),
    blanks: z.array(grammarTextBlankSchema).min(4).max(8),
  })
  .superRefine((t, ctx) => {
    if (t.body.length !== t.translation.length) {
      ctx.addIssue({ code: "custom", message: "La traduzione deve avere un elemento per paragrafo", path: ["translation"] });
    }
    const markers = blankMarkers(t.body);
    const expected = t.blanks.map((_, i) => i + 1);
    if (markers.join(",") !== expected.join(",")) {
      ctx.addIssue({
        code: "custom",
        message: `I segnaposto devono essere ［1］…［${t.blanks.length}］, una volta ciascuno e in ordine: trovati ${markers.join(", ") || "nessuno"}`,
        path: ["body"],
      });
    }
  });

export const grammarTextFileSchema = z.object({
  format: z.literal("kanjiflow-grammar-text/1"),
  texts: z.array(grammarTextSchema),
});

export type GrammarTextSource = z.infer<typeof grammarTextSchema>;

export type TextPart = { kind: "segment"; segment: Segment } | { kind: "blank"; number: number };

/** Spezza i segmenti di un paragrafo in pezzi di testo e spazi vuoti, nell'ordine in cui compaiono. */
export function splitBlanks(segments: readonly Segment[]): TextPart[] {
  const parts: TextPart[] = [];
  for (const s of segments) {
    if (isRuby(s)) {
      parts.push({ kind: "segment", segment: s });
      continue;
    }
    let last = 0;
    for (const m of s.t.matchAll(new RegExp(BLANK_SOURCE, "g"))) {
      if (m.index > last) parts.push({ kind: "segment", segment: { t: s.t.slice(last, m.index) } });
      parts.push({ kind: "blank", number: Number(m[1]) });
      last = m.index + m[0].length;
    }
    if (last < s.t.length) parts.push({ kind: "segment", segment: { t: s.t.slice(last) } });
  }
  return parts;
}
