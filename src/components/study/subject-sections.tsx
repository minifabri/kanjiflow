/** Sezioni di contenuto riutilizzate in lezioni, scheda soggetto e dopo le risposte nei ripassi. */
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { SubjectCardDTO, ComponentDTO } from "@/server/study/subjects";
import { SpeakButton } from "./speak-button";
import { speakableReading } from "@/lib/speech-text";

export const TYPE_LABEL = { radical: "Radicale", kanji: "Kanji", vocabulary: "Vocabolo" } as const;

export const TYPE_STYLE = {
  radical: "bg-radical/10 text-radical",
  kanji: "bg-primary/15 text-secondary",
  vocabulary: "bg-vocab/10 text-vocab",
} as const;

export function toKatakana(s: string) {
  return [...s]
    .map((c) => {
      const cp = c.codePointAt(0)!;
      return cp >= 0x3041 && cp <= 0x3096 ? String.fromCodePoint(cp + 0x60) : c;
    })
    .join("");
}

/** Lettura KANJIDIC "か.つ" → "か(つ)" per evidenziare l'okurigana. */
export function displayKunyomi(r: string) {
  const clean = r.replace(/-/g, "…");
  const [stem, okuri] = clean.split(".");
  return okuri ? `${stem}（${okuri}）` : stem!;
}

const POS_LABEL: Record<string, string> = {
  n: "sostantivo",
  "adj-i": "aggettivo in -i",
  "adj-na": "aggettivo in -na",
  "adj-no": "con の",
  adv: "avverbio",
  vs: "verbo con する",
  v1: "verbo ichidan",
  v5u: "verbo godan",
  v5k: "verbo godan",
  v5s: "verbo godan",
  v5t: "verbo godan",
  v5n: "verbo godan",
  v5b: "verbo godan",
  v5m: "verbo godan",
  v5r: "verbo godan",
  v5g: "verbo godan",
  "v5k-s": "verbo godan",
  "v5r-i": "verbo godan irregolare",
  vk: "verbo irregolare (来る)",
  vi: "intransitivo",
  vt: "transitivo",
  ctr: "contatore",
  suf: "suffisso",
  pref: "prefisso",
  pn: "pronome",
  int: "interiezione",
  conj: "congiunzione",
  exp: "espressione",
  num: "numerale",
  "n-adv": "sostantivo avverbiale",
  "n-t": "sostantivo temporale",
  "adv-to": "avverbio con と",
  "n-suf": "sostantivo suffisso",
  prt: "particella",
};

export function partOfSpeechLabels(pos: string[]) {
  return [...new Set(pos.map((p) => POS_LABEL[p]).filter(Boolean))] as string[];
}

export function SubjectHero({ card, size = "lg" }: { card: SubjectCardDTO; size?: "lg" | "md" }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TYPE_STYLE[card.type])}>{TYPE_LABEL[card.type]}</span>
        {card.jlpt && <Badge variant="outline">{card.jlpt}</Badge>}
      </div>
      <div
        className={cn("kanji-display", size === "lg" ? (card.characters.length > 3 ? "text-6xl sm:text-7xl" : "text-8xl sm:text-9xl") : "text-6xl")}
        lang="ja"
      >
        {card.characters}
      </div>
    </div>
  );
}

