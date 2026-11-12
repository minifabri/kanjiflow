import { toRomaji } from "wanakana";
import { normalizeStoredReading } from "../src/domain/answers/kana";
import { expect, test } from "@playwright/test";
import { query } from "./db";

/** Rende scaduti tutti gli elementi in Apprendista (simula il passare delle 4 ore). */
async function makeReviewsDue() {
  await query(`UPDATE "UserSubjectProgress" SET "nextReviewAt" = $1 WHERE "srsStage" BETWEEN 1 AND 4`, [new Date(Date.now() - 60_000)]);
}

async function answersFor(subjectId: string) {
  const [s] = await query<{ primaryMeaning: string }>(`SELECT "primaryMeaning" FROM "Subject" WHERE "id" = $1`, [subjectId]);
  const [r] = await query<{ reading: string }>(
    `SELECT "reading" FROM "SubjectReading" WHERE "subjectId" = $1 AND "isPrimary" = $2 LIMIT 1`,
    [subjectId, true],
  );
  return { meaning: s?.primaryMeaning ?? "", reading: r?.reading.split(".").join("") ?? "" };
}

test.describe.serial("percorso di studio completo", () => {
  test("onboarding N3: segna N5/N4 come noti e arriva alla dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/onboarding/);
    await page.getByLabel("Come ti chiami?").fill("Test");
    await page.getByRole("button", { name: /Avanti/ }).click();
    await expect(page.getByRole("heading", { name: "Cosa conosci già" })).toBeVisible();
    await page.getByRole("button", { name: /Avanti/ }).click();
    await page.getByRole("button", { name: /Salta il test/ }).click();
    await page.getByRole("button", { name: /Avanti/ }).click();
    await page.getByRole("button", { name: "Inizia a studiare" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("。");
    await expect(page.getByText("Progressione N3")).toBeVisible();
  });

  test("lezioni: studio, quiz di acquisizione e completamento", async ({ page }) => {
    await page.goto("/lessons");
    await page.getByRole("link", { name: "Inizia le lezioni" }).first().click();
    await expect(page).toHaveURL(/lessons\/session/);
    // Scorre tutte le sezioni con la tastiera fino al quiz, controllando che compaiano i mnemonici generati.
    let sawMnemonic = false;
    for (let i = 0; i < 60; i++) {
      if (await page.getByText("Quiz di acquisizione").isVisible()) break;
      if (!sawMnemonic && (await page.getByText("(generato)").first().isVisible())) sawMnemonic = true;
      await page.keyboard.press("ArrowRight");
    }
    expect(sawMnemonic).toBe(true);
    await expect(page.getByText("Quiz di acquisizione")).toBeVisible();
    // Risponde correttamente a ogni domanda leggendo i dati dal database di test.
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole("button", { name: "Completa le lezioni" }).isVisible()) break;
      const card = page.locator("[data-subject-id]");
      const isReading = (await card.getAttribute("data-question")) === "reading";
      const { meaning, reading } = await answersFor((await card.getAttribute("data-subject-id"))!);
      const input = page.locator("#answer");
      await input.fill(isReading ? reading : meaning);
      await input.press("Enter");
      await input.press("Enter");
    }
    await page.getByRole("button", { name: "Completa le lezioni" }).click();
    await expect(page.getByRole("heading", { name: "Lezioni completate" })).toBeVisible();
  });

  test("ripassi: risposta sbagliata, correzione manuale tracciata, completamento atomico", async ({ page }) => {
    test.setTimeout(60_000); // digitazione reale carattere per carattere
    await makeReviewsDue();
    await page.goto("/reviews");
    const input = page.locator("#answer");
    await expect(input).toBeVisible();

    // Un "riprova" (lettura con caratteri non kana) non cancella il testo e non toglie il fuoco.
    if ((await page.locator("[data-subject-id]").getAttribute("data-question")) === "reading") {
      await input.fill("か1");
      await input.press("Enter");
      await expect(page.getByText(/kana o romaji/)).toBeVisible();
      await expect(input).toHaveValue("か1");
      await expect(input).toBeFocused();
    }

    // Prima risposta volutamente sbagliata (significato o lettura).
    const isReading = (await page.locator("[data-subject-id]").getAttribute("data-question")) === "reading";
    await input.fill(isReading ? "ぬぬぬ" : "risposta-sbagliata");
    await input.press("Enter");
    await expect(page.getByText(/Sbagliato/)).toBeVisible();
    // Correzione manuale visibile e tracciata.
    await page.getByRole("button", { name: /^Era giusta/ }).first().click();
    await expect(page.getByText(/corretta manualmente|aggiunta ai tuoi sinonimi/)).toBeVisible();
    await page.keyboard.press("Enter");

    // Il resto della sessione con risposte corrette.
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole("heading", { name: "Ripassi completati" }).isVisible()) break;
      if (!(await input.isVisible())) {
        await page.waitForTimeout(300);
        continue;
      }
      const card = page.locator("[data-subject-id]");
      const reading = (await card.getAttribute("data-question")) === "reading";
      const data = await answersFor((await card.getAttribute("data-subject-id"))!);
      if (reading) {
        // Digitazione reale in romaji: con le letture che finiscono in ん la "n" resta in sospeso fino all'Invio.
        await input.pressSequentially(toRomaji(normalizeStoredReading(data.reading)));
      } else {
        await input.fill(data.meaning);
      }
      await input.press("Enter");
      await expect(page.locator("#answer[readonly]:not([aria-busy])")).toBeVisible();
      await expect(page.getByText(/^Sbagliato/)).toHaveCount(0);
      await expect(input).toBeFocused();
      await input.press("Enter");
    }
    await expect(page.getByRole("heading", { name: "Ripassi completati" })).toBeVisible();

    const dupes = await query(
      `SELECT "sessionId", "subjectId", COUNT(*) AS c FROM "ReviewTransition" GROUP BY "sessionId", "subjectId" HAVING COUNT(*) > 1`,
    );
    const [overrides] = await query<{ c: number | string }>(
      `SELECT COUNT(*) AS c FROM "ReviewAttempt" WHERE "overridden" = $1 AND "outcome" = 'override'`,
      [true],
    );
    expect(dupes).toHaveLength(0);
    expect(Number(overrides!.c)).toBe(1);
  });

  test("scheda di un kanji N3: letture con audio e mnemonici generati", async ({ page }) => {
    const [row] = await query<{ id: string }>(`SELECT id FROM "Subject" WHERE slug = $1`, ["kanji:政"]);
    await page.goto(`/subjects/${row!.id}`);
    await expect(page.getByRole("button", { name: /Ascolta la pronuncia/ }).first()).toBeVisible();
    await expect(page.getByText("SEI", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("(generato)").first()).toBeVisible();
  });

  test("account: l'amministratore crea un amico, che ha progressi separati e nessun accesso alla gestione", async ({ page, browser }) => {
    await page.goto("/settings/accounts");
    await page.getByLabel("Nome utente").fill("amico");
    await page.getByLabel("Nome visualizzato").fill("Amico");
    await page.getByRole("button", { name: "Crea account" }).click();
    const password = (await page.getByTestId("new-password").textContent())!.trim();
    expect(password.length).toBeGreaterThanOrEqual(10);
    await expect(page.getByRole("list").getByText("amico", { exact: true })).toBeVisible();

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const friend = await ctx.newPage();
    await friend.goto("/");
    await friend.getByLabel("Nome utente").fill("Amico"); // il nome utente non distingue maiuscole
    await friend.getByLabel("Password").fill(password);
    await friend.getByRole("button", { name: "Entra" }).click();
    // Nuovo account: configurazione iniziale propria, niente progressi dell'amministratore.
    await expect(friend).toHaveURL(/onboarding/);
    const [admin] = await query<{ id: string }>(`SELECT id FROM "User" WHERE username = $1`, ["admin"]);
    const [buddy] = await query<{ id: string }>(`SELECT id FROM "User" WHERE username = $1`, ["amico"]);
    const count = async (id: string) =>
      Number((await query<{ n: number | string }>(`SELECT COUNT(*) AS n FROM "UserSubjectProgress" WHERE "userId" = $1`, [id]))[0]!.n);
    expect(await count(admin!.id)).toBeGreaterThan(0);
    expect(await count(buddy!.id)).toBe(0);
    await friend.goto("/settings/accounts");
    await expect(friend).not.toHaveURL(/settings\/accounts/);

    // Disattivato dall'amministratore: la sessione aperta decade subito.
    await page.reload();
    const row = page.locator("li", { hasText: "amico" });
    await row.getByRole("button", { name: "Disattiva" }).click();
    await expect(row.getByText("disattivato", { exact: true })).toBeVisible();
    await friend.goto("/");
    await expect(friend).toHaveURL(/login/);
    await ctx.close();
  });

  test("lettura: furigana adattivo, scheda al tocco, correzione sul server e kanji mancanti in cima alle lezioni", async ({ page }) => {
    await page.goto("/reading");
    await expect(page.getByRole("heading", { name: "Lettura", level: 1 })).toBeVisible();
    await expect(page.getByText("Consigliato per te")).toBeVisible();
    await page.goto("/reading/n3-kissaten-no-arubaito");

    // I kanji N5/N4 sono noti dall'onboarding: niente furigana su 大学, furigana su 失敗 (kanji N3 non ancora studiati).
    const word = (base: string) => page.getByRole("button", { name: `${base}, apri la scheda` }).first();
    await expect(word("大学").locator("rt")).toHaveCount(0);
    await expect(word("失敗").locator("rt")).toHaveText("しっぱい");
    await page.getByRole("button", { name: "Sempre" }).click();
    await expect(word("大学").locator("rt")).toHaveText("だいがく");
    await page.getByRole("button", { name: "Mai" }).click();
    await expect(word("失敗").locator("rt")).toHaveCount(0);
    await page.getByRole("button", { name: "Adattivo" }).click();

    // Scheda della parola: vocabolo e kanji collegati, con lo stato SRS.
    await word("失敗").click();
    const panel = page.getByRole("complementary", { name: "Scheda di 失敗" });
    await expect(panel.getByText("Non ancora studiato").first()).toBeVisible();
    await expect(panel.getByRole("link")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    // Le soluzioni non sono nella pagina: le legge il test dal database e il server corregge.
    const answers = await query<{ answerIndex: number }>(
      `SELECT q."answerIndex" AS "answerIndex" FROM "ReadingQuestion" q JOIN "ReadingPassage" p ON p."id" = q."passageId" WHERE p."slug" = $1 ORDER BY q."position"`,
      ["n3-kissaten-no-arubaito"],
    );
    expect(answers).toHaveLength(3);
    const submit = page.getByRole("button", { name: "Controlla le risposte" });
    await expect(submit).toBeDisabled();
    const sets = page.locator("fieldset");
    for (const [i, a] of answers.entries()) {
      // L'ultima risposta è volutamente sbagliata.
      const pick = i === answers.length - 1 ? (Number(a.answerIndex) + 1) % 4 : Number(a.answerIndex);
      await sets.nth(i).locator("label").nth(pick).click();
    }
    await submit.click();
    await expect(page.getByRole("status")).toHaveText("2 su 3 risposte corrette");
    await expect(page.getByText("Non corretto.")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Traduzione" })).toBeVisible();
    const [attempt] = await query<{ correctCount: number; totalCount: number; mode: string; lookups: string }>(
      `SELECT "correctCount", "totalCount", "mode", "lookups" FROM "ReadingAttempt"`,
    );
    expect(attempt).toMatchObject({ correctCount: 2, totalCount: 3, mode: "study" });
    expect(JSON.parse(attempt!.lookups)).toHaveLength(3);

    // I kanji che mancano per leggere il brano passano in cima alla coda delle lezioni.
    const [target] = await query<{ id: string }>(`SELECT "id" FROM "Subject" WHERE "slug" = $1`, ["kanji:敗"]);
    await page.getByRole("button", { name: "Studiali per primi" }).click();
    await expect(page.getByText("In cima alla coda.")).toBeVisible();
    await page.goto("/lessons");
    const queue = page.locator("ul").filter({ has: page.locator(`a[href="/lessons/${target!.id}"]`) }).first();
    const firstHrefs = await queue.locator("a").evaluateAll((links) => links.slice(0, 12).map((l) => l.getAttribute("href")));
    expect(firstHrefs).toContain(`/lessons/${target!.id}`);

    // La scheda del kanji rimanda ai testi in cui compare; l'elenco segna il brano come letto.
    await page.goto(`/subjects/${target!.id}`);
    await expect(page.getByRole("heading", { name: "Compare in questi testi" })).toBeVisible();
    await expect(page.locator('a[href="/reading/n3-kissaten-no-arubaito"]')).toContainText("letto");
  });

  test("lettura in modalità esame: senza furigana né schede fino alla consegna", async ({ page }) => {
    await page.goto("/reading/n3-higaeri-tsuaa?mode=exam");
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.locator("rt")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /apri la scheda/ })).toHaveCount(0);
    const sets = page.locator("fieldset");
    await sets.nth(0).locator("label").nth(1).click();
    await sets.nth(1).locator("label").nth(3).click();
    await page.getByRole("button", { name: "Controlla le risposte" }).click();
    await expect(page.getByRole("status")).toHaveText("2 su 2 risposte corrette");
    await expect(page.getByRole("button", { name: /apri la scheda/ }).first()).toBeVisible();
    const modes = await query<{ mode: string }>(`SELECT "mode" FROM "ReadingAttempt" ORDER BY "completedAt"`);
    expect(modes.map((m) => m.mode)).toEqual(["study", "exam"]);
  });

  test("grammatica: lezioni con scheda ed esercizio, poi ripassi SRS in una coda separata", async ({ page }) => {
    /** Risponde all'esercizio mostrato leggendo la soluzione dal database (la pagina non la contiene). */
    const answerCurrent = async (correct: boolean) => {
      const id = await page.getByTestId("grammar-prompt").getAttribute("data-exercise");
      const [row] = await query<{ answerIndex: number }>(`SELECT "answerIndex" FROM "GrammarExercise" WHERE "id" = $1`, [id!]);
      const index = correct ? Number(row!.answerIndex) : (Number(row!.answerIndex) + 1) % 4;
      await page.getByRole("group", { name: "Risposte" }).getByRole("button").nth(index).click();
      await expect(page.getByRole("status")).toContainText(correct ? "Corretto" : "Non corretto");
    };
    const stages = async () =>
      (await query<{ srsStage: number }>(`SELECT "srsStage" FROM "UserGrammarProgress" ORDER BY "srsStage"`)).map((r) => Number(r.srsStage));
    const kanjiDueBefore = await query(`SELECT "id" FROM "UserSubjectProgress" WHERE "nextReviewAt" <= $1`, [new Date()]);

    await page.goto("/grammar");
    await expect(page.getByRole("heading", { name: "Grammatica", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Studia i punti nuovi" }).click();
    await expect(page).toHaveURL(/grammar\/session\?mode=lesson/);

    // Primo punto (N4 prima di N3): scheda, poi esercizio superato → entra nei ripassi.
    await expect(page.getByText("〜たことがある").first()).toBeVisible();
    await expect(page.getByText("Come si forma")).toBeVisible();
    await page.keyboard.press("Enter");
    await answerCurrent(true);
    await expect(page.getByRole("status")).toContainText("Entra nei ripassi: Apprendista 1");
    await page.keyboard.press("Enter");

    // Secondo punto sbagliato: non entra nei ripassi e torna in fondo alla sessione con un altro esercizio.
    await page.getByRole("button", { name: "Ho capito, mettimi alla prova" }).click();
    const firstTry = await page.getByTestId("grammar-prompt").getAttribute("data-exercise");
    await answerCurrent(false);
    await page.getByRole("button", { name: "Avanti" }).click();
    expect(await stages()).toEqual([1]);

    await page.keyboard.press("Enter");
    await answerCurrent(true);
    await page.keyboard.press("Enter");

    await expect(page.getByText("Come si forma")).toBeVisible();
    await page.keyboard.press("Enter");
    expect(await page.getByTestId("grammar-prompt").getAttribute("data-exercise")).not.toBe(firstTry);
    await answerCurrent(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Sessione completata" })).toBeVisible();
    expect(await stages()).toEqual([1, 1, 1]);

    // Limite giornaliero raggiunto; i ripassi arrivano alla scadenza.
    await page.goto("/grammar");
    await expect(page.getByText("Limite di oggi raggiunto")).toBeVisible();
    await expect(page.getByText("Nessun punto in scadenza.")).toBeVisible();
    await query(`UPDATE "UserGrammarProgress" SET "nextReviewAt" = $1`, [new Date(Date.now() - 60_000)]);
    await page.reload();
    await page.getByRole("link", { name: "Inizia i ripassi" }).click();
    await answerCurrent(true);
    await expect(page.getByRole("status")).toContainText("Apprendista 1 → Apprendista 2");
    await page.keyboard.press("Enter");
    await answerCurrent(false);
    await page.keyboard.press("Enter");
    await answerCurrent(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("2 su 3 risposte corrette.");
    expect(await stages()).toEqual([1, 2, 2]);

    // La pratica libera non tocca lo SRS, e i ripassi dei kanji non sono cambiati.
    await page.goto("/grammar/n4-ta-koto-ga-aru");
    await page.getByRole("link", { name: /Esercitati/ }).click();
    await answerCurrent(false);
    expect(await stages()).toEqual([1, 2, 2]);
    const kanjiDueAfter = await query(`SELECT "id" FROM "UserSubjectProgress" WHERE "nextReviewAt" <= $1`, [new Date()]);
    expect(kanjiDueAfter.length).toBe(kanjiDueBefore.length);
    const modes = await query<{ mode: string; n: number | string }>(`SELECT "mode", COUNT(*) AS n FROM "GrammarAttempt" GROUP BY "mode" ORDER BY "mode"`);
    expect(modes.map((m) => [m.mode, Number(m.n)])).toEqual([
      ["lesson", 4],
      ["practice", 1],
      ["review", 3],
    ]);
  });

  test("@mobile la dashboard è utilizzabile su telefono", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigazione principale" }).last()).toBeVisible();
    await expect(page.getByText("Ripassi disponibili")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigazione principale" }).last().getByRole("link", { name: "Lettura" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigazione principale" }).last().getByRole("link", { name: "Grammatica" })).toBeVisible();
    // Su telefono Esplora, JLPT, statistiche e raccolte si raggiungono dalla dashboard (su desktop sono nella barra laterale).
    const phone = (page.viewportSize()?.width ?? 1280) < 768;
    await expect(page.getByRole("navigation", { name: "Altre sezioni" }).getByRole("link", { name: "Esplora" })).toBeVisible({ visible: phone });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
