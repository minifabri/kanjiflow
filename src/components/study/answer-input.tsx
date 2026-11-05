"use client";

import { useEffect, useRef, useState } from "react";
import { toHiragana } from "wanakana";
import { cn } from "@/lib/utils";

export type AnswerState = "idle" | "correct" | "incorrect" | "warning";

/**
 * Campo risposta da tastiera.
 * - Lettura: il romaji viene convertito in hiragana mentre si scrive (convenzione IME: "n" finale resta
 *   in attesa finché non è chiaro se è ん); l'input da IME giapponese passa invariato durante la composizione.
 * - Invio conferma; quando la risposta è già valutata, Invio passa avanti (gestito dal genitore).
 */
export function AnswerInput({
  mode,
  onSubmit,
  state = "idle",
  disabled,
  autoFocus = true,
  placeholder,
}: {
  mode: "meaning" | "reading";
  onSubmit: (value: string) => void;
  state?: AnswerState;
  disabled?: boolean;
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
    if (state === "idle") ref.current?.focus();
  }, [state]);

  const convert = (raw: string) => (mode === "reading" ? toHiragana(raw, { IMEMode: true }) : raw);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (composing.current) return;
        onSubmit(value);
      }}
    >
      <label className="sr-only" htmlFor="answer">
        {mode === "reading" ? "Lettura (romaji o kana)" : "Significato in italiano"}
      </label>
      <input
        id="answer"
        ref={ref}
        value={value}
        disabled={disabled}
        readOnly={state !== "idle"}
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
