import { describe, expect, it } from "vitest";
import { initialItemState, isItemComplete, pendingQuestions, recordAttempt, replayAttempts, requiredQuestions } from "./review-state";

describe("requiredQuestions", () => {
  it("radicali solo significato", () => {
    expect(requiredQuestions("radical", true)).toEqual(["meaning"]);
  });
  it("kanji e vocaboli con lettura", () => {
    expect(requiredQuestions("kanji", true)).toEqual(["meaning", "reading"]);
    expect(requiredQuestions("vocabulary", false)).toEqual(["meaning"]);
  });
});

describe("stato del ripasso", () => {
  it("completo solo quando tutte le dimensioni sono corrette", () => {
    let s = initialItemState(["meaning", "reading"]);
    s = recordAttempt(s, { questionType: "meaning", isCorrect: true });
    expect(isItemComplete(s)).toBe(false);
    expect(pendingQuestions(s)).toEqual(["reading"]);
    s = recordAttempt(s, { questionType: "reading", isCorrect: false });
    s = recordAttempt(s, { questionType: "reading", isCorrect: true });
    expect(isItemComplete(s)).toBe(true);
    expect(s.readingIncorrect).toBe(1);
    expect(s.meaningIncorrect).toBe(0);
  });

  it("un radicale non accetta domande di lettura", () => {
    expect(() => recordAttempt(initialItemState(["meaning"]), { questionType: "reading", isCorrect: true })).toThrow();
  });

  it("ignora tentativi dopo la risposta corretta", () => {
    let s = initialItemState(["meaning"]);
    s = recordAttempt(s, { questionType: "meaning", isCorrect: true });
    expect(recordAttempt(s, { questionType: "meaning", isCorrect: false })).toBe(s);
  });

  it("la ripresa ricostruisce lo stato dai tentativi salvati", () => {
    const s = replayAttempts(
      ["meaning", "reading"],
      [
        { questionType: "meaning", isCorrect: false },
        { questionType: "meaning", isCorrect: false },
        { questionType: "meaning", isCorrect: true },
      ],
    );
    expect(s).toMatchObject({ meaningDone: true, readingDone: false, meaningIncorrect: 2 });
  });
});
