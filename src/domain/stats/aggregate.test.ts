import { describe, expect, it } from "vitest";
import { bucketize, forecastByDay, median, parseRange, percent, responseHistogram, topConfusions } from "./aggregate";

const TZ = "Europe/Rome";
const now = new Date("2026-11-19T15:00:00Z");
const at = (iso: string, isCorrect = true) => ({ at: new Date(iso), isCorrect });

describe("intervallo", () => {
  it("accetta solo 7, 30 e 90 giorni, con 30 come predefinito", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(90)).toBe(90);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});

describe("gruppi per giorno e per settimana", () => {
  it("copre gli ultimi n giorni fino a oggi, nel fuso dell'utente", () => {
    const b = bucketize([at("2026-11-19T10:00:00Z"), at("2026-11-19T11:00:00Z", false), at("2026-11-13T09:00:00Z")], 7, TZ, now);
    expect(b).toHaveLength(7);
    expect(b[0]!.key).toBe("2026-11-13");
    expect(b.at(-1)).toMatchObject({ key: "2026-11-19", endKey: "2026-11-19", total: 2, correct: 1 });
    expect(b[0]).toMatchObject({ total: 1, correct: 1 });
  });

  it("usa il giorno locale: le 23:30 UTC del 18 sono già il 19 a Roma", () => {
    const b = bucketize([at("2026-11-18T23:30:00Z")], 7, TZ, now);
    expect(b.at(-1)!.total).toBe(1);
  });

  it("ignora le risposte fuori intervallo", () => {
    expect(bucketize([at("2026-11-01T10:00:00Z")], 7, TZ, now).every((x) => x.total === 0)).toBe(true);
  });

  it("oltre 30 giorni raggruppa per settimana, l'ultima termina oggi", () => {
    const b = bucketize([at("2026-11-19T10:00:00Z"), at("2026-11-13T10:00:00Z")], 90, TZ, now);
    expect(b).toHaveLength(13);
    expect(b.at(-1)).toMatchObject({ key: "2026-11-13", endKey: "2026-11-19", total: 2 });
  });
});

describe("misure", () => {
  it("percentuale nulla quando non ci sono dati", () => {
    expect(percent(0, 0)).toBeNull();
    expect(percent(2, 3)).toBe(67);
  });

  it("mediana", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(3);
  });

  it("istogramma dei tempi di risposta, con i valori estremi nell'ultima fascia", () => {
    const h = responseHistogram([500, 1999, 2000, 25000, 999999]);
    expect(h.map((x) => x.count)).toEqual([2, 1, 0, 0, 0, 2]);
  });
});

describe("errori ripetuti", () => {
  it("raggruppa stessa risposta sullo stesso elemento e ignora quelle vuote", () => {
    const top = topConfusions([
      { subjectId: "a", questionType: "reading", answer: "せい" },
      { subjectId: "a", questionType: "reading", answer: "せい " },
      { subjectId: "a", questionType: "meaning", answer: "せい" },
      { subjectId: "b", questionType: "reading", answer: "" },
    ]);
    expect(top[0]).toMatchObject({ subjectId: "a", questionType: "reading", answer: "せい", count: 2 });
    expect(top).toHaveLength(2);
  });
});

describe("carico previsto", () => {
  it("conta per giorno; gli arretrati vanno a oggi, oltre l'orizzonte si ignora", () => {
    const f = forecastByDay(
      [new Date("2026-11-10T08:00:00Z"), new Date("2026-11-19T20:00:00Z"), new Date("2026-11-21T08:00:00Z"), new Date("2026-12-30T08:00:00Z")],
      7,
      TZ,
      now,
    );
    expect(f.map((x) => x.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(f[0]!.key).toBe("2026-11-19");
  });
});
