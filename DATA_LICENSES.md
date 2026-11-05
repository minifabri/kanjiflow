# Fonti dei dati e licenze

KanjiFlow non contiene contenuti di WaniKani. Tutti i dati provengono da fonti liberamente licenziate, elencate in `data/sources.json` con la versione esatta usata.

| Fonte | Uso | Licenza |
|---|---|---|
| KANJIDIC2 (EDRDG), via jmdict-simplified | Kanji: significati inglesi, letture on/kun, tratti, frequenza, grado | CC BY-SA 4.0 |
| JMdict (EDRDG), via jmdict-simplified | Vocaboli: letture, glosse inglesi, parti del discorso | CC BY-SA 4.0 |
| KRADFILE (EDRDG) | Componenti grafici dei kanji (soggetti "radicale") | Licenza EDRDG (CC BY-SA 4.0) |
| Tatoeba, frasi collegate a JMdict | Frasi d'esempio con traduzione inglese originale | CC BY 2.0 FR |
| Liste JLPT di Jonathan Waller (tanos.co.uk), via `davidluzgouveia/kanji-data` | Fascia JLPT **non ufficiale** dei kanji (solo il campo `jlpt_new`) | MIT (compilazione) |
| Open Anki JLPT Decks | Fascia JLPT **non ufficiale** dei vocaboli N5–N3 | MIT |
| KanjiFlow (generato) | Significati italiani, nomi italiani dei componenti | CC BY-SA 4.0 (opera derivata) |

Note importanti:

- **Il JLPT non pubblica elenchi ufficiali** di kanji o vocaboli dal 2010. Le fasce N5/N4/N3 sono liste della community e nel database hanno `confidence = community`.
- **I significati italiani sono generati** traducendo le glosse inglesi: ogni riga ha `origin = generated` e `verified = false`. Le glosse inglesi originali restano accettate come risposte.
- Il file `kanji-data` include anche dati WaniKani: lo script di build **ne legge solo il campo `jlpt_new`**, tutto il resto viene ignorato.
- La licenza EDRDG chiede di **aggiornare regolarmente** i dati: aggiorna le versioni in `data/sources.json` ed esegui `npm run content:fetch && npm run content:build`, poi `npm run db:seed`.
- Attribuzioni visibili nell'app in **Impostazioni → Dati e fonti**.
