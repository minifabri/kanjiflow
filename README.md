# KanjiFlow

Piattaforma personale di studio dei kanji con ripetizione dilazionata, interfaccia in italiano e focus JLPT N3. Attorno ai kanji, che restano il centro, ci sono la lettura (読解) e la grammatica (文法) in stile JLPT, collegate ai progressi sui kanji.

## Avvio rapido (locale, SQLite)

```bash
npm install                 # genera anche il client Prisma
cp .env.example .env        # DATABASE_URL="file:./dev.db", autenticazione disattivata
npm run db:setup            # applica le migrazioni e importa il dataset (≈10 s)
npm run dev                 # http://localhost:3000 → configurazione iniziale
```

Al primo accesso si apre la configurazione iniziale: obiettivo, percorso, kanji N5/N4 già noti (mantenuti in ripasso o bruciati), test di posizionamento facoltativo e selezione dei kanji N3 da saltare.

## Deploy online (attuale)

- **App**: Vercel, progetto `kanjiflow`, funzioni a Francoforte (`fra1`). Ogni push su `main` fa un deploy di produzione.
- **Database**: PostgreSQL su Neon (piano gratuito, Francoforte), collegato al progetto dal pannello Vercel → Storage.
  Vercel fornisce `DATABASE_URL` (pooler, usato dall'app) e `DATABASE_URL_UNPOOLED` (diretta, usata da migrazioni e import).
- **Build** (`npm run vercel-build`): `prisma migrate deploy` → import idempotente del dataset → `next build`.
- **Variabili impostate a mano**: `DATABASE_PROVIDER=postgresql`, `APP_PASSWORD_HASH_B64`, `SESSION_SECRET`.

### Account

Ogni persona ha il suo account (nome utente + password) e progressi, note, sinonimi e mnemonici personali separati; i contenuti del dataset sono condivisi.
Non c'è registrazione aperta: l'amministratore crea gli account in **Impostazioni → Account e amici**, ottiene una password temporanea da comunicare e può reimpostarla o disattivare l'account (le sessioni aperte decadono subito, grazie a `sessionVersion`).
Ognuno cambia la propria password in Impostazioni.

L'amministratore è il primo utente (nome utente `admin`): al primo avvio la sua password viene copiata da `APP_PASSWORD_HASH_B64`, così chi usava l'accesso a password singola entra con la stessa password e ritrova i suoi progressi. Dopo, la password vive nel database.
L'hash è in base64 perché il caricatore di variabili di Next.js espande i `$` di un hash bcrypt in chiaro.
In produzione, senza `APP_PASSWORD_HASH_B64` valido e `SESSION_SECRET` l'app risponde 503 a ogni richiesta (fail closed).

## Script

| Comando | Cosa fa |
|---|---|
| `npm test` | Test unitari (motore SRS, validatori, coda lezioni, lettura, grammatica, date, auth) |
| `npm run test:e2e` | Playwright: onboarding → lezioni → ripassi con correzione manuale → lettura → grammatica → mobile |
| `npm run typecheck` / `npm run lint` | Controlli statici |
| `npm run content:fetch` / `content:build` | Scarica le fonti pinnate e ricostruisce `data/dataset/kanjiflow-n5-n3.json` |
| `npm run db:seed` | Import idempotente del dataset, dei brani di lettura e della grammatica (non tocca progressi, tentativi, note, sinonimi e mnemonici personali) |

## Architettura

```
src/domain/        logica pura, senza React né database (testata con Vitest)
  srs/             macchina a stati, intervalli configurabili, politica di regressione
  answers/         romaji→kana, normalizzazione, validatori di lettura e significato, feedback
  curriculum/      coda lezioni per i percorsi guidato / JLPT / personalizzato
  reading/         markup dei brani, collegamento ai soggetti, leggibilità e furigana adattivo
  grammar/         formato dei punti grammaticali e costruzione degli esercizi
src/server/        accesso ai dati (Prisma), transazioni, servizi di studio e statistiche
src/app/           route App Router e server action (sottili: validano con Zod e delegano)
src/components/    UI (componenti stile shadcn/ui scritti a mano, Tailwind v4)
scripts/content/   pipeline dati riproducibile
data/              fonti pinnate, traduzioni italiane curate (TSV), dataset versionato, brani di lettura, grammatica
```

### Motore SRS

Stadi: Apprendista 1–4, Guru 1–2, Maestro, Illuminato, Bruciato; intervalli predefiniti 4 h, 8 h, 1 g, 2 g, 1 sett., 2 sett., 1 mese, 4 mesi (modificabili).
Un ripasso si chiude solo quando tutte le domande richieste hanno avuto risposta corretta (i radicali chiedono solo il significato).

**Regressione** (`src/domain/srs/engine.ts`): `errori = errori significato + errori lettura`; senza errori si sale di uno stadio; altrimenti si scende di `⌈errori/2⌉ × fattore`, dove il fattore è 2 da Guru in su (configurabile), con minimo Apprendista 1.

**Atomicità e idempotenza**: ogni risposta ha un `clientAttemptId` univoco (un doppio invio non crea due tentativi); la transizione di stadio avviene nella stessa transazione della risposta che completa l'elemento ed è unica per `(sessione, soggetto)`. Le sessioni interrotte riprendono ricostruendo lo stato dai tentativi salvati.

**Correzione manuale**: dopo una risposta sbagliata si può dichiararla corretta (ed eventualmente aggiungerla ai propri sinonimi). Il tentativo resta tracciato come `override`: nulla viene mai accettato in silenzio.

### Validazione delle risposte

- Lettura: romaji convertito in hiragana durante la digitazione (convenzioni IME per ん/nn/n'), input IME passato invariato, NFKC, katakana→hiragana, ー espanso coerentemente. `こうこう` ≠ `こおこお`. Suggerimenti per kana piccoli, っ, vocali lunghe e segni sonori; "riprova" senza penalità per letture valide del tipo sbagliato e per `n` ambigua in romaji.
- Significato: maiuscole, spazi, articoli e punteggiatura finale ignorati; accenti mancanti accettati ma segnalati; errori di dita (tasto vicino sulla tastiera, lettere scambiate, doppia in più o in meno) accettati da 3 lettere in su, anche sulla prima lettera; altri refusi tollerati in base alla lunghezza; **mai** se la risposta è il significato di un altro elemento.
- All'Invio la "n" finale ancora in romaji diventa ん (come con un IME); dopo un "riprova" il testo resta nel campo e il campo resta a fuoco.

### Lettura (読解)

30 brani originali (10 N4 di riscaldamento, 20 N3) nei tre formati JLPT: brano breve, brano medio, ricerca di informazioni. Ogni brano ha domande a scelta multipla in giapponese, spiegazione e traduzione in italiano.

**Legame con i kanji**
- *Furigana adattivo*: compare solo sulle parole che contengono un kanji non ancora a Guru (o fuori dal percorso N5–N3). Si può forzare "sempre" o "mai"; l'impostazione "Mostra furigana" decide il valore iniziale.
- *Scheda al tocco*: ogni parola annotata apre vocabolo e kanji collegati con il loro stadio SRS.
- *Leggibilità*: ogni brano mostra la percentuale di kanji conosciuti; l'elenco propone prima i brani non letti più leggibili e segnala quelli che contengono kanji sbagliati spesso nei ripassi.
- *Kanji mancanti*: i kanji del brano non ancora studiati si mettono in cima alla coda delle lezioni con un pulsante (tabella `LessonPriority`, vale in ogni percorso).
- *Dalla scheda del kanji*: sezione "Compare in questi testi".
- Leggere **non modifica mai gli stadi SRS**: un kanji noto consultato durante la lettura viene solo segnalato a fine brano.

**Modalità esame** (`?mode=exam`): tempo indicativo per formato, niente furigana né schede fino alla consegna.

**Correzione**: le soluzioni non vengono mai inviate alla pagina; la server action corregge, salva il tentativo (`ReadingAttempt`) e solo allora restituisce soluzioni, spiegazioni e traduzione.

**Scrivere un brano** (`data/curated/reading/*.json`, poi `npm run db:seed`): il testo usa il markup `{漢字|かんじ}`; ogni kanji deve essere annotato (lo verifica un test). Le parole composte vanno in un'unica annotazione (`{図書館|としょかん}`), l'okurigana resta fuori (`{食|た}べる`). All'import ogni annotazione viene collegata ai kanji e, senza analizzatore morfologico, al vocabolo: per corrispondenza esatta o dal tema per verbi e aggettivi (`src/domain/reading/linking.ts`). Per le forme irregolari si dichiara la forma di dizionario: `{来|き|来る}ます`.

I brani sono stati scritti per KanjiFlow, non provengono da prove ufficiali e non sono stati rivisti da un madrelingua.

### Grammatica (文法)

40 punti grammaticali originali (10 N4 di riscaldamento, 30 N3), ognuno con scheda in italiano (significato, formazione, uso, due esempi con audio) e tre esercizi nei formati JLPT: due di scelta della forma (文法形式の判断) e uno di riordino con la ★ (文の組み立て). Manca ancora il terzo formato, il testo con più spazi vuoti (文章の文法).

**SRS in una coda separata**: stessi stadi, intervalli e regola di regressione dei kanji (`src/domain/srs`), ma tabelle proprie (`UserGrammarProgress`, `GrammarAttempt`): il contatore e la coda dei ripassi kanji non cambiano.
- *Lezione*: scheda, poi un esercizio. Con la risposta corretta il punto entra ad Apprendista 1; con quella sbagliata torna in fondo alla sessione con la scheda e un altro esercizio. Limite giornaliero in Impostazioni (predefinito 3 punti nuovi al giorno); l'ordine è N4, poi N3.
- *Ripasso*: un esercizio per punto in scadenza, a rotazione (quello visto meno di recente). Giusto = uno stadio in più; sbagliato = regressione del motore SRS con un errore.
- *Pratica libera* dalla scheda del punto: non modifica lo stadio.
- *La conosco già*: porta il punto a Maestro con il ripasso distribuito nel mese, come per i kanji noti; *Togli dai ripassi* lo riporta tra i punti nuovi.

**Correzione**: come per la lettura, le soluzioni non sono nella pagina. La server action corregge e aggiorna lo SRS nella stessa transazione; ogni risposta ha un `clientAttemptId`, quindi un doppio invio non conta due volte. Un ripasso vale solo se il punto è davvero in scadenza.

**Legame con i kanji**: esempi ed esercizi usano lo stesso markup dei brani e lo stesso furigana adattivo.

**Scrivere un punto** (`data/curated/grammar/*.json`, poi `npm run db:seed`): negli esercizi a scelta la frase contiene un solo segnaposto `（　）`; in quelli di riordino si scrivono i quattro pezzi nell'ordine giusto e la posizione della ★, e l'import li mescola in modo deterministico. I pezzi devono avere un solo ordine possibile: meglio catene in cui ogni pezzo dipende dal precedente che due complementi scambiabili.

Schede ed esercizi sono stati scritti per KanjiFlow, non provengono da prove ufficiali e non sono stati rivisti da un madrelingua.

## Stato della prima milestone

Funzionante: dashboard con dati reali, lezioni con quiz di acquisizione, ripassi da tastiera, onboarding N3 con test di posizionamento e importazione di kanji noti, esplora e scheda soggetto (stato, storico, sospendi/reimposta/ristudia, note, mnemonici e sinonimi personali), progressi per fascia JLPT, studio extra senza effetti sullo SRS, impostazioni (inclusi intervalli SRS), account multipli con gestione da parte dell'amministratore, PWA installabile.

Lettura ad alta voce: pulsante 🔊 su letture e frasi d'esempio, con la sintesi vocale giapponese del dispositivo (Web Speech API, si legge sempre il kana). Nei ripassi l'audio compare solo dopo la domanda di lettura, per non suggerire la risposta; tasto `P`, audio automatico opzionale (preferenza per dispositivo). Se il dispositivo non ha una voce giapponese il pulsante è disattivato.

Mnemonici generati (modificabili, sostituiti da quelli personali):
- **kanji N4 e N3**: storie originali in italiano per significato e lettura in `data/curated/it/mnemonics-kanji.tsv`, con parole chiave ricorrenti per i suoni (セイ → SEI, カン → CANE…). Un test verifica che ogni lettura mnemonica citi la lettura studiata.
- **vocaboli**: spiegazione automatica (`src/domain/content/vocab-mnemonic.ts`) dei kanji componenti e di come se ne ricava la pronuncia, con rendaku, っ, h→p e okurigana; se la lettura non deriva dalle letture di dizionario (今日, 大人…) lo dice invece di inventare un legame.

Non ancora: esercizi di grammatica su testo (文章の文法), mnemonici per i kanji N5 e i radicali, pagina statistiche, raccolte personalizzate, import/export e backup, interfaccia in inglese, notifiche. La PWA non funziona offline per lezioni e ripassi: mostra una pagina offline.
