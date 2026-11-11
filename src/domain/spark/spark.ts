/**
 * Stimoli: micro-domande a scelta multipla proposte all'ingresso nell'app.
 *
 * Modulo puro (niente database né UI). Uno stimolo non tocca mai lo SRS: serve a richiamare
 * qualcosa di già studiato in pochi secondi. La scelta è deterministica dato il seme, così
 * ricaricando la pagina la domanda della fascia oraria resta la stessa finché non si risponde.
 */
import { startOfLocalDay } from "../time";

export type SparkKind = "meaning" | "reading" | "reverse" | "cloze" | "sentence";
export type SparkReason = "retry" | "weak" | "due" | "fresh" | "burned" | "known" | "random" | "discover";
export type SparkSubjectType = "radical" | "kanji" | "vocabulary";

export interface SparkOption {
  label: string;
  /** Testo giapponese: va reso con il font dedicato. */
  jp: boolean;
}

export interface SparkFact {
  title: string;
  /** Testo con il markup minimo dei contenuti generati (**grassetto**). */
  text: string;
  jp?: boolean;
}

export interface Spark {
  /** Seme con cui è stata generata: identifica la domanda. */
  key: string;
  kind: SparkKind;
  reason: SparkReason;
  subjectId: string;
  subjectType: SparkSubjectType;
  prompt: string;
  /** Testo grande al centro (kanji, parola, frase); null per le domande "al contrario". */
  display: string | null;
  displayJp: boolean;
  /** Riga di aiuto sotto il testo grande (es. traduzione della frase). */
  hint: string | null;
  options: SparkOption[];
  correctIndex: number;
  reveal: {
    characters: string;
    reading: string | null;
    /** Kana da leggere ad alta voce. */
    speech: string | null;
    meaning: string;
    facts: SparkFact[];
  };
}

/* ---------- Fasce della giornata ---------- */

export type SparkSlotKey = "mattina" | "pomeriggio" | "sera";

export interface SparkSlot {
  key: SparkSlotKey;
  /** Identificatore stabile della fascia, es. "2026-11-11:sera". */
  id: string;
  startsAt: Date;
  /** "della mattina", per le frasi dell'interfaccia. */
  label: string;
  /** Quando arriva il prossimo stimolo, es. "nel pomeriggio". */
  nextLabel: string;
}

const HOUR = 3600_000;

function localHour(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date));
}

/** Tre fasce: mattina 5–12, pomeriggio 12–18, sera 18–5 (le ore piccole appartengono alla sera prima). */
export function sparkSlot(now: Date, timeZone: string): SparkSlot {
  const h = localHour(now, timeZone);
  const dayStart = startOfLocalDay(now, timeZone);
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (h < 5) {
    const startsAt = new Date(dayStart.getTime() - 6 * HOUR);
    return { key: "sera", id: `${dayKey(startsAt)}:sera`, startsAt, label: "della sera", nextLabel: "domattina" };
  }
  if (h < 12) {
    return { key: "mattina", id: `${dayKey(now)}:mattina`, startsAt: new Date(dayStart.getTime() + 5 * HOUR), label: "della mattina", nextLabel: "nel pomeriggio" };
  }
  if (h < 18) {
    return { key: "pomeriggio", id: `${dayKey(now)}:pomeriggio`, startsAt: new Date(dayStart.getTime() + 12 * HOUR), label: "del pomeriggio", nextLabel: "stasera" };
  }
  return { key: "sera", id: `${dayKey(now)}:sera`, startsAt: new Date(dayStart.getTime() + 18 * HOUR), label: "della sera", nextLabel: "domattina" };
}

/* ---------- Casualità deterministica ---------- */

export type Rng = () => number;