export function MeaningSection({ card }: { card: SubjectCardDTO }) {
  const it = card.meanings.filter((m) => m.language === "it" && m.isAccepted);
  const en = card.meanings.filter((m) => m.language === "en" && m.isAccepted);
  const generated = it.some((m) => m.origin === "generated");
  const userAdded = it.filter((m) => m.origin === "user");
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Significato</h3>
      <p className="text-2xl font-medium capitalize">{card.primaryMeaning}</p>
      {it.length > 1 && (
        <p className="text-sm text-muted">
          Accettati anche: {it.filter((m) => m.meaning !== card.primaryMeaning).map((m) => m.meaning).join(", ")}
        </p>
      )}
      {userAdded.length > 0 && <p className="text-xs text-secondary">Tuoi sinonimi: {userAdded.map((m) => m.meaning).join(", ")}</p>}
      {en.length > 0 && (
        <p className="text-xs text-muted">
          Glosse originali (inglese, {card.type === "vocabulary" ? "JMdict" : "KANJIDIC2"}): {en.slice(0, 6).map((m) => m.meaning).join("; ")}
        </p>
      )}
      {generated && (
        <p className="text-[11px] text-muted/80">Traduzione italiana generata a partire dalle glosse inglesi, non verificata: puoi aggiungere sinonimi tuoi.</p>
      )}
      {card.type === "vocabulary" && card.partOfSpeech.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {partOfSpeechLabels(card.partOfSpeech).map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

export function ReadingSection({ card }: { card: SubjectCardDTO }) {
  if (card.type === "radical") return null;
  if (card.type === "vocabulary") {
    const primary = card.readings.filter((r) => r.isPrimary);
    const others = card.readings.filter((r) => !r.isPrimary && r.isAccepted);
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Lettura</h3>
        <div className="flex items-center gap-2">
          <p className="jp text-3xl">{primary.map((r) => r.reading).join("、")}</p>
          <SpeakButton text={primary[0]?.reading ?? ""} />
        </div>
        {others.length > 0 && <p className="jp text-sm text-muted">Accettate anche: {others.map((r) => r.reading).join("、")}</p>}
        <p className="text-xs text-muted">La lettura del vocabolo può differire da quelle dei singoli kanji (rendaku, letture speciali).</p>
      </section>
    );
  }
  const on = card.readings.filter((r) => r.readingType === "onyomi");
  const kun = card.readings.filter((r) => r.readingType === "kunyomi");
  const primaryType = card.readings.find((r) => r.isPrimary)?.readingType;
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Letture</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadingGroup title="On'yomi (lettura sino-giapponese)" active={primaryType === "onyomi"} items={on.map((r) => ({ text: toKatakana(r.reading), speak: r.reading, primary: r.isPrimary }))} />
        <ReadingGroup title="Kun'yomi (lettura giapponese)" active={primaryType === "kunyomi"} items={kun.map((r) => ({ text: displayKunyomi(r.reading), speak: speakableReading(r.reading), primary: r.isPrimary }))} />
      </div>
      {primaryType && (
        <p className="text-xs text-muted">
          Nei ripassi si chiede la {primaryType === "onyomi" ? "on'yomi" : "kun'yomi"} (la più usata nel vocabolario JLPT di questo kanji); le altre
          letture valide non contano come errore.
        </p>
      )}
    </section>
  );
}

function ReadingGroup({ title, items, active }: { title: string; items: { text: string; speak: string; primary: boolean }[]; active: boolean }) {
  return (
    <div className={cn("rounded-md border border-border/60 p-3", active && "border-primary/50")}>
      <p className="mb-1.5 text-[11px] text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <p className="jp flex flex-wrap gap-x-3 gap-y-1 text-lg">
          {items.map((i, idx) => (
            <span key={idx} className={cn("inline-flex items-center", i.primary ? "text-foreground" : "text-muted")}>
              {i.text}
              {i.primary && <SpeakButton text={i.speak} size="sm" />}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function MnemonicSection({ card, type }: { card: SubjectCardDTO; type: "meaning" | "reading" }) {
  const list = card.mnemonics.filter((m) => m.type === type);
  const user = list.find((m) => m.isUser);
  const generated = list.find((m) => !m.isUser);
  const shown = user ?? generated;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Mnemonico {type === "meaning" ? "del significato" : "della lettura"}</h3>
      {shown ? (
        <p className="text-sm leading-relaxed">
          <RichText text={shown.content} />
          {!shown.isUser && (
            <span className="ml-2 text-[11px] text-muted" title="Testo generato da KanjiFlow: puoi sostituirlo con un mnemonico tuo dalla scheda del soggetto">
              (generato)
            </span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted">
          Nessun mnemonico ancora.{" "}
          <Link href={`/subjects/${card.id}#mnemonici`} className="text-secondary hover:underline">
            Scrivine uno tuo
          </Link>
          : quelli personali funzionano meglio.
        </p>
      )}
    </section>
  );
}

/** Markup minimo dei testi generati: **grassetto**. Niente HTML: il testo resta testo. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-secondary">
            {p}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function RelatedSection({ card }: { card: SubjectCardDTO }) {
  const compTitle = card.type === "kanji" ? "Componenti" : "Kanji che lo compongono";
  const usedTitle = card.type === "radical" ? "Usato nei kanji" : "Vocaboli d'esempio";
  return (
    <section className="space-y-4">
      {card.components.length > 0 && <ChipList title={compTitle} items={card.components} />}
      {card.usedIn.length > 0 && <ChipList title={usedTitle} items={card.usedIn} withReading={card.type === "kanji"} />}
    </section>
  );
}

function ChipList({ title, items, withReading }: { title: string; items: ComponentDTO[]; withReading?: boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`/subjects/${c.id}`} className={cn("flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:opacity-90", TYPE_STYLE[c.type])}>
              <span className="kanji-display text-lg">{c.characters}</span>
              <span className="text-xs">
                {withReading && c.reading && <span className="jp mr-1 opacity-80">{c.reading}</span>}
                {c.primaryMeaning}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExamplesSection({ card }: { card: SubjectCardDTO }) {
  if (card.examples.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Frasi d&apos;esempio</h3>
      <ul className="space-y-3">
        {card.examples.map((e, i) => (
          <li key={i} className="rounded-md bg-elevated/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="jp text-base leading-relaxed" lang="ja">
                {highlight(e.japaneseText, card.characters)}
              </p>
              <SpeakButton text={e.japaneseText} size="sm" label="Ascolta la frase" className="shrink-0" />
            </div>
            <p className="mt-1 text-sm text-muted">
              {e.translatedText}
              <span className="ml-2 text-[11px] opacity-80">
                ({e.translationLanguage === "en" ? "traduzione inglese originale" : "traduzione"} · {e.sourceName.split(" (")[0]})
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function highlight(text: string, word: string) {
  const i = text.indexOf(word);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-primary/25 px-0.5 text-foreground">{word}</mark>
      {text.slice(i + word.length)}
    </>
  );
}
