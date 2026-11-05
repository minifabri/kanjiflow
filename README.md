# KanjiFlow

Piattaforma personale di studio dei kanji con ripetizione dilazionata, interfaccia in italiano e focus JLPT N3.

## Avvio rapido (locale, SQLite)

```bash
npm install                 # genera anche il client Prisma
cp .env.example .env        # DATABASE_URL="file:./dev.db", autenticazione disattivata
npm run db:setup            # applica le migrazioni e importa il dataset (≈10 s)
npm run dev                 # http://localhost:3000 → configurazione iniziale
```

Al primo accesso si apre la configurazione iniziale: obiettivo, percorso, kanji N5/N4 già noti (mantenuti in ripasso o bruciati), test di posizionamento facoltativo e selezione dei kanji N3 da saltare.

## Deploy online (password singola)

1. `npm run auth:hash -- "una-password-lunga"` → copia `APP_PASSWORD_HASH_B64` e `SESSION_SECRET` nelle variabili d'ambiente.
   L'hash è in base64 perché il caricatore di variabili di Next.js espande i `$` dell'hash bcrypt e lo corromperebbe.
2. Database PostgreSQL (es. Supabase): imposta `DATABASE_PROVIDER=postgresql` e `DATABASE_URL`, poi
   `npm run db:pg:generate && npm run db:pg:deploy && npm run db:seed`.
3. In produzione, senza hash valido o segreto l'app risponde 503 a ogni richiesta (fail closed).

## Script

| Comando | Cosa fa |
|---|---|
| `npm test` | Test unitari (motore SRS, validatori, coda lezioni, date, auth) |
| `npm run test:e2e` | Playwright: onboarding → lezioni → ripassi con correzione manuale → mobile |
| `npm run typecheck` / `npm run lint` | Controlli statici |
| `npm run content:fetch` / `content:build` | Scarica le fonti pinnate e ricostruisce `data/dataset/kanjiflow-n5-n3.json` |
| `npm run db:seed` | Import idempotente del dataset (non tocca progressi, note, sinonimi e mnemonici personali) |

## Architettura

```
src/domain/        logica pura, senza React né database (testata con Vitest)
  srs/             macchina a stati, intervalli configurabili, politica di regressione
  answers/         romaji→kana, normalizzazione, validatori di lettura e significato, feedback
  curriculum/      coda lezioni per i percorsi guidato / JLPT / personalizzato
src/server/        accesso ai dati (Prisma), transazioni, servizi di studio e statistiche
src/app/           route App Router e server action (sottili: validano con Zod e delegano)
src/components/    UI (componenti stile shadcn/ui scritti a mano, Tailwind v4)
scripts/content/   pipeline dati riproducibile
data/              fonti pinnate, traduzioni italiane curate (TSV), dataset versionato
```

### Motore SRS

Stadi: Apprendista 1–4, Guru 1–2, Maestro, Illuminato, Bruciato; intervalli predefiniti 4 h, 8 h, 1 g, 2 g, 1 sett., 2 sett., 1 mese, 4 mesi (modificabili).
Un ripasso si chiude solo quando tutte le domande richieste hanno avuto risposta corretta (i radicali chiedono solo il significato).

**Regressione** (`src/domain/srs/engine.ts`): `errori = errori significato + errori lettura`; senza errori si sale di uno stadio; altrimenti si scende di `⌈errori/2⌉ × fattore`, dove il fattore è 2 da Guru in su (configurabile), con minimo Apprendista 1.

**Atomicità e idempotenza**: ogni risposta ha un `clientAttemptId` univoco (un doppio invio non crea due tentativi); la transizione di stadio avviene nella stessa transazione della risposta che completa l'elemento ed è unica per `(sessione, soggetto)`. Le sessioni interrotte riprendono ricostruendo lo stato dai tentativi salvati.

**Correzione manuale**: dopo una risposta sbagliata si può dichiararla corretta (ed eventualmente aggiungerla ai propri sinonimi). Il tentativo resta tracciato come `override`: nulla viene mai accettato in silenzio.

### Validazione delle risposte

- Lettura: romaji convertito in hiragana durante la digitazione (convenzioni IME per ん/nn/n'), input IME passato invariato, NFKC, katakana→hiragana, ー espanso coerentemente. `こうこう` ≠ `こおこお`. Suggerimenti per kana piccoli, っ, vocali lunghe e segni sonori; "riprova" senza penalità per letture valide del tipo sbagliato e per `n` ambigua in romaji.
- Significato: maiuscole, spazi, articoli e punteggiatura finale ignorati; accenti mancanti accettati ma segnalati; refusi tollerati in base alla lunghezza, **mai** se la risposta è il significato di un altro elemento.

## Stato della prima milestone

Funzionante: dashboard con dati reali, lezioni con quiz di acquisizione, ripassi da tastiera, onboarding N3 con test di posizionamento e importazione di kanji noti, esplora e scheda soggetto (stato, storico, sospendi/reimposta/ristudia, note, mnemonici e sinonimi personali), progressi per fascia JLPT, studio extra senza effetti sullo SRS, impostazioni (inclusi intervalli SRS), login a password singola, PWA installabile.

Non ancora: pagina statistiche, raccolte personalizzate, import/export e backup, mnemonici generati, interfaccia in inglese, notifiche. La PWA non funziona offline per lezioni e ripassi: mostra una pagina offline.
