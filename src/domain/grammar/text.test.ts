import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grammarFileSchema } from "./content";
import { blankMarkers, grammarTextFileSchema, grammarTextSchema, splitBlanks } from "./text";
import { parseMarkup, plainText } from "../reading/markup";

const base = {
  slug: "n3-prova",
  level: "N3" as const,
  title: "{試験|しけん}",
  titleIt: "Prova",
  translation: ["a", "b"],
  blanks: [1, 2, 3, 4].map(() => ({ point: null, choices: ["a", "b", "c", "d"], answer: 0, explanation: "x" })),
};

describe("segnaposto dei testi", () => {
  it("elenca i numeri in ordine di comparsa, tra i paragrafi", () => {
    expect(blankMarkers(["あ［1］い［2］", "う［3］"])).toEqual([1, 2, 3]);
    expect(blankMarkers(["なし"])).toEqual([]);
  });

  it("accetta segnaposto da 1 a n, una volta sola e in ordine", () => {
    expect(grammarTextSchema.safeParse({ ...base, body: ["あ［1］い［2］", "う［3］え［4］"] }).success).toBe(true);
  });

  it("rifiuta segnaposto mancanti, ripetuti o fuori ordine", () => {
    const bad = [
      ["あ［1］［2］［3］", "え"], // manca ［4］
      ["あ［1］［2］［2］［4］", "え"], // ［2］ ripetuto
      ["あ［2］［1］［3］［4］", "え"], // fuori ordine
      ["あ［1］［2］［3］［4］［5］", "え"], // uno spazio in più
    ];
    for (const body of bad) expect(grammarTextSchema.safeParse({ ...base, body }).success, body.join("|")).toBe(false);
  });

  it("rifiuta una traduzione con un numero di paragrafi diverso dal testo", () => {
    expect(grammarTextSchema.safeParse({ ...base, body: ["あ［1］［2］［3］［4］"] }).success).toBe(false);
  });

  it("spezza i segmenti in testo e spazi, senza toccare le parole annotate", () => {
    const parts = splitBlanks(parseMarkup("{私|わたし}は［1］へ{行|い}き［2］。"));
    expect(parts.map((p) => (p.kind === "blank" ? `#${p.number}` : "t" in p.segment ? p.segment.t : p.segment.b))).toEqual(["私", "は", "#1", "へ", "行", "き", "#2", "。"]);
  });

  it("un paragrafo senza spazi resta invariato", () => {
    const segments = parseMarkup("{今日|きょう}は{晴|は}れ。");
    expect(splitBlanks(segments).map((p) => (p.kind === "segment" ? p.segment : null))).toEqual(segments);
  });
});

describe("testi con spazi vuoti versionati", () => {
  const dir = path.resolve(__dirname, "../../../data/curated/grammar-texts");
  const texts = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => grammarTextFileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))).texts);
  const pointDir = path.resolve(__dirname, "../../../data/curated/grammar");
  const points = new Map(
    readdirSync(pointDir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => grammarFileSchema.parse(JSON.parse(readFileSync(path.join(pointDir, f), "utf8"))).points)
      .map((p) => [p.slug, p.level]),
  );

  it("hanno slug unici e coerenti con il livello", () => {
    expect(new Set(texts.map((t) => t.slug)).size).toBe(texts.length);
    for (const t of texts) expect(t.slug.startsWith(t.level.toLowerCase() + "-")).toBe(true);
  });

  it("ogni kanji è annotato, in titolo, testo e risposte", () => {
    for (const t of texts) {
      const all = [t.title, ...t.body, ...t.blanks.flatMap((b) => b.choices)];
      for (const text of all) expect(() => parseMarkup(text), `${t.slug}: ${text.slice(0, 30)}`).not.toThrow();
    }
  });

  it("le quattro risposte di uno spazio sono diverse", () => {
    for (const t of texts) for (const [i, b] of t.blanks.entries()) expect(new Set(b.choices).size, `${t.slug} ［${i + 1}］`).toBe(4);
  });

  it("gli spazi rimandano a punti grammaticali che esistono", () => {
    for (const t of texts) for (const [i, b] of t.blanks.entries()) if (b.point) expect(points.has(b.point), `${t.slug} ［${i + 1}］ → ${b.point}`).toBe(true);
  });

  it("un testo non verifica due volte lo stesso punto", () => {
    for (const t of texts) {
      const used = t.blanks.flatMap((b) => (b.point ? [b.point] : []));
      expect(new Set(used).size, t.slug).toBe(used.length);
    }
  });

  it("la risposta corretta non sta sempre nella stessa posizione", () => {
    const counts = [0, 0, 0, 0];
    for (const t of texts) for (const b of t.blanks) counts[b.answer]!++;
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) expect(c / total, counts.join(",")).toBeGreaterThan(0.15);
  });

  it("la frase completa non resta con segnaposto: ogni paragrafo ha almeno un testo leggibile", () => {
    for (const t of texts) for (const p of t.body) expect(plainText(parseMarkup(p)).replace(/［\d］/g, "").length).toBeGreaterThan(5);
  });
});
