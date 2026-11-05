import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const dbFile = path.resolve((process.env.E2E_DATABASE_URL ?? "file:./e2e.db").slice(5));

/** Rende scaduti tutti gli elementi in Apprendista (simula il passare delle 4 ore). */
function makeReviewsDue() {
  const db = new Database(dbFile);
  db.prepare(`UPDATE "UserSubjectProgress" SET "nextReviewAt" = ? WHERE "srsStage" BETWEEN 1 AND 4`).run(Date.now() - 60_000);
  db.close();
}

function answersFor(subjectId: string) {
  const db = new Database(dbFile);
  const s = db.prepare(`SELECT id, type, primaryMeaning FROM "Subject" WHERE id = ?`).get(subjectId) as
    | { id: string; type: string; primaryMeaning: string }
    | undefined;
  const reading = s
    ? (db.prepare(`SELECT reading FROM "SubjectReading" WHERE subjectId = ? AND isPrimary = 1 LIMIT 1`).get(s.id) as { reading: string } | undefined)
    : undefined;
  db.close();
  return { meaning: s?.primaryMeaning ?? "", reading: reading?.reading.split(".").join("") ?? "" };
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
    // Scorre tutte le sezioni con la tastiera fino al quiz.
    for (let i = 0; i < 60; i++) {
      if (await page.getByText("Quiz di acquisizione").isVisible()) break;
      await page.keyboard.press("ArrowRight");
    }
    await expect(page.getByText("Quiz di acquisizione")).toBeVisible();
    // Risponde correttamente a ogni domanda leggendo i dati dal database di test.
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole("button", { name: "Completa le lezioni" }).isVisible()) break;
      const card = page.locator("[data-subject-id]");
      const isReading = (await card.getAttribute("data-question")) === "reading";
      const { meaning, reading } = answersFor((await card.getAttribute("data-subject-id"))!);
      const input = page.locator("#answer");
      await input.fill(isReading ? reading : meaning);
      await input.press("Enter");
      await input.press("Enter");
    }
    await page.getByRole("button", { name: "Completa le lezioni" }).click();
    await expect(page.getByRole("heading", { name: "Lezioni completate" })).toBeVisible();
  });

  test("ripassi: risposta sbagliata, correzione manuale tracciata, completamento atomico", async ({ page }) => {
    makeReviewsDue();
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
      const data = answersFor((await card.getAttribute("data-subject-id"))!);
      await input.fill(reading ? data.reading : data.meaning);
      await input.press("Enter");
      await expect(page.locator("#answer[readonly]")).toBeVisible();
      await input.press("Enter");
    }
    await expect(page.getByRole("heading", { name: "Ripassi completati" })).toBeVisible();

    const db = new Database(dbFile);
    const dupes = db.prepare(`SELECT sessionId, subjectId, COUNT(*) c FROM "ReviewTransition" GROUP BY sessionId, subjectId HAVING c > 1`).all();
    const overrides = db.prepare(`SELECT COUNT(*) c FROM "ReviewAttempt" WHERE overridden = 1 AND outcome = 'override'`).get() as { c: number };
    db.close();
    expect(dupes).toHaveLength(0);
    expect(overrides.c).toBe(1);
  });

  test("@mobile la dashboard è utilizzabile su telefono", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigazione principale" }).last()).toBeVisible();
    await expect(page.getByText("Ripassi disponibili")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
