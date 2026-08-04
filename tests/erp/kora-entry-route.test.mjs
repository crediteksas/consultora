import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appHtml = fs.readFileSync(
  new URL('../../creditek/erp/app.html', import.meta.url),
  'utf8',
);

test('una sesión válida entra al destino resuelto por el control compartido', () => {
  assert.match(appHtml, /<script src="kora-access-control\.js\?v=2\.0\.6"><\/script>/);
  assert.match(appHtml, /const home = window\.KoraAccessControl\?\.homeFor\(perfil\)/);
  assert.match(appHtml, /window\.location\.replace\(home\)/);
});

test('la redirección ocurre solo después de validar perfil activo y cambio de clave', () => {
  const profileGuard = appHtml.indexOf('if (error || !perfil || !perfil.activo)');
  const passwordGuard = appHtml.indexOf("if (perfil.rol === 'admin_tienda' && !yaCambioClave)");
  const modernRedirect = appHtml.indexOf('window.location.replace(home)');

  assert.ok(profileGuard >= 0, 'debe conservar la validación del perfil');
  assert.ok(passwordGuard > profileGuard, 'debe validar el cambio obligatorio de clave');
  assert.ok(modernRedirect > passwordGuard, 'solo debe redirigir después de ambas guardas');
});

test('el acceso no vuelve a revelar la portada KPI heredada tras autenticar', () => {
  assert.doesNotMatch(
    appHtml,
    /document\.getElementById\('app'\)\.classList\.add\('show'\)/,
  );
  assert.doesNotMatch(appHtml, /if \(typeof initPagina === 'function'\) initPagina\(\)/);
});
