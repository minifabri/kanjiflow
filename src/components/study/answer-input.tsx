"use client";

import { useEffect, useRef, useState } from "react";
import { toHiragana } from "wanakana";
import { romajiToHiragana } from "@/domain/answers";
import { cn } from "@/lib/utils";

export type AnswerState = "idle" | "correct" | "incorrect" | "warning";

/**
 * Campo risposta da tastiera.
 * - Lettura: il romaji viene convertito in hiragana mentre si scrive (convenzione IME: "n" finale resta
 *   in attesa finché non è chiaro se è ん); l'input da IME giapponese passa invariato durante la composizione.
 * - Invio conferma: prima completa la conversione (la "n" finale diventa ん, come con un IME).
 * - Durante l'invio il campo resta attivo e a fuoco (solo in sola lettura); dopo un "riprova" il testo resta lì da correggere.
 * - Quando la risposta è già valutata, Invio passa avanti (gestito dal genitore).
 */
export function AnswerInput({
  mode,
  onSubmit,
  state = "idle",
  busy,
  autoFocus = true,
  placeholder,
}: {
  mode: "meaning" | "reading";
  onSubmit: (value: string) => void;
  state?: AnswerState;
  /** Invio in corso: il campo non accetta modifiche ma non perde il fuoco. */
  busy?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const composing = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, mode]);

  useEffect(() => {
    if (state === "idle" && !busy) ref.current?.focus();
  }, [state, busy]);

  const convert = (raw: string) => (mode === "reading" ? toHiragana(raw, { IMEMode: true }) : raw);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (composing.current || busy) return;
        // Completa la conversione del romaji rimasto in sospeso (es. "かn" → "かん").
        // (Con la risposta già valutata il genitore usa Invio per passare avanti: il testo non si tocca.)
        const final = state === "idle" && mode === "reading" && /[a-z]/i.test(value) ? romajiToHiragana(value) : value;
        if (final !== value) setValue(final);
        onSubmit(final);
      }}
    >
      <label className="sr-only" htmlFor="answer">
        {mode === "reading" ? "Lettura (romaji o kana)" : "Significato in italiano"}
      </label>
      <input
        id="answer"
        ref={ref}
        value={value}
        readOnly={state !== "idle" || busy}
        aria-busy={busy || undefined}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          setValue(convert(e.currentTarget.value));
        }}
        onChange={(e) => setValue(composing.current ? e.target.value : convert(e.target.value))}
        lang={mode === "reading" ? "ja" : "it"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        placeholder={placeholder ?? (mode === "reading" ? "読み方 — scrivi in romaji o kana" : "Significato")}
        aria-invalid={state === "incorrect" || undefined}
        className={cn(
          "h-14 w-full rounded-lg border-2 bg-elevated px-4 text-center text-lg outline-none transition-colors placeholder:text-muted/60 focus-visible:border-primary",
          mode === "reading" && "jp",
          state === "idle" && "border-border",
          state === "correct" && "border-success bg-success/10",
          state === "incorrect" && "border-error bg-error/10",
          state === "warning" && "border-gold bg-gold/10",
        )}
      />
    </form>
  );
}
