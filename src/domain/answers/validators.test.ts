import { describe, expect, it } from "vitest";
import {
  editDistance,
  kanjidicReadingForms,
  normalizeReadingInput,
  romajiToHiragana,
  validateMeaning,
  validateReading,
  type ExpectedReading,
  type ExpectedMeaning,
} from "./index";

describe("romajiToHiragana", () => {
  it.each([
    ["kanji", "かんじ"],
    ["gakkou", "がっこう"],
    ["kya", "きゃ"],
    ["hon", "ほん"],
    ["honn", "ほん"],
    ["kannnin", "かんにん"],
    ["konnichiha", "こんにちは"],
    ["ken'ichi", "けんいち"],
    ["kenichi", "けにち"],
    ["shimbun", "しんぶん"],
    ["shinbun", "しんぶん"],
    ["SENPAI", "せんぱい"],
    ["ltsu", "っ"],
    ["ra-men", "らーめん"],
  ])("%s → %s", (input, expected) => {
    expect(romajiToHiragana(input)).toBe(expected);
  });
});

describe("normalizeReadingInput", () => {
  it("katakana e mezza larghezza diventano hiragana", () => {
    expect(normalizeReadingInput("シキ").normalized).toBe("しき");
    expect(normalizeReadingInput("ｼｷ").normalized).toBe("しき");
  });
  it("ー si espande nella vocale precedente", () => {
    expect(normalizeReadingInput("コーヒー").normalized).toBe("こおひい");
    expect(normalizeReadingInput("koohii").normalized).toBe("こおひい");
  });
  it("normalizza Unicode (forma decomposta)", () => {
    expect(normalizeReadingInput("が").normalized).toBe("が");
  });
});

describe("kanjidicReadingForms", () => {
  it("accetta parola intera e radice", () => {
    expect(kanjidicReadingForms("か.つ")).toEqual(["かつ", "か"]);
    expect(kanjidicReadingForms("-が.ち")).toEqual(["がち", "が"]);
    expect(kanjidicReadingForms("ショウ")).toEqual(["しょう"]);
  });
});

const shiki: ExpectedReading[] = [
  { reading: "シキ", readingType: "onyomi", isPrimary: true, isAccepted: true },
  { reading: "シ", readingType: "onyomi", isPrimary: false, isAccepted: true },
  { reading: "し.る", readingType: "kunyomi", isPrimary: false, isAccepted: true },
];

describe("validateReading — kanji", () => {
  const q = { subjectType: "kanji" as const, readings: shiki };
  it("accetta la lettura primaria in romaji, hiragana e katakana", () => {
    for (const a of ["shiki", "しき", "シキ", " SHIKI "]) expect(validateReading(a, q).verdict).toBe("correct");
  });
  it("accetta altre letture dello stesso tipo", () => {
    expect(validateReading("shi", q).verdict).toBe("correct");
  });
  it("chiede di riprovare se la lettura è valida ma del tipo sbagliato", () => {
    const v = validateReading("shiru", q);
    expect(v).toMatchObject({ verdict: "retry", reason: "wrong_reading_type", expectedTypes: ["onyomi"] });
  });
  it("rifiuta letture sbagliate", () => {
    expect(validateReading("soku", q).verdict).toBe("incorrect");
  });
  it("input non kana → riprova", () => {
    expect(validateReading("識", q)).toMatchObject({ verdict: "retry", reason: "not_kana" });
    expect(validateReading("", q)).toMatchObject({ verdict: "retry", reason: "empty" });
    expect(validateReading("shik1", q)).toMatchObject({ verdict: "retry", reason: "not_kana" });
  });
});

const r = (reading: string, isPrimary = true): ExpectedReading => ({ reading, readingType: "vocabulary", isPrimary, isAccepted: true });

describe("validateReading — vocaboli", () => {
  it("vocale lunga: こうこう ≠ こおこお, con suggerimento", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("こうこう")] };
    expect(validateReading("kookoo", q)).toMatchObject({ verdict: "incorrect", hint: "long_vowel" });
    expect(validateReading("koukou", q).verdict).toBe("correct");
    expect(validateReading("koko", q)).toMatchObject({ verdict: "incorrect", hint: "long_vowel" });
  });
  it("consonante doppia mancante", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("がっこう")] };
    expect(validateReading("gakou", q)).toMatchObject({ verdict: "incorrect", hint: "sokuon" });
  });
  it("kana piccoli", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("きょう")] };
    expect(validateReading("kiyou", q)).toMatchObject({ verdict: "incorrect", hint: "small_kana" });
    expect(validateReading("kyou", q).verdict).toBe("correct");
  });
  it("ん ambiguo in romaji → riprova senza penalità", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("てんいん")] };
    expect(validateReading("tenin", q)).toMatchObject({ verdict: "retry", reason: "n_ambiguity", suggestion: "てんいん" });
    expect(validateReading("ten'in", q).verdict).toBe("correct");
    expect(validateReading("tennin", q).verdict).toBe("incorrect"); // てんにん è un'altra parola
  });
  it("letture multiple valide", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("きょう"), r("こんにち", false)] };
    expect(validateReading("konnichi", q).verdict).toBe("correct");
  });
  it("una lettura del kanji non vale per il vocabolo", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("ちしき")] };
    expect(validateReading("shiki", q).verdict).toBe("incorrect");
  });
  it("letture in blacklist", () => {
    const q = {
      subjectType: "vocabulary" as const,
      readings: [r("いきる"), { reading: "いける", readingType: "vocabulary" as const, isPrimary: false, isAccepted: false }],
    };
    expect(validateReading("ikeru", q)).toMatchObject({ verdict: "incorrect", outcome: "rejected_reading" });
  });
  it("katakana: コーヒー", () => {
    const q = { subjectType: "vocabulary" as const, readings: [r("コーヒー")] };
    expect(validateReading("koohii", q).verdict).toBe("correct");
    expect(validateReading("ko-hi-", q).verdict).toBe("correct");
    expect(validateReading("コーヒー", q).verdict).toBe("correct");
  });
});

