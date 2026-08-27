import { test, expect } from '@playwright/test';

const appUrl = process.env.AURA_LOCAL_URL || 'http://127.0.0.1:4177/index.html';

async function openAura(page, roleId = 'aura.owner') {
  await page.addInitScript(() => {
    localStorage.setItem('aura_supabase_session_v1', JSON.stringify({
      access_token: 'fixture-access',
      refresh_token: 'fixture-refresh',
      expires_at: 4102444800,
    }));
  });
  await page.route('https://ditiwpndvmyuqcagupea.supabase.co/**', async route => {
    if (route.request().url().includes('aura_meta_ads_my_access')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false, permissions: [] }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        apps: [
          { app_id: 'sofia', role_id: roleId, permissions: ['sofia.use'] },
          { app_id: 'portal_b2b', role_id: roleId, permissions: ['portal.read'] },
        ],
      }),
    });
  });
  await page.goto(appUrl);
  await expect(page.locator('#app')).toHaveClass(/visible/);
}

test('los seis grupos alternan con acordeón y resaltan la ruta activa', async ({ page }) => {
  await openAura(page);
  const groups = ['agentes-ia', 'clientes', 'nova-autorizaciones', 'cartera', 'comercial', 'sistema'];
  for (const key of groups) {
    const header = page.locator(`[data-sidebar-group="${key}"]`);
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    for (const other of groups.filter(value => value !== key)) {
      await expect(page.locator(`[data-sidebar-group="${other}"]`)).toHaveAttribute('aria-expanded', 'false');
    }
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  }

  await page.locator('[data-sidebar-group="sistema"]').click();
  await page.getByText('Incidencias', { exact: true }).click();
  await expect(page.getByText('Incidencias', { exact: true }).locator('..')).toHaveClass(/active/);
  await expect(page.locator('[data-sidebar-group="sistema"]')).toHaveAttribute('aria-expanded', 'true');
});

for (const width of [1366, 1440, 1920]) {
  test(`sidebar conserva layout y navegación a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openAura(page);
    await page.locator('[data-sidebar-group="cartera"]').click();
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('[data-sidebar-group="cartera"]')).toHaveAttribute('aria-expanded', 'true');
    const box = await sidebar.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(200);
    expect(box?.x).toBe(0);
  });
}

test('los módulos owner permanecen ocultos para otros roles', async ({ page }) => {
  await openAura(page, 'sofia.agent');
  await expect(page.locator('[data-aura-owner-module]:visible')).toHaveCount(0);
  await expect(page.locator('[data-sidebar-group="agentes-ia"]')).toBeVisible();
  await page.locator('[data-sidebar-group="agentes-ia"]').click();
  await expect(page.locator('[data-sidebar-group-items="agentes-ia"] .nav-label').filter({ hasText: 'Sofía' })).toBeVisible();
});
