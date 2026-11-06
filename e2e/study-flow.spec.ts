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
    await makeReviewsDue();
    await page.goto("/reviews");
    const input = page.locator("#answer");
    await expect(input).toBeVisible();

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
      await input.fill(reading ? data.reading : data.meaning);
      await input.press("Enter");
      await expect(page.locator("#answer[readonly]")).toBeVisible();
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

  test("@mobile la dashboard è utilizzabile su telefono", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigazione principale" }).last()).toBeVisible();
    await expect(page.getByText("Ripassi disponibili")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
