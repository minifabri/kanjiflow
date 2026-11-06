"use client";

/**
 * Lettura ad alta voce con la sintesi vocale del dispositivo (Web Speech API).
 * Si legge sempre il kana, mai i kanji: così la voce non deve indovinare la lettura.
 * La qualità dipende dal dispositivo: iOS, Android e Chrome hanno voci giapponesi; alcuni Linux/Firefox no.
 */
import { useCallback, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

const AUTOPLAY_KEY = "kf:autoplay-audio";

function japaneseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"));
  // Preferisce le voci locali (funzionano anche offline) e quelle di qualità migliore note.
  const score = (v: SpeechSynthesisVoice) => (v.localService ? 2 : 0) + (/kyoko|otoya|google|o-ren|haruka|nanami/i.test(v.name) ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function subscribeVoices(cb: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

/** true/false quando noto, null durante il primo render (server) o finché le voci non sono caricate. */
export function useJapaneseVoiceAvailable(): boolean | null {
  return useSyncExternalStore(
    subscribeVoices,
    () => (!("speechSynthesis" in window) ? false : window.speechSynthesis.getVoices().length === 0 ? null : !!japaneseVoice()),
    () => null,
  );
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  const voice = japaneseVoice();
  if (voice) u.voice = voice;
  u.rate = 0.9;
  synth.speak(u);
}


function readStoredAutoplay() {
  try {
    return window.localStorage.getItem(AUTOPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

const autoplayListeners = new Set<() => void>();
let autoplayMemory: boolean | null = null; // se localStorage non è disponibile vale per la sessione

function subscribeAutoplay(cb: () => void) {
  autoplayListeners.add(cb);
  return () => autoplayListeners.delete(cb);
}

/** Preferenza per dispositivo (telefono e computer possono avere esigenze diverse). */
export function useAutoplayAudio(): [boolean, (v: boolean) => void] {
  const on = useSyncExternalStore(subscribeAutoplay, () => autoplayMemory ?? readStoredAutoplay(), () => false);
  const update = useCallback((v: boolean) => {
    autoplayMemory = v;
    try {
      window.localStorage.setItem(AUTOPLAY_KEY, v ? "1" : "0");
    } catch {
      /* archiviazione non disponibile: vale solo per questa sessione */
    }
    autoplayListeners.forEach((l) => l());
  }, []);
  return [on, update];
}

export function SpeakButton({ text, label, className, size = "md" }: { text: string; label?: string; className?: string; size?: "sm" | "md" }) {
  const available = useJapaneseVoiceAvailable();
  if (!text) return null;
  const unavailable = available === false;
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      disabled={unavailable}
      title={unavailable ? "Nessuna voce giapponese installata su questo dispositivo" : `Ascolta: ${text}`}
      aria-label={label ?? `Ascolta la pronuncia: ${text}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-secondary transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-40",
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
    >
      {unavailable ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className={size === "sm" ? "size-4" : "size-5"} aria-hidden />}
    </button>
  );
}
