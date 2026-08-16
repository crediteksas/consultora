import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/traslados.html', import.meta.url),
  'utf8',
);

test('traslados integra dominio versionado y shell KORA', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="\/config\/kora-environment\.generated\.js"><\/script>/);
  assert.match(html, /<script src="kora-access-control\.js\?v=2\.0\.14"><\/script>/);
  assert.match(html, /<script src="sidebar\.js\?v=2\.0\.14" data-kora-shell="1\.0\.0"><\/script>/);
  assert.match(html, /<script src="traslados-domain\.js\?v=1\.0\.0"><\/script>/);
});

test('solo admin de la tienda destino puede confirmar recepción', () => {
  const regla = /currentPerfil\.rol === 'admin_tienda' &&\s*t\.estado === 'despachado' &&\s*currentPerfil\.tienda_codigo === t\.tienda_destino/g;
  assert.equal((html.match(regla) || []).length, 2);
  assert.doesNotMatch(html, /puedeRecibir = t\.estado === 'despachado' && \(esCentral\(\)/);
});

test('conserva resumen, bloqueos y textos operativos', () => {
  assert.match(html, /KoraTrasladosDomain\.resumir\(items \|\| \[\]\)/);
  assert.match(html, /resumen\.duplicados\.length/);
  assert.match(html, /resumen\.novedades\.length/);
  assert.match(html, /sb\.rpc\('ejecutar_traslado_despacho'/);
  assert.match(html, /La mercancía queda “En traslado” y no se puede vender/);
  assert.match(html, /Pendiente de aceptación en \$\{destino\}/);
});
