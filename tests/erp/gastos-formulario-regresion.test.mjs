import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const html = await readFile(path.join(root, 'creditek/erp/gastos.html'), 'utf8');

test('el formulario expone todos los campos soportados por gastos', () => {
  for (const id of [
    'gastoFecha',
    'gastoTienda',
    'gastoConcepto',
    'gastoMonto',
    'gastoDescripcion',
    'gastoResponsable',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Categoría \/ concepto/);
});

test('la fecha elegida y el responsable autenticado se conservan al registrar', () => {
  assert.match(html, /fecha:\s*fechaSeleccionada/);
  assert.match(html, /registrado_por:\s*currentUser\.id/);
  assert.match(html, /gastoResponsable/);
});

test('gerencia, auditoría y administración de tienda conservan el alta prevista', () => {
  assert.match(
    html,
    /puedeRegistrarGasto\(\)[\s\S]*admin_tienda[\s\S]*gerencia[\s\S]*auditoria/,
  );
  assert.match(
    html,
    /esCentral\(\)\s*\?\s*document\.getElementById\('gastoTienda'\)\.value\s*:\s*currentPerfil\.tienda_codigo/,
  );
});

test('no inventa soporte ni categoría fuera del esquema existente', () => {
  assert.doesNotMatch(html, /soporte_path\s*:/);
  assert.doesNotMatch(html, /categoria\s*:/);
});

test('todo gasto registrado entra a la cola hasta ser aprobado o rechazado', () => {
  const cola = html.match(
    /function renderColaAprobacion\(\)[\s\S]*?async function aprobarGasto/,
  )?.[0] || '';

  assert.match(cola, /g\.estado === 'registrado'/);
  assert.doesNotMatch(cola, /preautorizado/);
  assert.match(html, /estado:\s*'aprobado'/);
  assert.match(html, /estado:\s*'rechazado'/);
  assert.match(html, /nota_rechazo:\s*nota/);
});
