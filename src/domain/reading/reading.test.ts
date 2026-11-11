import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readingFileSchema } from "./content";
import { buildLinkIndex, countSubjects, inflectsFromPartOfSpeech, linkSegments, type VocabEntry } from "./linking";
import { charCount, isRuby, kanaText, kanjiOf, MarkupError, parseMarkup, plainText, type RubySegment } from "./markup";
import { kanjiState, readability, showFurigana } from "./readability";

describe("markup dei brani", () => {
  it("separa testo e annotazioni", () => {
    const segs = parseMarkup("{私|わたし}は{図書館|としょかん}へ{行|い}きます。");
    expect(segs).toEqual([{ b: "私", r: "わたし" }, { t: "は" }, { b: "図書館", r: "としょかん" }, { t: "へ" }, { b: "行", r: "い" }, { t: "きます。" }]);
    expect(plainText(segs)).toBe("私は図書館へ行きます。");
    expect(kanaText(segs)).toBe("わたしはとしょかんへいきます。");
  });

  it("accetta la forma di dizionario dichiarata", () => {
    expect(parseMarkup("{来|き|来る}ました")[0]).toEqual({ b: "来", r: "き", l: "来る" });
  });

  it("rifiuta kanji senza lettura, letture non in kana e graffe spaiate", () => {
    expect(() => parseMarkup("私は{行|い}く")).toThrow(MarkupError);
    expect(() => parseMarkup("{行|iku}")).toThrow(MarkupError);
    expect(() => parseMarkup("{行|い")).toThrow(MarkupError);
    expect(() => parseMarkup("{いく|いく}")).toThrow(MarkupError);
  });

  it("conta i caratteri senza spazi e ritorni a capo", () => {
    expect(charCount([parseMarkup("{時間|じかん}：{九時|くじ}\n{休|やす}み")])).toBe(7);
  });

  it("estrae i kanji distinti ignorando 々", () => {
    expect(kanjiOf("人々の時間と時々")).toEqual(["人", "時", "間"]);
  });
});

describe("collegamento ai soggetti", () => {
  const v = (id: string, characters: string, reading: string, pos: string[] = ["n"]): VocabEntry => ({
    id,
    characters,
    readings: [reading],
    inflects: inflectsFromPartOfSpeech(pos),
  });
  const index = buildLinkIndex(
    [..."食行図書館買物話考来出高"].map((c) => ({ id: `k:${c}`, characters: c })),
    [
      v("v:食べる", "食べる", "たべる", ["v1"]),
      v("v:行く", "行く", "いく", ["v5k-s"]),
      v("v:行き", "行き", "いき"),
      v("v:図書館", "図書館", "としょかん"),
      v("v:買い物", "買い物", "かいもの"),
      v("v:買う", "買う", "かう", ["v5u"]),
      v("v:物", "物", "もの"),
      v("v:話", "話", "はなし"),
      v("v:話す", "話す", "はなす", ["v5s"]),
      v("v:考え", "考え", "かんがえ"),
      v("v:考える", "考える", "かんがえる", ["v1"]),
      v("v:来る", "来る", "くる", ["vk"]),
      v("v:出", "出", "で"),
      v("v:出る", "出る", "でる", ["v1"]),
      v("v:高い", "高い", "たかい", ["adj-i"]),
      v("v:何とか", "何とか", "なんとか", ["adv"]),
    ],
  );
  const link = (markup: string) => linkSegments(parseMarkup(markup), index).filter(isRuby) as RubySegment[];

  it("collega i kanji presenti nel dataset e ignora gli altri", () => {
    const [seg] = link("{図書館|としょかん}");
    expect(seg!.k).toEqual(["k:図", "k:書", "k:館"]);
    expect(link("{喫茶店|きっさてん}")[0]!.k).toBeUndefined();
  });

  it("riconosce parole intere e forme coniugate dal tema", () => {
    expect(link("{図書館|としょかん}で")[0]!.v).toBe("v:図書館");
    expect(link("{食|た}べました")[0]!.v).toBe("v:食べる");
    expect(link("{高|たか}かった")[0]!.v).toBe("v:高い");
    expect(link("{行|い}って")[0]!.v).toBe("v:行く");
  });

  it("una parola può coprire più annotazioni; vince la corrispondenza più lunga", () => {
    const segs = link("{買|か}い{物|もの}に{行|い}く");
    expect(segs.map((s) => s.v)).toEqual(["v:買い物", "v:買い物", "v:行く"]);
    expect(link("{買|か}って")[0]!.v).toBe("v:買う");
  });

  it("tra nome e verbo decide ciò che segue", () => {
    expect(link("{行|い}きます")[0]!.v).toBe("v:行く");
    expect(link("{考|かんが}えた")[0]!.v).toBe("v:考える");
    expect(link("{考|かんが}えを")[0]!.v).toBe("v:考え");
    expect(link("{出|で}ます")[0]!.v).toBe("v:出る");
    expect(link("{話|はな}して")[0]!.v).toBe("v:話す");
    expect(link("{話|はなし}を")[0]!.v).toBe("v:話");
  });

  it("non scambia una lettura diversa per la stessa parola", () => {
    expect(link("{行|おこな}う")[0]!.v).toBeUndefined();
    expect(link("{来|き}ます")[0]!.v).toBeUndefined(); // irregolare: serve la forma dichiarata
    expect(link("{来|き|来る}ます")[0]!.v).toBe("v:来る");
  });

  it("le parole che non si coniugano non si riconoscono dal tema", () => {
    expect(link("{何|なん}と{言|い}う")[0]!.v).toBeUndefined();
  });

  it("conta le occorrenze, una per parola", () => {
    const counts = countSubjects([linkSegments(parseMarkup("{買|か}い{物|もの}と{買|か}い{物|もの}"), index)]);
    expect(counts.get("v:買い物")).toBe(2);
    expect(counts.get("k:買")).toBe(2);
  });
});

