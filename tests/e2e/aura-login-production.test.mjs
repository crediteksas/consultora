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

test('AURA permite recorrer y activar las tres opciones inferiores', async t => {
  const passwordValue = process.env.KORA_AURA_E2E_PASSWORD;
  if (!passwordValue) {
    t.skip('KORA_AURA_E2E_PASSWORD es necesaria para validar el contenido autenticado.');
    return;
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(AURA_URL, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Contraseña').fill(passwordValue);
      await page.getByRole('button', { name: /Ingresar/ }).click();
      await page.waitForSelector('#app.visible');

      const options = page.locator('.tool-row');
      assert.equal(await options.count(), 3);

      for (let index = 0; index < 3; index += 1) {
        const option = options.nth(index);
        await option.scrollIntoViewIfNeeded();
        await expectVisibleAndClickable(option, page);
      }

      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

async function expectVisibleAndClickable(option, page) {
  assert.equal(await option.isVisible(), true);
  const box = await option.boundingBox();
  assert.ok(box);
  assert.ok(box.y >= 0);
  assert.ok(box.y + box.height <= (await page.evaluate(() => window.innerHeight)));

  const receivesPointer = await option.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + Math.min(rect.width / 2, 24),
      rect.top + rect.height / 2,
    );
    return hit === element || element.contains(hit);
  });
  assert.equal(receivesPointer, true);
}
