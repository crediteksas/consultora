import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import XLSX from 'xlsx';

const source=readFileSync(new URL('../../creditek/erp/conteos-ui.js',import.meta.url),'utf8');
const base=vm.createContext({window:{}});
vm.runInContext(source,base);
const {seleccionarCortesCerrados,agregarTotalTiendas,resumirValores}=base.window.KoraConteosUI;
const start=source.indexOf('    async function informeMensual() {');
const end=source.indexOf("    el('cerrar').onclick",start);
assert.ok(start>=0&&end>start);
const local=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value));
const tiendas=Array.from({length:9},(_,i)=>({codigo:`CK-0${i+1}`,nombre:`Tienda ${i+1}`}));
const cut=(store,extra={})=>({id:`corte-${store}`,tienda_codigo:store,estado:'aplicado',base_conteo:'corte_fijo',
  corte_at:'2026-10-07T15:00:00Z',contado_at:'2026-10-07T15:00:00Z',autorizado_at:'2026-10-10T15:00:00Z',...extra});
function harness({central=true,mes='2026-10',resumido=true,cortes=tiendas.map(t=>cut(t.codigo)),resultados={}}={}) {
  const calls=[],exports=[],elements={'mes':{value:mes},'mes-resumido':{checked:resumido}};
  const context=vm.createContext({config:{central,tiendas},local,seleccionarCortesCerrados,agregarTotalTiendas,resumirValores,XLSX,
    el:id=>elements[id],obtenerHistorial:async filters=>{calls.push({action:'historial',filters});return cortes;},
    rpc:async(action,data)=>{calls.push({action,...data});return {lineas:[{nombre:'Producto',codigo:'REF',cantidad_corte:11,cantidad_fisica:10,diferencia:-1,costo_tienda:100}]};},
    sb:{rpc:async(name,args)=>{calls.push({name,...args});const codigo=cortes.find(c=>c.id===args.p_corte_id).tienda_codigo;
      return resultados[codigo]||{data:{corte_id:args.p_corte_id,inicio_at:'2026-09-04T05:00:00Z',fin_at:'2026-10-07T15:00:00Z',
        ventas_totales:1000,costo_vendido:600,gastos_totales:100,perdidas_ajustes:20,ganancias_ajustes:10,ajuste_conciliacion:5,utilidad_neta:295,cerrado:true,listo:true}};}},
    hoja:(book,rows,name)=>XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),name),
    guardarLibro:(book,name)=>exports.push({book,name}),
  });
  const run=vm.runInContext(`${source.slice(start,end)}\ninformeMensual;`,context);
  return {run,calls,exports};
}

test('el botón mensual está en la misma pestaña, tiene mes seleccionable y no se ofrece a la tienda',()=>{
  assert.match(readFileSync(new URL('../../creditek/erp/inventario.html',import.meta.url),'utf8'),/conteos-ui\.js\?v=1\.2\.3/);
  assert.match(source,/id="conteos-mensual-panel"[^>]*hidden/);
  assert.match(source,/id="conteos-mes" type="month"/);
  assert.match(source,/id="conteos-informe-mes"[^>]*>Descargar informe de inventarios del mes/);
  assert.match(source,/el\('informe-mes'\)\.onclick=\(\)=>run\(informeMensual\)/);
  assert.match(source,/el\('mensual-panel'\)\.hidden=!config\.central/);
});