describe("leggibilità e furigana adattivo", () => {
  const p = (stage: number, markedKnown = false) => ({ stage, markedKnown, suspended: false });
  const progress = new Map([
    ["a", p(5)],
    ["b", p(2)],
    ["c", p(0, true)],
  ]);

  it("classifica i kanji come conosciuti, in apprendimento o nuovi", () => {
    expect(kanjiState(progress.get("a"))).toBe("known");
    expect(kanjiState(progress.get("b"))).toBe("learning");
    expect(kanjiState(progress.get("c"))).toBe("known");
    expect(kanjiState(undefined)).toBe("new");
  });

  it("calcola la percentuale di kanji conosciuti", () => {
    expect(readability(["a", "b", "c", "d"], progress)).toEqual({ total: 4, known: 2, learning: 1, missing: 1, percent: 50 });
    expect(readability([], progress).percent).toBe(100);
  });

  it("mostra il furigana solo dove serve", () => {
    expect(showFurigana("adaptive", ["known", "known"], 2)).toBe(false);
    expect(showFurigana("adaptive", ["known", "learning"], 2)).toBe(true);
    expect(showFurigana("adaptive", ["known"], 2)).toBe(true); // un kanji fuori dal percorso
    expect(showFurigana("always", ["known"], 1)).toBe(true);
    expect(showFurigana("never", ["new"], 1)).toBe(false);
  });
});

describe("brani versionati", () => {
  const dir = path.resolve(__dirname, "../../../data/curated/reading");
  const passages = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => readingFileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))).passages);

  it("hanno slug unici e coerenti con il livello", () => {
    expect(new Set(passages.map((p) => p.slug)).size).toBe(passages.length);
    for (const p of passages) expect(p.slug.startsWith(p.level.toLowerCase() + "-")).toBe(true);
  });

  it("ogni kanji è annotato, in titolo, testo, domande e risposte", () => {
    for (const p of passages) {
      const all = [p.title, ...p.body, ...p.questions.flatMap((q) => [q.prompt, ...q.choices])];
      for (const text of all) expect(() => parseMarkup(text), `${p.slug}: ${text.slice(0, 30)}`).not.toThrow();
    }
  });

  it("le risposte di una domanda sono tutte diverse", () => {
    for (const p of passages) for (const q of p.questions) expect(new Set(q.choices).size, p.slug).toBe(4);
  });

  it("la risposta corretta non sta sempre nella stessa posizione", () => {
    const positions = new Set(passages.flatMap((p) => p.questions.map((q) => q.answer)));
    expect(positions.size).toBe(4);
  });
});
