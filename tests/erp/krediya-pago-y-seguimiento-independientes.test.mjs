import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260905182536_krediya_separar_pago_y_seguimiento.sql','utf8');
const app = fs.readFileSync('creditek/erp/aliados-liquidaciones-app.js','utf8');
const report = fs.readFileSync('creditek/erp/krediya-tarifario.js','utf8');

test('diferencias Krediya y anotaciones administrativas no bloquean PAGAMOS', () => {
  assert.match(migration, /i\.tipo in \([\s\S]*'krediya_regla_precio_ausente'[\s\S]*'novedad_administrativa'/);
  assert.match(migration, /set bloquea_aprobacion = false/);
  assert.match(migration, /v_seguimiento := v_plataforma = 'krediya'/);
  assert.match(migration, /'bloquea_aprobacion', not v_seguimiento/);
});

test('Gerencia aprueba el lote una vez y el seguimiento queda consolidado por siete días', () => {
  assert.match(app, /Liquidación aprobada\.[^\n]*Gestionar en Tesorería/);
  assert.match(app, /No requieren aprobación individual ni cambian PAGAMOS/);
  assert.doesNotMatch(app, /Dar instrucción a Maythe/);
  assert.match(report, /Informe consolidado del lote/);
  assert.match(report, /Al liquidar se guardan el informe definitivo, los bonos y la utilidad/);
  assert.match(report, /Las correcciones se gestionan durante los 7 días siguientes/);
  assert.match(report, /\$\{rows\.length\} diferencias de PVP/);
  assert.match(migration, /vence_el[\s\S]*\+ 7/);
});
