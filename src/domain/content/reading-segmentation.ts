/**
 * Scompone la lettura di un vocabolo nelle letture dei singoli kanji (es. 学校 がっこう → がく→がっ + こう).
 * Serve a generare spiegazioni della lettura verificabili: se la scomposizione non riesce con le letture
 * del dizionario, la lettura viene dichiarata "speciale" (jukujikun/ateji) invece di inventare un legame.
 */

export interface KanjiReadings {
  onyomi: string[]; // hiragana
  kunyomi: string[]; // formato KANJIDIC: "か.つ", "-び", "ひと-"
}

/**
 * - rendaku: la consonante iniziale diventa sonora in composizione (かみ → がみ);
 * - handakuten: h → p dopo っ o ん (はつ → ぱつ);
 * - sokuon: l'ultima sillaba diventa っ davanti alla consonante seguente (がく → がっ);
 * - okurigana: la lettura include okurigana non scritta o nella forma in -i (語る → 物語 ものがたり).
 */
export type SoundChange = "rendaku" | "handakuten" | "sokuon" | "okurigana";

export type Segment =
  | { kind: "kana"; text: string; reading: string }
  | {
      kind: "kanji";
      text: string;
      reading: string; // come appare nel vocabolo
      base: string | null; // lettura di dizionario (null se kanji sconosciuto)
      readingType: "onyomi" | "kunyomi" | null;
      changes: SoundChange[];
      repeat?: boolean; // 々
    };

const toHiragana = (s: string) =>
  [...s].map((c) => {
    const cp = c.codePointAt(0)!;
    return cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : c;
  }).join("");

const isKana = (c: string) => /[\u3041-\u3096\u30a1-\u30fa\u30fc]/.test(c);

const RENDAKU: Record<string, string> = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
  さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど",
  は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
};
const HANDAKU: Record<string, string> = { は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ" };
// Nella grafia moderna ぢ/づ da rendaku si scrivono spesso じ/ず (es. 鼻血 はなぢ, ma 世界中 せかいじゅう).
const RENDAKU_ALT: Record<string, string> = { ち: "じ", つ: "ず" };
// Forma in -i dei verbi godan: かたる → かたり.
const I_FORM: Record<string, string> = { う: "い", く: "き", ぐ: "ぎ", す: "し", つ: "ち", ぬ: "に", ぶ: "び", む: "み", る: "り" };

interface Candidate {
  reading: string;
  base: string;
  readingType: "onyomi" | "kunyomi";
  changes: SoundChange[];
}

interface Form {
  text: string;
  changes: SoundChange[];
}

function soundVariants(form: Form, inCompound: boolean): Form[] {
  const out: Form[] = [form];
  const first = form.text[0]!;
  const rest = form.text.slice(1);
  if (inCompound) {
    for (const r of [RENDAKU[first], RENDAKU_ALT[first]]) if (r) out.push({ text: r + rest, changes: [...form.changes, "rendaku"] });
    if (HANDAKU[first]) out.push({ text: HANDAKU[first] + rest, changes: [...form.changes, "handakuten"] });
  }
  // Raddoppiamento finale: つ/ち/く/き nelle on'yomi, e qualunque sillaba finale di una forma verbale (切る → 切手 きって).
  const geminable = form.changes.includes("okurigana") ? /[つちくきるうりい]$/ : /[つちくき]$/;
  for (const f of [...out]) {
    if (f.text.length >= 2 && geminable.test(f.text)) out.push({ text: f.text.slice(0, -1) + "っ", changes: [...f.changes, "sokuon"] });
  }
  return out;
}

function candidates(k: KanjiReadings, inCompound: boolean): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    const key = `${c.reading}|${c.readingType}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };
  for (const on of k.onyomi) {
    const base = toHiragana(on);
    for (const v of soundVariants({ text: base, changes: [] }, inCompound)) push({ reading: v.text, base, readingType: "onyomi", changes: v.changes });
  }
  for (const kun of k.kunyomi) {
    const [stem, okuri = ""] = kun.replace(/-/g, "").split(".");
    if (!stem) continue;
    const base = stem + okuri;
    const forms: Form[] = [{ text: stem, changes: [] }];
    // Okurigana omessa nella scrittura del composto (建物 たてもの, 受付 うけつけ) o in forma in -i (物語 ものがたり).
    for (let n = 1; n <= okuri.length; n++) forms.push({ text: stem + okuri.slice(0, n), changes: ["okurigana"] });
    const last = okuri.slice(-1);
    if (okuri && I_FORM[last]) forms.push({ text: stem + okuri.slice(0, -1) + I_FORM[last], changes: ["okurigana"] });
    for (const f of forms) for (const v of soundVariants(f, inCompound)) push({ reading: v.text, base, readingType: "kunyomi", changes: v.changes });
  }
  // Prima le letture senza mutazioni, poi le più lunghe: scomposizioni più "normali" vincono.
  return out.sort((a, b) => a.changes.length - b.changes.length || b.reading.length - a.reading.length);
}

/**
 * Restituisce la scomposizione o null se le letture di dizionario non bastano a spiegare la parola.
 * I kanji assenti da `readings` accettano 1–4 kana qualsiasi (base null), ma ne basta uno sconosciuto
 * per restare onesti: la spiegazione lo dirà.
 */
export function segmentReading(written: string, reading: string, readings: Map<string, KanjiReadings>): Segment[] | null {
  const chars = [...written];
  const target = toHiragana(reading);

  const solve = (i: number, pos: number, prevKanji: string | null): Segment[] | null => {
    if (i === chars.length) return pos === target.length ? [] : null;
    const c = chars[i]!;
    if (isKana(c)) {
      const t = target[pos];
      if (t === undefined) return null;
      // ー allunga la vocale precedente: nella lettura in hiragana può comparire come vocale o come ー.
      if (c === "ー" ? !/[あいうえおー]/.test(t) : t !== toHiragana(c)) return null;
      const rest = solve(i + 1, pos + 1, null);
      return rest ? [{ kind: "kana", text: c, reading: target[pos]! }, ...rest] : null;
    }
    const kanjiChar = c === "々" ? prevKanji : c;
    const known = kanjiChar ? readings.get(kanjiChar) : undefined;
    if (known) {
      for (const cand of candidates(known, i > 0)) {
        if (!target.startsWith(cand.reading, pos)) continue;
        const rest = solve(i + 1, pos + cand.reading.length, kanjiChar);
        if (rest) {
          return [
            {
              kind: "kanji",
              text: c,
              reading: cand.reading,
              base: cand.base,
              readingType: cand.readingType,
              changes: cand.changes,
              ...(c === "々" ? { repeat: true } : {}),
            },
            ...rest,
          ];
        }
      }
      return null;
    }
    for (let len = 1; len <= 4 && pos + len <= target.length; len++) {
      const rest = solve(i + 1, pos + len, kanjiChar);
      if (rest) return [{ kind: "kanji", text: c, reading: target.slice(pos, pos + len), base: null, readingType: null, changes: [] }, ...rest];
    }
    return null;
  };

  return solve(0, 0, null);
}
