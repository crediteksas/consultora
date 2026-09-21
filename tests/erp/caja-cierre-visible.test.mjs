import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caja = await readFile(new URL('../../creditek/erp/caja.html', import.meta.url), 'utf8');
const panel = await readFile(new URL('../../creditek/erp/caja-ciclo-ui.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../creditek/workers/creditek-clientes/src/index.ts', import.meta.url), 'utf8');

test('la tienda ve y puede ejecutar el cierre manual del día actual', () => {
  assert.match(caja, /id="cierreCajaHoy"/);
  assert.match(caja, /Cerrar caja de hoy/);
  assert.match(caja, /rpc = cicloNuevo \? 'validar_arqueo_caja'/);
  assert.match(panel, /Ir al cierre de hoy/);
});

test('el respaldo automático se ejecuta cinco minutos antes del informe', () => {
  assert.match(worker, /esHoraCorteAutomatico\(hh, mm, limiteHora\)/);
  assert.match(worker, /await obtenerCorteOperativo\(hoy, env\)/);
});
