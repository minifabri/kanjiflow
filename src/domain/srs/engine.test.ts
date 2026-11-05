import { describe, expect, it } from "vitest";
import {
  DEFAULT_SRS_CONFIG,
  applyLessonCompletion,
  applyMarkKnown,
  applyResurrection,
  applyReview,
  computeNextReviewAt,
  computeNextStage,
  resolveSrsConfig,
  stableFraction,
  type SrsStage,
} from "./index";

const ok = { meaningIncorrect: 0, readingIncorrect: 0 };
const now = new Date("2026-11-05T16:37:12.000Z");
const H = 3600_000;

describe("computeNextStage — risposte corrette", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8] as SrsStage[])("stadio %i avanza di uno", (s) => {
    expect(computeNextStage(s, ok)).toBe(s + 1);
  });
  it("Illuminato → Bruciato", () => {
    expect(computeNextStage(8, ok)).toBe(9);
  });
});

describe("computeNextStage — politica di regressione", () => {
  const cases: Array<[SrsStage, number, number, SrsStage]> = [
    // stadio, errori significato, errori lettura, atteso
    [1, 1, 0, 1], // pavimento ad Apprendista 1
    [2, 1, 0, 1],
    [4, 1, 0, 3],
    [4, 1, 1, 3], // 2 errori → ceil(2/2)=1
    [4, 2, 1, 2], // 3 errori → 2 passi
    [5, 1, 0, 3], // Guru 1, fattore 2
    [6, 1, 0, 4], // Guru 2 → Apprendista 4
    [7, 0, 1, 5], // Maestro → Guru 1
    [8, 1, 0, 6], // Illuminato → Guru 2
    [8, 2, 1, 4], // Illuminato con 3 errori → Apprendista 4
    [8, 10, 10, 1], // molti errori → pavimento
  ];
  it.each(cases)("stadio %i con %i/%i errori → %i", (s, m, r, expected) => {
    expect(computeNextStage(s, { meaningIncorrect: m, readingIncorrect: r })).toBe(expected);
  });

  it("il fattore Guru è configurabile", () => {
    expect(computeNextStage(6, { meaningIncorrect: 1, readingIncorrect: 0 }, { guruPenaltyFactor: 1 })).toBe(5);
  });

  it("è deterministica", () => {
    const a = computeNextStage(7, { meaningIncorrect: 3, readingIncorrect: 2 });
    const b = computeNextStage(7, { meaningIncorrect: 3, readingIncorrect: 2 });
    expect(a).toBe(b);
  });

  it("rifiuta stadi non ripassabili e input non validi", () => {
    expect(() => computeNextStage(0, ok)).toThrow();
    expect(() => computeNextStage(9, ok)).toThrow();
    expect(() => computeNextStage(3, { meaningIncorrect: -1, readingIncorrect: 0 })).toThrow();
    expect(() => computeNextStage(3, { meaningIncorrect: 0.5, readingIncorrect: 0 })).toThrow();
    expect(() => computeNextStage(12 as SrsStage, ok)).toThrow();
  });
});

describe("computeNextReviewAt", () => {
  it("usa gli intervalli predefiniti e arrotonda all'ora", () => {
    expect(computeNextReviewAt(1, now)?.toISOString()).toBe("2026-11-05T20:00:00.000Z");
    expect(computeNextReviewAt(3, now)?.toISOString()).toBe("2026-11-06T16:00:00.000Z");
    expect(computeNextReviewAt(5, now)?.toISOString()).toBe("2026-11-12T16:00:00.000Z");
    expect(computeNextReviewAt(8, now)!.getTime() - now.getTime()).toBeGreaterThan(119 * 24 * H);
  });
  it("Bruciato non ha scadenza", () => {
    expect(computeNextReviewAt(9, now)).toBeNull();
  });
  it("rispetta intervalli personalizzati e arrotondamento disattivato", () => {
    const cfg = resolveSrsConfig({ intervalsHours: { "1": 2 }, roundDownToHour: false });
    expect(computeNextReviewAt(1, now)!.getTime()).not.toBe(computeNextReviewAt(1, now, cfg)!.getTime());
    expect(computeNextReviewAt(1, now, cfg)!.getTime() - now.getTime()).toBe(2 * H);
    expect(cfg.intervalsMs[2]).toBe(DEFAULT_SRS_CONFIG.intervalsMs[2]);
  });
  it("rifiuta configurazioni non valide", () => {
    expect(() => resolveSrsConfig({ intervalsHours: { "1": -4 } })).toThrow();
  });
});

describe("transizioni", () => {
  it("applyReview marca bruciato e superato", () => {
    const t = applyReview(8, ok, now);
    expect(t).toMatchObject({ previousStage: 8, nextStage: 9, burned: true, passed: true, nextReviewAt: null });
  });
  it("applyReview con errore non è superato", () => {
    expect(applyReview(4, { meaningIncorrect: 0, readingIncorrect: 1 }, now).passed).toBe(false);
  });
  it("lezione → Apprendista 1, solo dallo stadio 0", () => {
    expect(applyLessonCompletion(0, now).nextStage).toBe(1);
    expect(() => applyLessonCompletion(1, now)).toThrow();
  });
  it("ristudio di un bruciato", () => {
    expect(applyResurrection(9, now).nextStage).toBe(1);
    expect(applyResurrection(9, now, resolveSrsConfig({ resurrectStage: 5 })).nextStage).toBe(5);
    expect(() => applyResurrection(7, now)).toThrow();
  });
});

describe("applyMarkKnown", () => {
  it("distribuisce le scadenze in modo stabile entro l'intervallo", () => {
    const a = applyMarkKnown(7, "subj-a", now);
    const a2 = applyMarkKnown(7, "subj-a", now);
    expect(a.nextReviewAt).toEqual(a2.nextReviewAt);
    const dues = Array.from({ length: 200 }, (_, i) => applyMarkKnown(7, `k${i}`, now).nextReviewAt!.getTime());
    const min = Math.min(...dues);
    const max = Math.max(...dues);
    expect(min).toBeGreaterThanOrEqual(now.getTime() + 5 * H);
    expect(max).toBeLessThanOrEqual(now.getTime() + 30 * 24 * H);
    expect(max - min).toBeGreaterThan(20 * 24 * H); // effettivamente distribuite
  });
  it("Bruciato senza scadenza; vieta stadi sotto Guru", () => {
    expect(applyMarkKnown(9, "x", now)).toEqual({ nextStage: 9, nextReviewAt: null, burned: true });
    expect(() => applyMarkKnown(3, "x", now)).toThrow();
  });
  it("stableFraction è in [0,1)", () => {
    for (const k of ["", "a", "識", "kanji:識"]) {
      const f = stableFraction(k);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});