test('último inventario cerrado del mes excluye anulados, abiertos, históricos y otras fechas',()=>{
  const valid=cut('A'),later=cut('A',{id:'ultimo',corte_at:'2026-10-10T10:00:00Z'});
  const selected=seleccionarCortesCerrados([valid,later,cut('A',{id:'anulado',estado:'rechazado',corte_at:'2026-10-14T10:00:00Z'}),
    cut('A',{id:'abierto',estado:'abierto',corte_at:'2026-10-15T10:00:00Z'}),
    cut('A',{id:'historico',revision_fuente:{solo_comparativo:true},corte_at:'2026-10-16T10:00:00Z'}),
    cut('A',{id:'noviembre',corte_at:'2026-11-01T06:00:00Z'}),cut('B',{estado:'sin_diferencias'})],'2026-10');
  assert.equal(selected.get('A').id,'ultimo');assert.equal(selected.get('B').estado,'sin_diferencias');
  assert.equal(seleccionarCortesCerrados([cut('A',{corte_at:'2026-10-01T02:00:00Z'})],'2026-10').size,0,'La fecha se interpreta en Colombia');
  assert.equal(seleccionarCortesCerrados([cut('A',{corte_at:'2026-11-01T02:00:00Z'})],'2026-10').size,1);
});
test('resumido contiene nueve tiendas, ventas, gastos, utilidad e inventario con total numérico',async()=>{
  const h=harness();await h.run();const {book,name}=h.exports[0];
  assert.equal(name,'inventarios-2026-10-resumido.xlsx');assert.deepEqual(book.SheetNames,['Resumen tiendas']);
  const rows=XLSX.utils.sheet_to_json(book.Sheets['Resumen tiendas'],{defval:''});
  assert.equal(rows.length,10);assert.equal(rows[0].Ventas,1000);assert.equal(rows[0].Gastos,100);assert.equal(rows[0]['Utilidad neta'],295);
  assert.equal(rows[0]['Inventario al corte'],1000);assert.equal(rows.at(-1).Tienda,'TOTAL GENERAL');
  assert.equal(rows.at(-1).Ventas,9000);assert.equal(rows.at(-1)['Utilidad neta'],2655);assert.equal(rows.at(-1)['Inventario al corte'],9000);
  assert.equal(book.Sheets['Resumen tiendas'].B2.t,'n');assert.equal(book.Sheets['Resumen tiendas'].B2.z,'dd/mm/yyyy hh:mm');
  assert.equal(book.Sheets['Resumen tiendas'].D2.t,'n');assert.match(book.Sheets['Resumen tiendas'].D2.z,/#,##0\.00/);
  assert.deepEqual({...h.calls[0].filters},{desde:'2026-10-01',hasta:'2026-10-31',tienda:'',responsable:''});
  assert.equal(h.calls.filter(c=>c.name==='cierre_utilidad_retail').length,9);
  assert.ok(h.calls.filter(c=>c.name).every(c=>c.p_accion==='vista'),'Descargar no aplica ajustes ni guarda cierres');
});
test('completo añade detalle del mismo corte, con total de inventario y diferencias',async()=>{
  const h=harness({resumido:false});await h.run();const {book}=h.exports[0];
  assert.deepEqual(book.SheetNames,['Resumen tiendas','Detalle inventario']);
  const rows=XLSX.utils.sheet_to_json(book.Sheets['Detalle inventario'],{defval:''});
  assert.equal(rows.length,10);assert.equal(rows.at(-1)['Valor inventario'],9000);assert.equal(rows.at(-1)['Valor diferencia'],-900);
  assert.equal(Object.hasOwn(rows.at(-1),'Estado'),false,'El detalle no agrega una columna Estado solo para el total');
});
test('tienda sin corte o cálculo fallido no desaparece y no se convierte en cero',async()=>{
  const h=harness({cortes:tiendas.slice(0,8).map(t=>cut(t.codigo)),resultados:{'CK-01':{error:{message:'Servicio no disponible'}}}});
  const message=await h.run();const rows=XLSX.utils.sheet_to_json(h.exports[0].book.Sheets['Resumen tiendas'],{defval:''});
  assert.equal(rows.length,10);assert.equal(rows[0]['Utilidad neta'],'');assert.equal(rows[8].Estado,'Sin inventario cerrado en el mes');
  assert.equal(rows.at(-1).Tienda,'TOTAL INCOMPLETO');assert.equal(rows.at(-1)['Utilidad neta'],'');assert.match(message,/Servicio no disponible/);
});
test('validaciones se indican como provisionales y sus motivos quedan en el software, no en el Excel',async()=>{
  const u={data:{inicio_at:'2026-09-04T05:00:00Z',ventas_totales:1000,costo_vendido:600,gastos_totales:100,perdidas_ajustes:20,
    ganancias_ajustes:10,ajuste_conciliacion:5,utilidad_neta:295,cerrado:false,listo:false,bloqueos:['Revisar fecha comercial.']}};
  const h=harness({resultados:{'CK-01':u}});const message=await h.run();
  const rows=XLSX.utils.sheet_to_json(h.exports[0].book.Sheets['Resumen tiendas'],{defval:''});
  assert.equal(rows[0].Estado,'Por validar');assert.equal(rows.at(-1).Tienda,'TOTAL PROVISIONAL');assert.match(message,/Revisar fecha comercial/);
  assert.equal(JSON.stringify(rows).includes('Revisar fecha comercial'),false);
});
test('permisos, mes inválido y utilidad incoherente impiden emitir un informe incorrecto',async()=>{
  for(const options of [{central:false},{mes:'2026-13'},{mes:''}]) {
    const h=harness(options);await assert.rejects(h.run());assert.equal(h.exports.length,0);assert.equal(h.calls.length,0);
  }
  const h=harness({resultados:{'CK-01':{data:{ventas_totales:1000,costo_vendido:600,gastos_totales:100,perdidas_ajustes:20,
    ganancias_ajustes:10,ajuste_conciliacion:5,utilidad_neta:999,cerrado:true}}}});
  await assert.rejects(h.run(),/no cuadra/);assert.equal(h.exports.length,0);
});
test('totales conservan pérdidas, decimales, ceros y no duplican filas',()=>{
  const result=agregarTotalTiendas([{Tienda:'A',Neto:-10.25,Estado:'Confirmada'},{Tienda:'B',Neto:0,Estado:'Confirmada'}],['Neto']);
  assert.equal(result.length,3);assert.equal(result.at(-1).Neto,-10.25);assert.equal(result.at(-1).Tienda,'TOTAL GENERAL');
});
