import { z } from "zod";
import { REVIEWABLE_STAGES, type ReviewableStage } from "./stages";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Intervalli iniziali (in millisecondi) dopo aver raggiunto ciascuno stadio. */
export const DEFAULT_INTERVALS_MS: Record<ReviewableStage, number> = {
  1: 4 * HOUR,
  2: 8 * HOUR,
  3: 1 * DAY,
  4: 2 * DAY,
  5: 7 * DAY,
  6: 14 * DAY,
  7: 30 * DAY,
  8: 120 * DAY,
};

export const srsConfigSchema = z.object({
  /** Intervallo in ore per ogni stadio 1–8. */
  intervalsHours: z
    .object(
      Object.fromEntries(
        REVIEWABLE_STAGES.map((s) => [String(s), z.number().positive().max(24 * 3650)]),
      ) as Record<`${ReviewableStage}`, z.ZodNumber>,
    )
    .partial()
    .default({}),
  /**
   * Arrotonda la scadenza all'inizio dell'ora: i ripassi arrivano "a blocchi",
   * più facili da smaltire. Disattivabile.
   */
  roundDownToHour: z.boolean().default(true),
  /** Fattore di penalità extra applicato dal Guru in su (vedi regression.ts). */
  guruPenaltyFactor: z.number().int().min(1).max(4).default(2),
  /** Stadio a cui riparte un elemento bruciato quando lo si ristudia. */
  resurrectStage: z.number().int().min(1).max(8).default(1),
});

export type SrsConfigInput = z.input<typeof srsConfigSchema>;

export interface SrsConfig {
  intervalsMs: Record<ReviewableStage, number>;
  roundDownToHour: boolean;
  guruPenaltyFactor: number;
  resurrectStage: ReviewableStage;
}

/** Converte la configurazione salvata (JSON utente, parziale) in una configurazione completa. */
export function resolveSrsConfig(input: unknown = {}): SrsConfig {
  const parsed = srsConfigSchema.parse(input ?? {});
  const intervalsMs = { ...DEFAULT_INTERVALS_MS };
  for (const stage of REVIEWABLE_STAGES) {
    const h = parsed.intervalsHours[`${stage}`];
    if (h !== undefined) intervalsMs[stage] = Math.round(h * HOUR);
  }
  return {
    intervalsMs,
    roundDownToHour: parsed.roundDownToHour,
    guruPenaltyFactor: parsed.guruPenaltyFactor,
    resurrectStage: parsed.resurrectStage as ReviewableStage,
  };
}

export const DEFAULT_SRS_CONFIG: SrsConfig = resolveSrsConfig({});
