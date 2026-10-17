import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(path, 'utf8');
const source = await read('creditek/erp/kora-report-export.js');
const context=vm.createContext({window:{},document:{dispatchEvent(){}},CustomEvent:function(){}});
vm.runInContext(source,context);
const {summaryTables,pdfDocument,typedCell}=context.window.KoraReportExport;
const {completeTable,totalValue}=context.window.KoraReportExport;

test('adaptadores nativos conservan números con centavos sin volverlos texto',()=>{
  assert.equal(typedCell(100000.25,'Valor COP').value,100000.25);
  assert.equal(typedCell(100000.25,'Valor COP').kind,'currency');
  assert.equal(typedCell(2.5,'Cantidad').kind,'number');
  assert.equal(typedCell(123456789,'Identificación').kind,'text');
});

test('totales declarados suman importes exactos, no precios ni saldos corridos; margen ponderado',()=>{
  const table={heading:'Venta',kind:'detail',headers:['Ref','Cantidad','Precio unitario','Facturado','Costo','Margen','Margen %','Saldo acumulado'],rows:[['A','1','$ 100','$ 100','$ 50','$ 50','50 %','$ 1.000'],['B','9','$ 100','$ 900','$ 810','$ 90','10 %','$ 1.900']],sumColumns:[1,3,4,5],currencyColumns:[3,4,5],ratios:[[6,5,3]]};
  const report=completeTable(table),footer=report.totalRows[0];
  assert.equal(footer[1],'10');assert.equal(footer[2],'');assert.equal(footer[7],'');
  assert.equal(typedCell(footer[3],'Facturado').value,1000);
  assert.equal(footer[6],'14 %');
  assert.equal(typedCell(totalValue(['$ 0,10','$ 0,20','-$ 0,05'],true).text,'Valor').value,.25);
  assert.deepEqual(JSON.parse(JSON.stringify(summaryTables([report])[0].rows)),[footer.filter((_,column)=>[0,1,3,4,5,6].includes(column))]);
});

test('totales desconocidos no son cero y deudas no se compensan entre terceros',()=>{
  const missing=completeTable({headers:['Producto','Cantidad','Valor'],rows:[['A',2,'$ 10'],['B',3,'Sin costo registrado']],sumColumns:[1,2],currencyColumns:[2]});
  assert.match(missing.totalRows[0][2],/Pendiente: 1/);
  const debts=completeTable({headers:['Proveedor','Saldo'],rows:[['A','$ 100'],['B','-$ 30']],balanceColumns:[1]});
  assert.equal(typedCell(debts.totalRows[0][1],'Saldo').value,100);
  assert.equal(typedCell(debts.totalRows[1][1],'Saldo').value,30);
});

test('resumido de presupuestos omite días pero conserva el total mensual declarado',()=>{
  const table={heading:'Octubre · créditos',kind:'detail',headers:['Tienda','1','2','Total mes'],rows:[['A','10','0','10']],totalRows:[['Total','10','0','10']],summaryColumns:[0,3]};
  const summary=summaryTables([table])[0];assert.deepEqual(Array.from(summary.headers),['Tienda','Total mes']);assert.equal(JSON.stringify(summary.rows),'[["Total","10"]]');
});

test('liquidaciones PDF usa resultados de fórmulas y totaliza solo incluidas, sin tasas',()=>{
  const table={heading:'Lote',structured:true,headers:['Fecha','Comercio','IMEI','Referencia','Cliente','Incluida','Valor'],columns:Array.from({length:7},()=>['',20]),rows:[[null,'A','000001','','','Sí',{formula:'G6',result:100}],[null,'B','000002','','','No',{formula:'G7',result:50}]],totals:['G']};
  const full=completeTable(table);assert.equal(typedCell(full.totalRows[0][6],'Valor').value,100);
  const summary=summaryTables([full])[0];assert.equal(summary.structured,false);assert.equal(summary.headers.length,2);assert.deepEqual(Array.from(summary.rows[0]),['Total','$ 100,00']);
  const report={title:'Lote',id:'PRUEBA',mode:'detailed',filters:[],metrics:[],tables:[full]};
  const html=pdfDocument(report);assert.doesNotMatch(html,/\[object Object\]/);assert.match(html,/000001/);
});

test('el shell instala informes Excel y PDF en todas las pantallas KORA', async () => {
  const [shell, exporter] = await Promise.all([
    read('creditek/erp/sidebar.js'),
    read('creditek/erp/kora-report-export.js'),
  ]);
  assert.match(shell, /kora-report-export\.js\?v=1\.4\.2/);
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
  assert.doesNotMatch(exporter, /SUBTOTAL\(109|SUBTOTAL\(101|sumHeader/);
  assert.match(exporter, /SUBTOTAL\(103/);
  assert.match(exporter, /const declaredTotals=table.explicitTotals/);
  assert.match(exporter, /Total de registros'[\s\S]*result:controls\.reduce/);
  assert.match(exporter, /addTable/);
  assert.match(exporter, /Control del archivo/);
  assert.match(exporter, /acciones\?\|acción\|seleccionar/);
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

test('PDF vertical conserva cuentas completas, notas y encabezados y compacta detalles anchos',()=>{
  const report={title:'Informe <prueba>',id:'KORA-REP-TEST',mode:'detailed',generated:'6/10/2026',user:'Óscar',role:'gerencia',route:'/creditek/erp/b2b-dashboard',filters:[['Periodo','Septiembre']],metrics:[['Total','$ 53.734.962']],notes:['Desglose parcial: hay créditos sin cálculo completo.'],tables:[{heading:'Pagos',headers:['Titular','Banco','Cuenta','Valor','Estado','Referencia'],rows:[['Mayte','Bancolombia','004490094309','$ 450.000','Aprobado','Venta <uno>']]}]};
  const html=pdfDocument(report);
  assert.match(html,/@page\{size:A4 portrait/);
  assert.doesNotMatch(html,/landscape/);
  assert.match(html,/class="compact-detail"/);
  assert.match(html,/<small>Cuenta<\/small><b>004490094309<\/b>/);
  assert.match(html,/hay créditos sin cálculo completo/);
  assert.match(html,/Informe &lt;prueba&gt;/);
  assert.match(html,/Venta &lt;uno&gt;/);
  assert.match(html,/Creditek S\.A\.S\./);
  assert.match(html,/>KORA<\/span>/);
});

test('las dos aclaraciones internas de Aliados permanecen en KORA pero no se exportan',async()=>{
  const app=await read('creditek/erp/aliados-v1-1-app.js');
  const notes=app.match(/<p\b[^>]*data-kora-report-note[^>]*>[\s\S]*?<\/p>/g)||[];
  for(const text of ['Utilidad de liquidaciones: antes de gastos operativos','de gastos generales de Aliados no se distribuyen']){
    const note=notes.find(html=>html.includes(text));
    assert.ok(note,`mantener la aclaración en el software: ${text}`);
    assert.match(note,/data-kora-no-export/);
  }
  assert.doesNotMatch(notes.find(html=>html.includes('Desglose parcial:')),/data-kora-no-export/,'conservar las advertencias de datos incompletos');
  assert.match(source,/\[data-kora-no-export\]/);
});

test('Excel resumido no reintroduce detalle por hooks ni suma conciliaciones nuevamente',()=>{
  assert.match(source,/if\(window\.KoraReportData\?\.prepareExcel\)report=await window\.KoraReportData\.prepareExcel\(report\)/);
  assert.match(source,/if\(mode==='summary'\)report\.tables=summaryTables\(report\.tables\)/);
  assert.match(source,/table\.kind==='summary'&&!table\.sumColumns\?\.length/);
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
