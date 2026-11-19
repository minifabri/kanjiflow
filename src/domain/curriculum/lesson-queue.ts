/**
 * Costruzione della coda lezioni: pura, indipendente da database e UI.
 *
 * Percorsi:
 * - guided: radicali sempre disponibili; un kanji si sblocca quando tutti i suoi radicali sono
 *   "superati" (Guru+ o già conosciuti); un vocabolo quando lo sono tutti i suoi kanji.
 * - jlpt:   niente radicali obbligatori; i kanji delle fasce selezionate (e di quelle inferiori
 *   non ancora conosciute) sono subito disponibili; i vocaboli richiedono i loro kanji superati.
 * - custom: i soggetti della raccolta attiva, nell'ordine della raccolta, senza prerequisiti.
 *
 * In ogni percorso i soggetti con priorità (chiesti dall'utente) precedono il resto della coda.
 */
import { GURU_STAGE, BURNED_STAGE } from "../srs/stages";

export type StudyPath = "guided" | "jlpt" | "custom";
export type JlptBand = "N5" | "N4" | "N3" | "N2" | "N1";
export const JLPT_BANDS: JlptBand[] = ["N5", "N4", "N3", "N2", "N1"];

export interface CandidateSubject {
  id: string;
  type: "radical" | "kanji" | "vocabulary";
  lessonOrder: number;
  band: JlptBand | null;
  componentIds: readonly string[];
}

export interface ProgressInfo {
  stage: number;
  markedKnown: boolean;
  suspended: boolean;
}

export interface LessonQueueOptions {
  path: StudyPath;
  targetBand: JlptBand;
  /** Ordine della raccolta attiva (percorso custom). */
  collectionOrder?: readonly string[];
  /** Soggetti esplicitamente esclusi dall'utente ("salta"). */
  skipped?: ReadonlySet<string>;
  /**
   * Soggetti chiesti esplicitamente dall'utente (es. i kanji che mancano per leggere un brano), nell'ordine
   * della richiesta: vanno in cima alla coda in ogni percorso, senza prerequisiti.
   */
  priority?: readonly string[];
}

export function isPassedProgress(p: ProgressInfo | undefined): boolean {
  return !!p && (p.markedKnown || p.stage >= GURU_STAGE || p.stage === BURNED_STAGE);
}

const bandRank = (b: JlptBand | null) => (b ? JLPT_BANDS.indexOf(b) : JLPT_BANDS.length);

export function buildLessonQueue(
  subjects: readonly CandidateSubject[],
  progress: ReadonlyMap<string, ProgressInfo>,
  opts: LessonQueueOptions,
): CandidateSubject[] {
  const regular = buildPathQueue(subjects, progress, opts);
  if (!opts.priority?.length) return regular;
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const first = [...new Set(opts.priority)]
    .map((id) => byId.get(id))
    .filter((s): s is CandidateSubject => !!s && !progress.has(s.id) && !opts.skipped?.has(s.id));
  const firstIds = new Set(first.map((s) => s.id));
  return [...first, ...regular.filter((s) => !firstIds.has(s.id))];
}

function buildPathQueue(
  subjects: readonly CandidateSubject[],
  progress: ReadonlyMap<string, ProgressInfo>,
  opts: LessonQueueOptions,
): CandidateSubject[] {
  const started = (id: string) => progress.has(id);
  const passed = (id: string) => isPassedProgress(progress.get(id));
  const notSkipped = (s: CandidateSubject) => !opts.skipped?.has(s.id);

  if (opts.path === "custom") {
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return (opts.collectionOrder ?? [])
      .map((id) => byId.get(id))
      .filter((s): s is CandidateSubject => !!s && !started(s.id) && notSkipped(s));
  }

  const targetRank = bandRank(opts.targetBand);
  const available = subjects.filter((s) => {
    if (started(s.id) || !notSkipped(s)) return false;
    if (opts.path === "guided") {
      if (s.type === "radical") return true;
      return s.componentIds.every(passed);
    }
    // jlpt
    if (s.type === "radical") return false;
    if (s.type === "kanji") return bandRank(s.band) <= targetRank;
    return bandRank(s.band) <= targetRank && s.componentIds.length > 0 && s.componentIds.every(passed);
  });

  return available.sort((a, b) => {
    if (opts.path === "jlpt") {
      const br = bandRank(a.band) - bandRank(b.band);
      if (br !== 0) return br;
    }
    return a.lessonOrder - b.lessonOrder || a.id.localeCompare(b.id);
  });
}

export interface LessonLimits {
  dailyLessonLimit: number;
  lessonsCompletedToday: number;
  maxApprenticeItems: number;
  apprenticeCount: number;
}

/** Quante lezioni nuove si possono ancora iniziare oggi. */
export function lessonAllowance(l: LessonLimits): number {
  const byDay = Math.max(0, l.dailyLessonLimit - l.lessonsCompletedToday);
  const byLoad = Math.max(0, l.maxApprenticeItems - l.apprenticeCount);
  return Math.min(byDay, byLoad);
}
