/**
 * Aggregazioni pure per la pagina Statistiche: nessuna dipendenza da database o UI.
 * Le date si raggruppano per giorno locale dell'utente (chiavi AAAA-MM-GG).
 */
import { addDaysKey, localDateKey } from "../time";

export const STATS_RANGES = [7, 30, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export function parseRange(raw: unknown): StatsRange {
  const n = Number(raw);
  return (STATS_RANGES as readonly number[]).includes(n) ? (n as StatsRange) : 30;
}

export interface AnswerRow {
  at: Date;
  isCorrect: boolean;
}

export interface Bucket {
  /** Primo giorno del gruppo (AAAA-MM-GG). */
  key: string;
  /** Ultimo giorno del gruppo: uguale a key per i gruppi giornalieri. */
  endKey: string;
  total: number;
  correct: number;
}

/**
 * Gruppi consecutivi che coprono gli ultimi `range` giorni fino a oggi compreso:
 * giornalieri fino a 30 giorni, settimanali (7 giorni, l'ultimo termina oggi) oltre.
 */
export function bucketize(rows: readonly AnswerRow[], range: StatsRange, timeZone: string, now: Date): Bucket[] {
  const todayKey = localDateKey(now, timeZone);
  const size = range > 30 ? 7 : 1;
  const count = Math.ceil(range / size);
  const buckets: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const endKey = addDaysKey(todayKey, -i * size);
    buckets.push({ key: addDaysKey(endKey, -(size - 1)), endKey, total: 0, correct: 0 });
  }
  for (const r of rows) {
    const k = localDateKey(r.at, timeZone);
    const b = buckets.find((x) => x.key <= k && k <= x.endKey);
    if (!b) continue;
    b.total++;
    if (r.isCorrect) b.correct++;
  }
  return buckets;
}

/** Percentuale intera, null se non ci sono dati (mai 0% inventato). */
export function percent(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 100);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export const RESPONSE_BINS = [
  { label: "< 2 s", maxMs: 2000 },
  { label: "2–4 s", maxMs: 4000 },
  { label: "4–7 s", maxMs: 7000 },
  { label: "7–12 s", maxMs: 12000 },
  { label: "12–20 s", maxMs: 20000 },
  { label: "> 20 s", maxMs: Infinity },
] as const;

export function responseHistogram(ms: readonly number[]): { label: string; count: number }[] {
  const counts = RESPONSE_BINS.map(() => 0);
  for (const v of ms) {
    if (!(v >= 0)) continue;
    const i = RESPONSE_BINS.findIndex((b) => v < b.maxMs);
    counts[i === -1 ? RESPONSE_BINS.length - 1 : i]!++;
  }
  return RESPONSE_BINS.map((b, i) => ({ label: b.label, count: counts[i]! }));
}

export interface WrongAnswer {
  subjectId: string;
  questionType: string;
  answer: string;
}

/** Risposte sbagliate ripetute: stesso elemento, stessa domanda, stessa risposta. Le più frequenti per prime. */
export function topConfusions(rows: readonly WrongAnswer[], limit = 10): (WrongAnswer & { count: number })[] {
  const map = new Map<string, WrongAnswer & { count: number }>();
  for (const r of rows) {
    const answer = r.answer.trim();
    if (!answer) continue;
    const key = `${r.subjectId}\u0000${r.questionType}\u0000${answer}`;
    const prev = map.get(key);
    if (prev) prev.count++;
    else map.set(key, { ...r, answer, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId) || a.answer.localeCompare(b.answer))
    .slice(0, limit);
}

/** Giorni in cui cade un ripasso, a partire da oggi: un ripasso già scaduto conta per oggi. */
export function forecastByDay(dueDates: readonly Date[], days: number, timeZone: string, now: Date): { key: string; count: number }[] {
  const todayKey = localDateKey(now, timeZone);
  const out = Array.from({ length: days }, (_, i) => ({ key: addDaysKey(todayKey, i), count: 0 }));
  const lastKey = out.at(-1)!.key;
  for (const d of dueDates) {
    const k = localDateKey(d, timeZone);
    const key = k < todayKey ? todayKey : k;
    if (key > lastKey) continue;
    out.find((x) => x.key === key)!.count++;
  }
  return out;
}
