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
  assert.match(app, /Preparar pago del lote/);
  assert.match(app, /No debes aprobarlas una por una y no cambian el valor PAGAMOS/);
  assert.doesNotMatch(app, /Dar instrucción a Maythe/);
  assert.match(report, /Informe consolidado único de diferencias/);
  assert.match(report, /Este informe se genera una sola vez por lote/);
  assert.match(report, /Ver detalle de \$\{rows\.length\} diferencias/);
  assert.match(migration, /vence_el[\s\S]*\+ 7/);
});
