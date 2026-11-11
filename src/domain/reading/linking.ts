/**
 * Collega le parole annotate di un brano ai soggetti del dataset.
 *
 * - kanji: ogni kanji della base, se presente nel dataset;
 * - vocaboli: senza analizzatore morfologico. Una parola è riconosciuta quando il testo che parte
 *   dall'annotazione coincide con il vocabolo (図書館, 買い物) oppure con il suo tema, cioè il vocabolo
 *   senza l'ultimo kana (食べ‐ per 食べる, 高‐ per 高い), e le letture corrispondono.
 *   Vince la corrispondenza più lunga. Per le forme irregolari (来ます → 来る)
 *   l'autore dichiara la forma di dizionario nel markup.
 */
import { isRuby, kanjiOf, type RubySegment, type Segment } from "./markup";

export interface VocabEntry {
  id: string;
  characters: string;
  /** Letture in hiragana. */
  readings: readonly string[];
  /** Verbi e aggettivi in -い: nel testo compaiono coniugati, quindi si riconoscono dal tema. */
  inflects: boolean;
}

/** Tag JMdict delle parole che si coniugano (する-nomi esclusi: il nome compare intero nel testo). */
export function inflectsFromPartOfSpeech(tags: readonly string[]): boolean {
  return tags.some((t) => /^(v[125k]|adj-i|aux-adj)/.test(t));
}

export interface LinkIndex {
  kanji: ReadonlyMap<string, string>;
  vocabByFirstChar: ReadonlyMap<string, readonly VocabEntry[]>;
  vocabByCharacters: ReadonlyMap<string, VocabEntry>;
}

const KANA_END = /[\p{Script=Hiragana}]$/u;
const KANA = /[\p{Script=Hiragana}]/u;

function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function buildLinkIndex(kanji: readonly { id: string; characters: string }[], vocab: readonly VocabEntry[]): LinkIndex {
  const byFirst = new Map<string, VocabEntry[]>();
  const byChars = new Map<string, VocabEntry>();
  for (const v of vocab) {
    const first = [...v.characters][0];
    if (!first) continue;
    const list = byFirst.get(first);
    if (list) list.push(v);
    else byFirst.set(first, [v]);
    if (!byChars.has(v.characters)) byChars.set(v.characters, v);
  }
  return { kanji: new Map(kanji.map((k) => [k.characters, k.id])), vocabByFirstChar: byFirst, vocabByCharacters: byChars };
}

interface Match {
  entry: VocabEntry;
  length: number;
  exact: boolean;
}

const PARTICLES = new Set([..."をがはにのもでとやへ、。"]);

/**
 * Lettura dei primi `length` caratteri di superficie a partire dal segmento `start`.
 * null se il taglio cade a metà di un'annotazione (la lettura non è divisibile).
 */
function readingOfPrefix(segments: readonly Segment[], start: number, length: number): string | null {
  let reading = "";
  let covered = 0;
  for (let j = start; j < segments.length && covered < length; j++) {
    const s = segments[j]!;
    if (isRuby(s)) {
      if (covered + s.b.length > length) return null;
      reading += s.r;
      covered += s.b.length;
    } else {
      const part = s.t.slice(0, length - covered);
      reading += part;
      covered += part.length;
    }
  }
  return covered === length ? toHiragana(reading) : null;
}

function bestMatch(segments: readonly Segment[], start: number, surface: string, baseLength: number, index: LinkIndex): Match | null {
  const first = [...surface][0];
  if (!first) return null;
  let best: Match | null = null;
  const consider = (m: Match) => {
    if (m.length < baseLength) return; // la parola deve coprire tutta l'annotazione di partenza
    if (!best || m.length > best.length) {
      best = m;
      return;
    }
    if (m.length !== best.length || m.exact === best.exact) return;
    // Parità tra un nome (考え) e il tema di un verbo (考え‐る): decide ciò che segue.
    // Una particella o la fine del testo indicano il nome, un'altra desinenza indica il verbo.
    const next = surface[m.length];
    const nounContext = next === undefined || PARTICLES.has(next) || !KANA.test(next);
    if (m.exact === nounContext) best = m;
  };
  for (const entry of index.vocabByFirstChar.get(first) ?? []) {
    const c = entry.characters;
    if (surface.startsWith(c)) {
      const r = readingOfPrefix(segments, start, c.length);
      if (r && entry.readings.includes(r)) consider({ entry, length: c.length, exact: true });
    }
    if (entry.inflects && KANA_END.test(c)) {
      const stem = c.slice(0, -1);
      if (stem && surface.startsWith(stem)) {
        const r = readingOfPrefix(segments, start, stem.length);
        if (r && entry.readings.some((x) => x.slice(0, -1) === r)) {
          // La desinenza coniugata (行き‐ます, 高か‐った) fa parte della parola: così 行きます non diventa il nome 行き.
          const ending = surface[stem.length];
          const conjugated = ending !== undefined && KANA.test(ending) && !PARTICLES.has(ending);
          consider({ entry, length: stem.length + (conjugated ? 1 : 0), exact: false });
        }
      }
    }
  }
  return best;
}

/** Restituisce i segmenti con `k` (kanji) e `v` (vocabolo) valorizzati. Non modifica l'input. */
export function linkSegments(segments: readonly Segment[], index: LinkIndex): Segment[] {
  const out: Segment[] = segments.map((s) => ({ ...s }));
  let i = 0;
  while (i < out.length) {
    const seg = out[i]!;
    if (!isRuby(seg)) {
      i++;
      continue;
    }
    const k = kanjiOf(seg.b)
      .map((ch) => index.kanji.get(ch))
      .filter((id): id is string => !!id);
    if (k.length) seg.k = k;

    if (seg.l) {
      const declared = index.vocabByCharacters.get(seg.l);
      if (declared) seg.v = declared.id;
      i++;
      continue;
    }
    if (seg.v) {
      i++;
      continue; // già coperto da una parola iniziata prima
    }
    let surface = "";
    for (let j = i; j < out.length && surface.length < 12; j++) {
      const s = out[j]!;
      surface += isRuby(s) ? s.b : s.t;
    }
    const match = bestMatch(out, i, surface, seg.b.length, index);
    if (match) {
      let covered = 0;
      for (let j = i; j < out.length && covered < match.length; j++) {
        const s = out[j]!;
        if (isRuby(s) && !s.l && covered + s.b.length <= match.length) {
          (s as RubySegment).v = match.entry.id;
          if (j > i) (s as RubySegment).c = true;
        }
        covered += (isRuby(s) ? s.b : s.t).length;
      }
    }
    i++;
  }
  return out;
}

/** Quante volte compare ogni soggetto nei segmenti collegati (un vocabolo su più annotazioni conta una volta sola). */
export function countSubjects(paragraphs: readonly (readonly Segment[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const p of paragraphs) {
    for (const s of p) {
      if (!isRuby(s)) continue;
      for (const id of s.k ?? []) bump(id);
      if (s.v && !s.c) bump(s.v);
    }
  }
  return counts;
}
