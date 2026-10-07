import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(path, 'utf8');
const source = await read('creditek/erp/kora-report-export.js');
const context=vm.createContext({window:{},document:{dispatchEvent(){}},CustomEvent:function(){}});
vm.runInContext(source,context);
const {summaryTables,pdfDocument,typedCell}=context.window.KoraReportExport;

test('el shell instala informes Excel y PDF en todas las pantallas KORA', async () => {
  const [shell, exporter] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('creditek/erp/kora-report-export.js'),
  ]);
  assert.match(shell, /kora-report-export\.js\?v=1\.3\.0/);
  assert.match(shell, /KoraReportExport\?\.mount/);
  assert.match(exporter, /data-format="xlsx"/);
  assert.match(exporter, /data-format="pdf"/);
  assert.match(exporter, /ExcelJS/);
  assert.match(exporter, /Descargar Excel/);
  assert.match(exporter, /Resumido · solo totales/);
  assert.match(exporter, /Detallado · datos y movimientos/);
  assert.match(exporter, /window\.print\(\)/);
});

test('los informes de tienda identifican y restringen su alcance visible', async () => {
  const exporter = await read('creditek/erp/kora-report-export.js');
  assert.match(exporter, /\['admin_tienda','asesor'\]\.includes\(role\)/);
  assert.match(exporter, /Alcance del informe/);
  assert.match(exporter, /profile\?\.tienda_codigo/);
  assert.doesNotMatch(exporter, /querySelector\('#koraStoreSelector/);
  assert.match(exporter, /selector=filterInputs\(\)/);
  assert.match(exporter, /summary\.getCell\('A9'\)\.value='Alcance'/);
  assert.match(exporter, /reportScope/);
  assert.match(exporter, /includeStoreNames\(report,sb\)/);
  assert.match(exporter, /from\('origenes'\)\.select\('codigo,nombre'\)/);
  assert.match(exporter, /\$\{name\} · \$\{code\}/);
});

test('el Excel común usa datos tipados, fórmulas, tablas y no exporta botones de acciones', async () => {
  const exporter = await read('creditek/erp/kora-report-export.js');
  assert.match(exporter, /function typedCell/);
  assert.match(exporter, /SUBTOTAL\(109/);
  assert.match(exporter, /SUBTOTAL\(103/);
  assert.match(exporter, /result:numericTotals\[column\]/);
  assert.match(exporter, /Total de registros'[\s\S]*result:controls\.reduce/);
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

test('resumido usa únicamente agregados o totales explícitos y no suma saldos/precios',()=>{
  const items=[
    {heading:'Operaciones',kind:'detail',headers:['Nombre','Saldo'],rows:[['Ana','$ 100'],['Ana','$ 80']]},
    {heading:'Cómo se obtiene la utilidad',kind:'summary',headers:['Concepto','Valor'],rows:[['Bruta','$ 100'],['Neta','$ 80']]},
    {heading:'Ventas',kind:'detail',headers:['Tienda','Total'],rows:[['A','$ 20'],['B','$ 40']],totalRows:[['TOTAL','$ 60']]},
  ];
  const before=JSON.stringify(items),selected=summaryTables(items);
  assert.deepEqual(Array.from(selected,t=>t.heading),['Cómo se obtiene la utilidad','Totales · Ventas']);
  assert.equal(JSON.stringify(selected[1].rows),JSON.stringify([['TOTAL','$ 60']]));
  assert.equal(JSON.stringify(items),before);
  assert.doesNotMatch(JSON.stringify(selected),/Ana/);
});

test('PDF vertical conserva cuentas completas, notas y encabezados y apila detalles anchos',()=>{
  const report={title:'Informe <prueba>',id:'KORA-REP-TEST',mode:'detailed',generated:'6/10/2026',user:'Óscar',role:'gerencia',route:'/creditek/erp/b2b-dashboard',filters:[['Periodo','Septiembre']],metrics:[['Total','$ 53.734.962']],notes:['Utilidad parcial: falta repartir gastos generales.'],tables:[{heading:'Pagos',headers:['Titular','Banco','Cuenta','Valor','Estado','Referencia'],rows:[['Mayte','Bancolombia','004490094309','$ 450.000','Aprobado','Venta <uno>']]}]};
  const html=pdfDocument(report);
  assert.match(html,/@page\{size:A4 portrait/);
  assert.doesNotMatch(html,/landscape/);
  assert.match(html,/class="record"/);
  assert.match(html,/<dt>Cuenta<\/dt><dd>004490094309<\/dd>/);
  assert.match(html,/falta repartir gastos generales/);
  assert.match(html,/Informe &lt;prueba&gt;/);
  assert.match(html,/Venta &lt;uno&gt;/);
  assert.match(html,/Creditek S\.A\.S\./);
  assert.match(html,/>KORA<\/span>/);
});

test('Excel resumido no reintroduce detalle por hooks ni suma conciliaciones nuevamente',()=>{
  assert.match(source,/report\.mode!=='summary'&&window\.KoraReportData\?\.prepareExcel/);
  assert.match(source,/if\(table\.kind==='summary'\)return/);
  assert.doesNotMatch(source,/orientation:'landscape'/);
});

test('Excel conserva descuentos negativos como números exactos, no texto',()=>{
  const cell=typedCell('-$ 1.800.000,00','Valor');
  assert.equal(cell.value,-1800000);assert.equal(cell.kind,'currency');
  assert.equal(typedCell('$ -214.939,85','Valor').value,-214939.85);
  assert.equal(typedCell('$ 7.650.360,09','Valor').value,7650360.09);
});

test('todos los informes son completos por defecto; casilla Resumido permite solo totales',()=>{
  const checkbox=source.match(/<input type="checkbox" data-kora-report-summary[^>]*>/)?.[0];
  assert.ok(checkbox);
  assert.doesNotMatch(checkbox,/\bchecked\b/);
  assert.match(source,/Sin marcar: informe completo/);
  assert.match(source,/querySelector\('\[data-kora-report-summary\]'\)\.checked\?'summary':'detailed'/);
});
