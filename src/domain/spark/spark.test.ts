import { describe, expect, it } from "vitest";
import {
  buildOptions,
  chooseDistractors,
  displayReading,
  maskFirst,
  pickSparkSubject,
  seededRng,
  sparkReason,
  sparkSlot,
  type SparkPoolItem,
} from "./spark";

const TZ = "Europe/Rome";
const now = new Date("2026-11-11T09:30:00Z"); // 10:30 a Roma

function item(over: Partial<SparkPoolItem> & { id: string }): SparkPoolItem {
  return { type: "kanji", stage: 5, markedKnown: false, incorrect: 0, total: 0, nextReviewAt: null, lessonCompletedAt: null, missedInSpark: false, ...over };
}

describe("fasce della giornata", () => {
  it("divide il giorno in mattina, pomeriggio e sera nel fuso dell'utente", () => {
    expect(sparkSlot(new Date("2026-11-11T09:30:00Z"), TZ).id).toBe("2026-11-11:mattina");
    expect(sparkSlot(new Date("2026-11-11T11:00:00Z"), TZ).id).toBe("2026-11-11:pomeriggio");
    expect(sparkSlot(new Date("2026-11-11T17:00:00Z"), TZ).id).toBe("2026-11-11:sera");
  });

  it("assegna le ore piccole alla sera del giorno prima", () => {
    const slot = sparkSlot(new Date("2026-11-12T01:00:00Z"), TZ); // 02:00 del 12 a Roma
    expect(slot.id).toBe("2026-11-11:sera");
    expect(slot.startsAt.toISOString()).toBe("2026-11-11T17:00:00.000Z");
  });

  it("l'inizio della fascia precede sempre l'istante corrente", () => {
    for (let h = 0; h < 24; h++) {
      const t = new Date(Date.UTC(2026, 10, 11, h, 20));
      const slot = sparkSlot(t, TZ);
      expect(slot.startsAt.getTime()).toBeLessThanOrEqual(t.getTime());
      expect(t.getTime() - slot.startsAt.getTime()).toBeLessThan(11 * 3600_000);
    }
  });
});

describe("casualità deterministica", () => {
  it("stesso seme, stessa sequenza; seme diverso, sequenza diversa", () => {
    const a = seededRng("u1:2026-11-11:mattina:0");
    const b = seededRng("u1:2026-11-11:mattina:0");
    const c = seededRng("u1:2026-11-11:mattina:1");
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("scelta del soggetto", () => {
  it("classifica il motivo dello stimolo", () => {
    expect(sparkReason(item({ id: "a", missedInSpark: true, incorrect: 5, total: 6 }), now).reason).toBe("retry");
    expect(sparkReason(item({ id: "a", incorrect: 2, total: 6 }), now).reason).toBe("weak");
    expect(sparkReason(item({ id: "a", lessonCompletedAt: new Date(now.getTime() - 3600_000), stage: 1 }), now).reason).toBe("fresh");
    expect(sparkReason(item({ id: "a", nextReviewAt: new Date(now.getTime() + 2 * 3600_000) }), now).reason).toBe("due");
    expect(sparkReason(item({ id: "a", stage: 9 }), now).reason).toBe("burned");
    expect(sparkReason(item({ id: "a", stage: 9, markedKnown: true }), now).reason).toBe("known");
    expect(sparkReason(item({ id: "a", nextReviewAt: new Date(now.getTime() + 90 * 3600_000) }), now).reason).toBe("random");
  });

  it("restituisce null con un insieme vuoto", () => {
    expect(pickSparkSubject([], seededRng("x"), now)).toBeNull();
  });

  it("evita gli elementi già usciti finché ne restano altri", () => {
    const pool = [item({ id: "a" }), item({ id: "b" })];
    for (let i = 0; i < 20; i++) expect(pickSparkSubject(pool, seededRng(`s${i}`), now, new Set(["a"]))!.item.id).toBe("b");
    expect(pickSparkSubject(pool, seededRng("s"), now, new Set(["a", "b"]))).not.toBeNull();
  });

  it("privilegia i punti deboli e limita la quota degli elementi dati per noti", () => {
    const known = Array.from({ length: 500 }, (_, i) => item({ id: `k${i}`, stage: 9, markedKnown: true }));
    const studied = [item({ id: "weak", incorrect: 4, total: 8 }), item({ id: "plain" })];
    const counts = { known: 0, weak: 0, plain: 0 };
    for (let i = 0; i < 2000; i++) {
      const id = pickSparkSubject([...known, ...studied], seededRng(`seed-${i}`), now)!.item.id;
      if (id === "weak") counts.weak++;
      else if (id === "plain") counts.plain++;
      else counts.known++;
    }
    expect(counts.known / 2000).toBeLessThan(0.3);
    expect(counts.weak).toBeGreaterThan(counts.plain * 2);
  });
});

describe("opzioni", () => {
  it("scarta i distrattori uguali a una risposta corretta o tra loro", () => {
    const d = chooseDistractors(["Sole", "giorno", "luna", "luna", "acqua", "", "fuoco"], ["giorno", "sole"], seededRng("d"));
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    expect(d).not.toContain("Sole");
    expect(d).not.toContain("giorno");
    expect(d).not.toContain("");
  });

  it("mescola le opzioni tenendo traccia di quella corretta", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const { options, correctIndex } = buildOptions("giusta", ["a", "b", "c"], false, seededRng(`o${i}`));
      expect(options).toHaveLength(4);
      expect(options[correctIndex]!.label).toBe("giusta");
      seen.add(correctIndex);
    }
    expect(seen.size).toBe(4);
  });
});

describe("testi", () => {
  it("maschera solo la prima occorrenza", () => {
    expect(maskFirst("知識", "識")).toBe("知＿");
    expect(maskFirst("日曜日", "日")).toBe("＿曜日");
    expect(maskFirst("知識", "語")).toBeNull();
  });

  it("mostra on'yomi in katakana e kun'yomi senza segni", () => {
    expect(displayReading("しき", "onyomi")).toBe("シキ");
    expect(displayReading("た.べる", "kunyomi")).toBe("たべる");
    expect(displayReading("-び", "kunyomi")).toBe("び");
    expect(displayReading("ちしき", "vocabulary")).toBe("ちしき");
  });
});
