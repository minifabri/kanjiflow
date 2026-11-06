/**
 * Esegue il login reale dell'amministratore (account creato dal seed con la password di APP_PASSWORD_HASH_B64)
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
  await page.getByLabel("Nome utente").fill("admin");
  await page.getByLabel("Password").fill("password-sbagliata");
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByText("Nome utente o password non corretti.")).toBeVisible();
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
