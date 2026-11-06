import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { segmentReading, type KanjiReadings } from "./reading-segmentation";
import { vocabMnemonics, type MnemonicKanji } from "./vocab-mnemonic";
import { datasetSchema } from "./dataset";

const K: Record<string, MnemonicKanji> = {
  学: { onyomi: ["がく"], kunyomi: ["まな.ぶ"], primaryReadings: ["がく"], meaning: "studio" },
  校: { onyomi: ["こう"], kunyomi: [], primaryReadings: ["こう"], meaning: "scuola" },
  手: { onyomi: ["しゅ"], kunyomi: ["て", "て-"], primaryReadings: ["て"], meaning: "mano" },
  紙: { onyomi: ["し"], kunyomi: ["かみ"], primaryReadings: ["かみ"], meaning: "carta" },
  出: { onyomi: ["しゅつ", "すい"], kunyomi: ["で.る", "だ.す"], primaryReadings: ["しゅつ"], meaning: "uscire" },
  発: { onyomi: ["はつ", "ほつ"], kunyomi: [], primaryReadings: ["はつ"], meaning: "partenza" },
  人: { onyomi: ["じん", "にん"], kunyomi: ["ひと", "-り", "-と"], primaryReadings: ["じん"], meaning: "persona" },
  大: { onyomi: ["だい", "たい"], kunyomi: ["おお-", "おお.きい"], primaryReadings: ["だい"], meaning: "grande" },
  食: { onyomi: ["しょく", "じき"], kunyomi: ["く.う", "た.べる"], primaryReadings: ["た.べる"], meaning: "mangiare" },
  物: { onyomi: ["ぶつ", "もつ"], kunyomi: ["もの"], primaryReadings: ["ぶつ"], meaning: "cosa" },
  語: { onyomi: ["ご"], kunyomi: ["かた.る", "かた.らう"], primaryReadings: ["ご"], meaning: "parola" },
  切: { onyomi: ["せつ", "さい"], kunyomi: ["き.る", "き.れる"], primaryReadings: ["き.る"], meaning: "tagliare" },
};
const map = new Map<string, KanjiReadings & MnemonicKanji>(Object.entries(K));
const readings = (w: string, r: string) => segmentReading(w, r, map)?.map((s) => s.reading).join("|");

describe("segmentReading", () => {
  it("scompone i composti on'yomi con raddoppiamento", () => {
    const seg = segmentReading("学校", "がっこう", map)!;
    expect(seg.map((s) => s.reading)).toEqual(["がっ", "こう"]);
    expect(seg[0]).toMatchObject({ base: "がく", readingType: "onyomi", changes: ["sokuon"] });
  });

  it("riconosce rendaku e h→p dopo っ", () => {
    expect(segmentReading("手紙", "てがみ", map)![1]).toMatchObject({ base: "かみ", reading: "がみ", changes: ["rendaku"] });
    const s = segmentReading("出発", "しゅっぱつ", map)!;
    expect(s[1]).toMatchObject({ base: "はつ", reading: "ぱつ", changes: ["handakuten"] });
  });

  it("gestisce 々, okurigana scritta e okurigana incorporata", () => {
    expect(readings("人々", "ひとびと")).toBe("ひと|びと");
    expect(segmentReading("人々", "ひとびと", map)![1]).toMatchObject({ repeat: true, changes: ["rendaku"] });
    expect(readings("食べる", "たべる")).toBe("た|べ|る");
    expect(segmentReading("物語", "ものがたり", map)![1]).toMatchObject({ base: "かたる", changes: ["okurigana", "rendaku"] });
    expect(segmentReading("切手", "きって", map)![0]).toMatchObject({ reading: "きっ", changes: ["okurigana", "sokuon"] });
  });

  it("non inventa scomposizioni per letture speciali", () => {
    expect(segmentReading("大人", "おとな", map)).toBeNull();
  });

  it("accetta la lettura in katakana", () => {
    expect(readings("学校", "ガッコウ")).toBe("がっ|こう");
  });

  it("non attribuisce il rendaku al primo kanji", () => {
    expect(segmentReading("紙", "がみ", map)).toBeNull();
  });
});

describe("vocabMnemonics", () => {
  it("spiega significato e lettura dai kanji componenti", () => {
    const m = vocabMnemonics("学校", "がっこう", "scuola", map);
    expect(m.meaning).toContain("**学** «studio» + **校** «scuola» → **scuola**");
    expect(m.reading).toContain("学 がく → **がっ**");
    expect(m.reading).toContain("on'yomi");
  });

  it("dichiara le letture speciali senza inventare legami", () => {
    const m = vocabMnemonics("大人", "おとな", "adulto", map);
    expect(m.reading).toMatch(/lettura speciale o irregolare/);
  });

  it("descrive l'okurigana dei verbi", () => {
    const m = vocabMnemonics("食べる", "たべる", "mangiare", map);
    expect(m.meaning).toContain("con il kana べる");
    expect(m.reading).toContain("食 **た**");
    expect(m.reading).toContain("べる è l'okurigana");
  });

  it("segnala le letture miste", () => {
    expect(vocabMnemonics("手紙", "てがみ", "lettera", map).reading).toMatch(/kun'yomi/);
  });
});

describe("dataset versionato", () => {
  const dataset = datasetSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/dataset/kanjiflow-n5-n3.json"), "utf8")));

  it("ogni kanji N4 e N3 ha un mnemonico di significato e uno di lettura che cita la lettura studiata", () => {
    const toKata = (s: string) => [...s].map((c) => (c >= "ぁ" && c <= "ゖ" ? String.fromCodePoint(c.codePointAt(0)! + 0x60) : c)).join("");
    const n3 = dataset.subjects.filter((s) => s.type === "kanji" && s.classifications.some((c) => c.system === "jlpt-waller" && (c.value === "N3" || c.value === "N4")));
    expect(n3.length).toBeGreaterThan(500);
    for (const s of n3) {
      const reading = s.mnemonics.find((m) => m.type === "reading")?.content ?? "";
      expect(s.mnemonics.find((m) => m.type === "meaning"), s.characters).toBeDefined();
      const forms = s.readings.filter((r) => r.isPrimary).flatMap((r) => [r.reading, toKata(r.reading)]);
      expect(forms.some((f) => reading.includes(f)), `${s.characters}: ${reading}`).toBe(true);
    }
  });

  it("ogni vocabolo ha mnemonici generati", () => {
    for (const s of dataset.subjects.filter((x) => x.type === "vocabulary")) expect(s.mnemonics).toHaveLength(2);
  });
});
