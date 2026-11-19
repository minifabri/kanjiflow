import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLANK, grammarFileSchema } from "./content";
import { buildExercise, shuffleOrder, SLOT, STAR } from "./exercise";
import { parseMarkup, plainText } from "../reading/markup";

describe("esercizi di grammatica", () => {
  it("scelta: la soluzione è la frase con la risposta al posto del segnaposto", () => {
    const e = buildExercise(
      { kind: "choice", prompt: `{海|うみ}で${BLANK}ことがない。`, choices: ["{泳|およ}ぐ", "{泳|およ}いだ", "{泳|およ}いで", "{泳|およ}ぎ"], answer: 1, it: "x", explanation: "y" },
      "seed",
    );
    expect(e.answerIndex).toBe(1);
    expect(plainText(parseMarkup(e.solution))).toBe("海で泳いだことがない。");
  });

  it("scelta: rifiuta frasi senza segnaposto o con più di uno", () => {
    const base = { kind: "choice" as const, choices: ["a", "b", "c", "d"], answer: 0, it: "x", explanation: "y" };
    expect(() => buildExercise({ ...base, prompt: "なにもない。" }, "s")).toThrow();
    expect(() => buildExercise({ ...base, prompt: `${BLANK}と${BLANK}` }, "s")).toThrow();
  });

  it("riordino: mescola i pezzi e chiede quello che va alla stella", () => {
    const source = { kind: "order" as const, before: "A", pieces: ["1", "2", "3", "4"], star: 2, after: "Z", it: "x", explanation: "y" };
    const e = buildExercise(source, "seed");
    expect([...e.choices].sort()).toEqual(["1", "2", "3", "4"]);
    expect(e.choices).not.toEqual(source.pieces);
    expect(e.choices[e.answerIndex]).toBe("3");
    expect(e.prompt).toBe(`A ${SLOT} ${SLOT} ${STAR} ${SLOT} Z`);
    expect(e.solution).toBe("A1234Z");
    // Deterministico: lo stesso seme dà lo stesso ordine a ogni import.
    expect(buildExercise(source, "seed").choices).toEqual(e.choices);
  });

  it("la permutazione non è mai l'identità", () => {
    for (let i = 0; i < 500; i++) {
      const order = shuffleOrder(`s${i}`);
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
      expect(order).not.toEqual([0, 1, 2, 3]);
    }
  });
});

describe("punti grammaticali versionati", () => {
  const dir = path.resolve(__dirname, "../../../data/curated/grammar");
  const points = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => grammarFileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))).points);

  it("hanno slug unici e coerenti con il livello", () => {
    expect(new Set(points.map((p) => p.slug)).size).toBe(points.length);
    for (const p of points) expect(p.slug.startsWith(p.level.toLowerCase() + "-")).toBe(true);
  });

  it("ogni esercizio si costruisce e ogni kanji è annotato", () => {
    for (const p of points) {
      const texts = [p.title, p.structure, ...p.examples.map((e) => e.ja)];
      for (const [i, source] of p.exercises.entries()) {
        const e = buildExercise(source, `${p.slug}:${i}`);
        texts.push(e.prompt, e.solution, ...e.choices);
        expect(new Set(e.choices).size, `${p.slug}:${i} risposte ripetute`).toBe(4);
      }
      for (const text of texts) expect(() => parseMarkup(text), `${p.slug}: ${text.slice(0, 30)}`).not.toThrow();
    }
  });

  it("ogni punto ha entrambi i formati d'esercizio", () => {
    for (const p of points) expect(new Set(p.exercises.map((e) => e.kind)), p.slug).toEqual(new Set(["choice", "order"]));
  });

  it("la risposta corretta non sta sempre nella stessa posizione", () => {
    const counts = [0, 0, 0, 0];
    for (const p of points) for (const [i, source] of p.exercises.entries()) counts[buildExercise(source, `${p.slug}:${i}`).answerIndex]!++;
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) expect(c / total).toBeGreaterThan(0.15);
  });
});
