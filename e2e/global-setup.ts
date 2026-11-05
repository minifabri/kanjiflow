/**
 * Esegue il login reale (autenticazione a password singola attiva anche nei test)
 * e salva la sessione per tutti i test successivi.
 */
import { chromium, expect, type FullConfig } from "@playwright/test";
import { E2E_PASSWORD, STORAGE_STATE } from "./constants";

export default async function globalSetup(config: FullConfig) {
  const { baseURL, channel } = config.projects[0]!.use;
  const browser = await chromium.launch(channel ? { channel } : {});
  const page = await browser.newPage();
  await page.goto(`${baseURL}/`);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Password").fill("password-sbagliata");
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByText("Password non corretta.")).toBeVisible();
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
