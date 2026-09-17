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
  assert.match(html, /<script src="kora-access-control\.js\?v=\d+\.\d+\.\d+"><\/script>/);
  assert.match(html, /<script src="sidebar\.js\?v=\d+\.\d+\.\d+" data-kora-shell="1\.0\.0"><\/script>/);
  assert.match(html, /<script src="traslados-domain\.js\?v=1\.0\.0"><\/script>/);
});

test('solo admin de la tienda destino puede confirmar recepción', () => {
  const regla = /currentPerfil\.rol === 'admin_tienda' &&\s*t\.estado === 'despachado' &&\s*currentPerfil\.tienda_codigo === t\.tienda_destino/g;
  assert.equal((html.match(regla) || []).length, 2);
  assert.doesNotMatch(html, /puedeRecibir = t\.estado === 'despachado' && \(esCentral\(\)/);
});

test('el visto bueno central queda separado de la recepción física', () => {
  assert.match(html, /t\.estado === 'recibido_pendiente_aprobacion'/);
  assert.match(html, /sb\.rpc\('aprobar_traslado_recepcion'/);
  assert.match(html, /Dar visto bueno y cerrar/);
  assert.match(html, /Mercancía bloqueada hasta validar IMEIs y costos/);
});

test('conserva resumen, bloqueos y textos operativos', () => {
  assert.match(html, /KoraTrasladosDomain\.resumir\(items \|\| \[\]\)/);
  assert.match(html, /resumen\.duplicados\.length/);
  assert.match(html, /resumen\.novedades\.length/);
  assert.match(html, /sb\.rpc\('ejecutar_traslado_despacho'/);
  assert.match(html, /La mercancía solo queda disponible/);
  assert.match(html, /Pendiente de aceptación en \$\{destino\}/);
});