const m = (meaning: string, isPrimary = false, isAccepted = true, language = "it"): ExpectedMeaning => ({
  meaning,
  isPrimary,
  isAccepted,
  language,
});

describe("validateMeaning", () => {
  const base = {
    meanings: [m("conoscenza", true), m("discernimento"), m("knowledge", false, true, "en"), m("sapere")],
    typoTolerance: "conservative" as const,
  };
  it("esatto, sinonimo, maiuscole e spazi", () => {
    expect(validateMeaning("  Conoscenza ", base)).toMatchObject({ verdict: "correct", outcome: "exact" });
    expect(validateMeaning("discernimento", base)).toMatchObject({ verdict: "correct", outcome: "synonym" });
    expect(validateMeaning("KNOWLEDGE", base)).toMatchObject({ verdict: "correct" });
  });
  it("articolo e punteggiatura finale facoltativi", () => {
    expect(validateMeaning("la conoscenza.", base).verdict).toBe("correct");
    expect(validateMeaning("il sapere", base).verdict).toBe("correct");
  });
  it("refusi entro soglia, segnalati", () => {
    expect(validateMeaning("conosceza", base)).toMatchObject({ verdict: "correct", outcome: "typo", matched: "conoscenza" });
    expect(validateMeaning("cnoscenza", base).verdict).toBe("correct"); // lettera mancante
    expect(validateMeaning("gonoscenza", base).verdict).toBe("incorrect"); // prima lettera diversa
    expect(validateMeaning("conscza", base).verdict).toBe("incorrect"); // oltre la soglia
    expect(validateMeaning("conoscenza", { ...base, typoTolerance: "off" }).verdict).toBe("correct");
    expect(validateMeaning("conosceza", { ...base, typoTolerance: "off" }).verdict).toBe("incorrect");
  });
  it("parole corte: nessuna tolleranza in modalità conservativa", () => {
    const q = { meanings: [m("caldo", true)], typoTolerance: "conservative" as const };
    expect(validateMeaning("caldi", q).verdict).toBe("correct"); // 5 lettere → 1 refuso
    const short = { meanings: [m("sole", true)], typoTolerance: "conservative" as const };
    expect(validateMeaning("sale", short).verdict).toBe("incorrect");
  });
  it("protezione semantica: un significato di un altro soggetto non è un refuso", () => {
    const q = { meanings: [m("caldo", true)], typoTolerance: "lenient" as const, otherSubjectMeanings: new Set(["calvo"]) };
    expect(validateMeaning("calvo", q)).toMatchObject({ verdict: "incorrect", outcome: "other_subject" });
  });
  it("accenti", () => {
    const q = { meanings: [m("perché", true)], typoTolerance: "off" as const };
    expect(validateMeaning("perche", q)).toMatchObject({ verdict: "correct", outcome: "accent" });
    expect(validateMeaning("perche'", q).verdict).toBe("incorrect");
    const q2 = { meanings: [m("però", true)], typoTolerance: "off" as const, otherSubjectMeanings: new Set(["pero"]) };
    expect(validateMeaning("pero", q2)).toMatchObject({ verdict: "incorrect", outcome: "other_subject" });
  });
  it("blacklist ha la precedenza", () => {
    const q = { meanings: [m("vivere", true), m("vita", false, false)], typoTolerance: "lenient" as const };
    expect(validateMeaning("vita", q)).toMatchObject({ verdict: "incorrect", outcome: "rejected_meaning" });
  });
  it("parentesi facoltative e 'to' inglese", () => {
    const q = { meanings: [m("svegliarsi (dal sonno)", true), m("to awaken", false, true, "en")], typoTolerance: "off" as const };
    expect(validateMeaning("svegliarsi", q).verdict).toBe("correct");
    expect(validateMeaning("svegliarsi dal sonno", q).verdict).toBe("correct");
    expect(validateMeaning("awaken", q).verdict).toBe("correct");
  });
  it("risposta in giapponese → riprova", () => {
    expect(validateMeaning("しき", base)).toMatchObject({ verdict: "retry", reason: "looks_japanese" });
  });
});

describe("editDistance", () => {
  it("conta trasposizioni come 1", () => {
    expect(editDistance("cane", "cnae")).toBe(1);
    expect(editDistance("gatto", "gatti")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("識別", "知識")).toBe(2);
  });
});
