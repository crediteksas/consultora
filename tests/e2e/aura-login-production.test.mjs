import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const AURA_URL = process.env.KORA_AURA_E2E_URL
  || 'https://registro.crediteksas.com/creditek/agentes/';

test('AURA permite enfocar y escribir la contraseña con interacción real', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(AURA_URL, { waitUntil: 'domcontentloaded' });
      const password = page.getByLabel('Contraseña');

      await password.click();
      await password.fill('Prueba-E2E-no-real-2026');

      assert.equal(await password.inputValue(), 'Prueba-E2E-no-real-2026');
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        'login-pwd',
      );
      assert.equal(await password.getAttribute('autocomplete'), 'current-password');

      await password.press('Enter');
      assert.equal(await page.locator('#login-error').textContent(), 'Clave incorrecta');
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
