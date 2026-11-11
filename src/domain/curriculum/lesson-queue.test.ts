import { describe, expect, it } from "vitest";
import { buildLessonQueue, lessonAllowance, type CandidateSubject, type ProgressInfo } from "./lesson-queue";

const S: CandidateSubject[] = [
  { id: "r1", type: "radical", lessonOrder: 10, band: null, componentIds: [] },
  { id: "k5", type: "kanji", lessonOrder: 20, band: "N5", componentIds: ["r1"] },
  { id: "k3", type: "kanji", lessonOrder: 30, band: "N3", componentIds: ["r1"] },
  { id: "k4", type: "kanji", lessonOrder: 40, band: "N4", componentIds: [] },
  { id: "v3", type: "vocabulary", lessonOrder: 35, band: "N3", componentIds: ["k3"] },
  { id: "v5", type: "vocabulary", lessonOrder: 25, band: "N5", componentIds: ["k5"] },
];
const p = (stage: number, markedKnown = false): ProgressInfo => ({ stage, markedKnown, suspended: false });

describe("percorso guidato", () => {
  it("parte dai radicali; i kanji si sbloccano a Guru dei radicali", () => {
    expect(buildLessonQueue(S, new Map(), { path: "guided", targetBand: "N3" }).map((s) => s.id)).toEqual(["r1", "k4"]);
    const after = buildLessonQueue(S, new Map([["r1", p(5)]]), { path: "guided", targetBand: "N3" });
    expect(after.map((s) => s.id)).toEqual(["k5", "k3", "k4"]);
  });
  it("un vocabolo richiede i kanji superati", () => {
    const q = buildLessonQueue(S, new Map([["r1", p(5)], ["k5", p(4)]]), { path: "guided", targetBand: "N3" });
    expect(q.map((s) => s.id)).not.toContain("v5");
    const q2 = buildLessonQueue(S, new Map([["r1", p(5)], ["k5", p(5)]]), { path: "guided", targetBand: "N3" });
    expect(q2.map((s) => s.id)).toContain("v5");
  });
});

describe("percorso JLPT", () => {
  it("niente radicali, kanji subito disponibili, fasce inferiori prima", () => {
    const q = buildLessonQueue(S, new Map(), { path: "jlpt", targetBand: "N3" });
    expect(q.map((s) => s.id)).toEqual(["k5", "k4", "k3"]);
  });
  it("con N5/N4 conosciuti, restano N3 e i vocaboli dei kanji conosciuti", () => {
    const prog = new Map([["k5", p(7, true)], ["k4", p(7, true)], ["v5", p(7, true)]]);
    expect(buildLessonQueue(S, prog, { path: "jlpt", targetBand: "N3" }).map((s) => s.id)).toEqual(["k3"]);
    prog.set("k3", p(5));
    expect(buildLessonQueue(S, prog, { path: "jlpt", targetBand: "N3" }).map((s) => s.id)).toEqual(["v3"]);
  });
  it("rispetta la fascia obiettivo e gli elementi saltati", () => {
    expect(buildLessonQueue(S, new Map(), { path: "jlpt", targetBand: "N5" }).map((s) => s.id)).toEqual(["k5"]);
    expect(
      buildLessonQueue(S, new Map(), { path: "jlpt", targetBand: "N3", skipped: new Set(["k4"]) }).map((s) => s.id),
    ).toEqual(["k5", "k3"]);
  });
});

describe("percorso personalizzato", () => {
  it("segue l'ordine della raccolta senza prerequisiti", () => {
    const q = buildLessonQueue(S, new Map([["v3", p(1)]]), { path: "custom", targetBand: "N3", collectionOrder: ["v3", "k3", "v5"] });
    expect(q.map((s) => s.id)).toEqual(["k3", "v5"]);
  });
});

describe("lessonAllowance", () => {
  it("limita per giorno e per carico Apprendista", () => {
    expect(lessonAllowance({ dailyLessonLimit: 15, lessonsCompletedToday: 5, maxApprenticeItems: 100, apprenticeCount: 20 })).toBe(10);
    expect(lessonAllowance({ dailyLessonLimit: 15, lessonsCompletedToday: 0, maxApprenticeItems: 100, apprenticeCount: 97 })).toBe(3);
    expect(lessonAllowance({ dailyLessonLimit: 15, lessonsCompletedToday: 20, maxApprenticeItems: 100, apprenticeCount: 0 })).toBe(0);
  });
});

describe("priorità chieste dall'utente", () => {
  it("precedono la coda del percorso, nell'ordine della richiesta e senza prerequisiti", () => {
    const q = buildLessonQueue(S, new Map(), { path: "jlpt", targetBand: "N4", priority: ["k3", "v3"] });
    expect(q.map((s) => s.id)).toEqual(["k3", "v3", "k5", "k4"]);
  });
  it("ignorano i soggetti già iniziati, saltati o inesistenti e non creano duplicati", () => {
    const q = buildLessonQueue(S, new Map([["k3", p(1)]]), {
      path: "jlpt",
      targetBand: "N3",
      priority: ["k3", "k4", "k4", "zz", "k5"],
      skipped: new Set(["k5"]),
    });
    expect(q.map((s) => s.id)).toEqual(["k4"]);
  });
  it("valgono anche nel percorso personalizzato", () => {
    const q = buildLessonQueue(S, new Map(), { path: "custom", targetBand: "N3", collectionOrder: ["k5"], priority: ["k3"] });
    expect(q.map((s) => s.id)).toEqual(["k3", "k5"]);
  });
});