/** Generatore pseudo-casuale riproducibile a partire da una stringa (FNV-1a + mulberry32). */
export function seededRng(seed: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(items: readonly T[], rng: Rng): T | undefined {
  return items.length ? items[Math.floor(rng() * items.length)] : undefined;
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/* ---------- Scelta del soggetto ---------- */

export interface SparkPoolItem {
  id: string;
  type: SparkSubjectType;
  stage: number;
  markedKnown: boolean;
  incorrect: number;
  total: number;
  nextReviewAt: Date | null;
  lessonCompletedAt: Date | null;
  /** Sbagliato in uno stimolo recente e non ancora recuperato. */
  missedInSpark: boolean;
}

/** Perché questo elemento merita uno stimolo adesso, e quanto pesa nell'estrazione. */
export function sparkReason(item: SparkPoolItem, now: Date): { reason: SparkReason; weight: number } {
  if (item.missedInSpark) return { reason: "retry", weight: 6 };
  if (item.total >= 4 && item.incorrect / item.total >= 0.25) return { reason: "weak", weight: 5 };
  if (item.markedKnown) return { reason: "known", weight: 1 };
  if (item.lessonCompletedAt && now.getTime() - item.lessonCompletedAt.getTime() <= 72 * HOUR) return { reason: "fresh", weight: 3 };
  if (item.stage >= 1 && item.stage <= 8 && item.nextReviewAt && item.nextReviewAt.getTime() - now.getTime() <= 12 * HOUR) {
    return { reason: "due", weight: 3 };
  }
  if (item.stage >= 9) return { reason: "burned", weight: 2 };
  return { reason: "random", weight: 1 };
}

/** Quota massima dell'estrazione lasciata agli elementi "già noti" quando c'è materiale studiato davvero. */
const KNOWN_SHARE = 0.2;

/**
 * Estrae il soggetto dello stimolo. Gli elementi usciti di recente (`exclude`) vengono saltati
 * finché ne restano altri; i radicali pesano meno perché offrono solo la domanda sul significato.
 */
export function pickSparkSubject(
  pool: readonly SparkPoolItem[],
  rng: Rng,
  now: Date,
  exclude: ReadonlySet<string> = new Set(),
): { item: SparkPoolItem; reason: SparkReason } | null {
  if (pool.length === 0) return null;
  const fresh = pool.filter((p) => !exclude.has(p.id));
  const candidates = (fresh.length ? fresh : pool).map((item) => {
    const r = sparkReason(item, now);
    return { item, reason: r.reason, weight: item.type === "radical" ? r.weight * 0.3 : r.weight };
  });
  const studied = candidates.filter((c) => c.reason !== "known").reduce((s, c) => s + c.weight, 0);
  const known = candidates.filter((c) => c.reason === "known").reduce((s, c) => s + c.weight, 0);
  if (studied > 0 && known > 0) {
    const scale = Math.min(1, (studied * KNOWN_SHARE) / (1 - KNOWN_SHARE) / known);
    for (const c of candidates) if (c.reason === "known") c.weight *= scale;
  }
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let roll = rng() * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll < 0) return { item: c.item, reason: c.reason };
  }
  const last = candidates[candidates.length - 1]!;
  return { item: last.item, reason: last.reason };
}

/* ---------- Opzioni ---------- */

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();

/**
 * Sceglie fino a `count` distrattori con etichette distinte tra loro e diverse da ogni
 * risposta che sarebbe corretta (`forbidden`): mai due opzioni giuste nella stessa domanda.
 */
export function chooseDistractors(candidates: readonly string[], forbidden: readonly string[], rng: Rng, count = 3): string[] {
  const seen = new Set(forbidden.map(norm));
  const out: string[] = [];
  for (const c of shuffled(candidates, rng)) {
    const k = norm(c);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}

export function buildOptions(correct: string, distractors: readonly string[], jp: boolean, rng: Rng): { options: SparkOption[]; correctIndex: number } {
  const labels = shuffled([correct, ...distractors], rng);
  return { options: labels.map((label) => ({ label, jp })), correctIndex: labels.indexOf(correct) };
}

/* ---------- Testi ---------- */

export const BLANK = "＿";

/** Sostituisce la prima occorrenza di `part` con uno spazio vuoto da completare. */
export function maskFirst(text: string, part: string, blank = BLANK): string | null {
  const i = text.indexOf(part);
  return i < 0 || !part ? null : text.slice(0, i) + blank + text.slice(i + part.length);
}

export function hiraganaToKatakana(s: string): string {
  return [...s]
    .map((c) => {
      const cp = c.codePointAt(0)!;
      return cp >= 0x3041 && cp <= 0x3096 ? String.fromCodePoint(cp + 0x60) : c;
    })
    .join("");
}

/** Lettura come la si mostra: on'yomi in katakana, kun'yomi senza i segni KANJIDIC ("た.べる" → "たべる"). */
export function displayReading(reading: string, readingType: string): string {
  const plain = reading.replace(/[.\-]/g, "");
  return readingType === "onyomi" ? hiraganaToKatakana(plain) : plain;
}

export const REASON_LABEL: Record<SparkReason, string> = {
  retry: "Rivincita",
  weak: "Punto debole",
  due: "Presto in ripasso",
  fresh: "Appena imparato",
  burned: "Bruciato: lo ricordi ancora?",
  known: "Dato per noto",
  random: "Richiamo",
  discover: "Anteprima: prova a indovinare",
};
