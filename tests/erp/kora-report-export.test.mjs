import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('el shell instala informes Excel y PDF en todas las pantallas KORA', async () => {
  const [shell, exporter] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('creditek/erp/kora-report-export.js'),
  ]);
  assert.match(shell, /kora-report-export\.js\?v=1\.2\.0/);
  assert.match(shell, /KoraReportExport\?\.mount/);
  assert.match(exporter, /data-format="xlsx"/);
  assert.match(exporter, /data-format="pdf"/);
  assert.match(exporter, /ExcelJS/);
  assert.match(exporter, /Descargar Excel completo/);
  assert.match(exporter, /window\.print\(\)/);
});

test('el Excel común usa datos tipados, fórmulas, tablas y no exporta botones de acciones', async () => {
  const exporter = await read('creditek/erp/kora-report-export.js');
  assert.match(exporter, /function typedCell/);
  assert.match(exporter, /SUBTOTAL\(109/);
  assert.match(exporter, /SUBTOTAL\(103/);
  assert.match(exporter, /addTable/);
  assert.match(exporter, /Control del archivo/);
  assert.match(exporter, /!\/\^acciones\?\$\/i/);
  assert.doesNotMatch(exporter, /slice\(0,10000\)/);
});

test('cada informe conserva marca, parámetros y trazabilidad', async () => {
  const exporter = await read('creditek/erp/kora-report-export.js');
  assert.match(exporter, /creditek-logo\.png/);
  assert.match(exporter, /KORA-REP-/);
  assert.match(exporter, /Código de trazabilidad/);
  assert.match(exporter, /Trazabilidad KORA/);
  assert.match(exporter, /p_filtros:Object\.fromEntries\(report\.filters\)/);
  assert.match(exporter, /p_registros:records/);
});

test('la auditoría de exportación exige sesión activa y formatos permitidos', async () => {
  const sql = await read('supabase/migrations/20260903021134_kora_exportaciones_trazables.sql');
  assert.match(sql, /where id = auth\.uid\(\) and activo = true/);
  assert.match(sql, /p_formato not in \('xlsx', 'pdf'\)/);
  assert.match(sql, /insert into public\.audit_log/);
  assert.match(sql, /revoke all .* from public, anon;/s);
  assert.match(sql, /grant execute .* to authenticated;/s);
});
