/**
 * Markup dei brani di lettura: `{漢字|かんじ}` annota una parola con la sua lettura,
 * `{来|き|来る}` aggiunge la forma di dizionario quando non è ricavabile dal testo.
 * Ogni kanji del testo deve stare dentro un'annotazione: è ciò che permette furigana adattivo e schede al tocco.
 * Puro: nessuna dipendenza da database o UI.
 */

export interface TextSegment {
  t: string;
}
export interface RubySegment {
  /** Testo base (con kanji). */
  b: string;
  /** Lettura in hiragana (o katakana). */
  r: string;
  /** Forma di dizionario dichiarata dall'autore. */
  l?: string;
  /** Id dei soggetti kanji contenuti nella base (solo quelli presenti nel dataset), in ordine. */
  k?: string[];
  /** Id del vocabolo collegato. */
  v?: string;
  /** true se l'annotazione continua il vocabolo iniziato da una precedente (物 in 買い物). */
  c?: true;
}
export type Segment = TextSegment | RubySegment;

export const isRuby = (s: Segment): s is RubySegment => "b" in s;

const KANJI = /[\p{Script=Han}々]/u;
const KANJI_G = /\p{Script=Han}/gu;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

export function hasKanji(text: string): boolean {
  return KANJI.test(text);
}

/** Kanji distinti di una stringa, nell'ordine di comparsa (々 escluso: non è un soggetto). */
export function kanjiOf(text: string): string[] {
  return [...new Set(text.match(KANJI_G) ?? [])].filter((c) => c !== "々");
}

export class MarkupError extends Error {}

export function parseMarkup(source: string): Segment[] {
  const out: Segment[] = [];
  const re = /\{([^{}|]+)\|([^{}|]+)(?:\|([^{}|]+))?\}/g;
  let last = 0;
  const pushText = (t: string) => {
    if (!t) return;
    if (/[{}|]/.test(t)) throw new MarkupError(`Annotazione malformata vicino a "${t.slice(0, 20)}"`);
    if (hasKanji(t)) throw new MarkupError(`Kanji senza lettura: "${t}"`);
    out.push({ t });
  };
  for (const m of source.matchAll(re)) {
    pushText(source.slice(last, m.index));
    const [, b, r, l] = m;
    if (!hasKanji(b!)) throw new MarkupError(`Annotazione senza kanji: "${b}"`);
    if (!KANA_ONLY.test(r!)) throw new MarkupError(`Lettura non in kana: "${b}|${r}"`);
    out.push(l ? { b: b!, r: r!, l } : { b: b!, r: r! });
    last = m.index + m[0].length;
  }
  pushText(source.slice(last));
  return out;
}

/** Testo come appare sulla pagina, senza letture. */
export function plainText(segments: readonly Segment[]): string {
  return segments.map((s) => (isRuby(s) ? s.b : s.t)).join("");
}

/** Testo tutto in kana: è quello che si passa alla sintesi vocale. */
export function kanaText(segments: readonly Segment[]): string {
  return segments.map((s) => (isRuby(s) ? s.r : s.t)).join("");
}

/** Lunghezza del brano in caratteri giapponesi (senza spazi né ritorni a capo). */
export function charCount(paragraphs: readonly (readonly Segment[])[]): number {
  return paragraphs.reduce((n, p) => n + plainText(p).replace(/\s/g, "").length, 0);
}

/** Id dei soggetti kanji collegati a uno o più gruppi di segmenti, senza ripetizioni. */
export function kanjiIdsOf(groups: readonly (readonly Segment[])[]): string[] {
  const ids = new Set<string>();
  for (const g of groups) for (const s of g) if (isRuby(s)) for (const id of s.k ?? []) ids.add(id);
  return [...ids];
}
