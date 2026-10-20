import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(`creditek/erp/${name}`, 'utf8');
function section(file, start, end) {
  const text = read(file), from = text.indexOf(start), to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `No se encontró ${start}`);
  return text.slice(from, to);
}
function elements(values = {}) {
  const nodes = new Map();
  return { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {value: values[id] ?? '', textContent:'', innerHTML:'', style:{}, dataset:{}, querySelector(){return null;}});
    return nodes.get(id);
  }};
}
function database(tables, {failPage = false} = {}) {
  const calls = [];
  return {calls, rpc:async()=>({data:[], error:null}), from(table) {
    let rows = [...(tables[table] || [])];
    const q = {
      select(){return q;}, order(key, {ascending=true}={}){rows.sort((a,b)=>(a[key]>b[key]?1:a[key]<b[key]?-1:0)*(ascending?1:-1));return q;},
      gte(){return q;}, lte(){return q;}, neq(){return q;}, in(){return q;}, eq(){return q;},
      async range(from,to){calls.push({table,from,to});return failPage && from>0?{data:null,error:new Error('página no disponible')}:{data:rows.slice(from,to+1),error:null};},
      then(resolve,reject){return Promise.resolve({data:rows.slice(0,1000),error:null}).then(resolve,reject);},
    }; return q;
  }};
}
function context(extra) {
  const ctx = vm.createContext({window:{}, console, ...extra});
  vm.runInContext(read('reportes-query-cache.js'),ctx);
  ctx.queryCache = ctx.window.CreditekReportesQueryCache;
  vm.runInContext(section('reportes.html','function costoConocido(','function totalesReporte('),ctx);
  ctx.footers={};ctx.totalesReporte=(id,rows)=>{ctx.footers[id]=rows;};
  return ctx;
}

test('Ventas carga las 1268 ventas con total completo, no las primeras 1000',async()=>{
  const sb=database({ventas:Array.from({length:1268},(_,i)=>({id:i+1,total:100,created_at:String(i)}))});
  const ctx=context({sb,document:elements({filtroDesde:'2026-10-01',filtroHasta:'2026-10-20'}),renderTablaVentas(){}});
  vm.runInContext('let ventasCache=[]; let ventasConsulta=0;'+section('ventas.html','async function cargarVentas()','function renderTablaVentas()'),ctx);
  await ctx.cargarVentas();
  const rows=vm.runInContext('ventasCache',ctx);
  assert.equal(rows.length,1268);
  assert.equal(rows.reduce((sum,r)=>sum+r.total,0),126800);
  assert.equal(new Set(rows.map(r=>r.id)).size,1268);
  assert.ok(sb.calls.length>=3);
});

test('Ventas no deja un total anterior visible si falla una página posterior',async()=>{
  const sb=database({ventas:Array.from({length:1201},(_,i)=>({id:i+1}))},{failPage:true});
  const document=elements(); let rendered=0;
  const ctx=context({sb,document,renderTablaVentas(){rendered++;}});
  vm.runInContext('let ventasCache=[{id:999,total:999}]; let ventasConsulta=0;'+section('ventas.html','async function cargarVentas()','function renderTablaVentas()'),ctx);
  await ctx.cargarVentas();
  assert.equal(vm.runInContext('ventasCache.length',ctx),0);
  assert.match(document.getElementById('emptyState').textContent,/página no disponible/);
  assert.equal(document.getElementById('resumenTotal').textContent,'—');
});

test('Rentabilidad por categoría incluye 1572 artículos con filtros conservados',async()=>{
  const sb=database({venta_items_lectura:Array.from({length:1572},(_,i)=>({id:i+1,cantidad:1,precio_venta:2,costo_congelado:1,productos:{categoria:'A',categorias_producto:{nombre:'Accesorios'}},ventas:{tienda_codigo:'A'}}))});
  const document=elements();
  const ctx=context({sb,document,esCentral:()=>true,getPeriodo:()=>({desde:'2026-10-01',hasta:'2026-10-20'}),aplicarFiltroTienda:q=>q,tiendaVisible:()=>true,charts:{},esc:String,num:String,money:String,pct:()=>'',Chart:class{}});
  vm.runInContext(section('reportes.html','async function cargarRentabilidadCategoria()','// 3.1 CRECIMIENTO'),ctx);
  await ctx.cargarRentabilidadCategoria();
  assert.match(document.getElementById('tbody-rent-categoria').innerHTML,/>3144</);
  assert.ok(sb.calls.length>=4);
  assert.equal(ctx.footers['tbody-rent-categoria'][0][2],'3144');
});

test('costo ausente no se convierte en utilidad; cero explícito sí es un costo conocido',async()=>{
  const sb=database({venta_items_lectura:[{id:1,cantidad:1,precio_venta:10,costo_congelado:null,productos:{categoria:'A'},ventas:{tienda_codigo:'A'}},{id:2,cantidad:1,precio_venta:10,costo_congelado:0,productos:{categoria:'B'},ventas:{tienda_codigo:'A'}}]});
  const document=elements(),ctx=context({sb,document,esCentral:()=>true,getPeriodo:()=>({desde:'2026-10-01',hasta:'2026-10-20'}),aplicarFiltroTienda:q=>q,tiendaVisible:()=>true,charts:{},esc:String,num:String,money:String,pct:()=>'',Chart:class{}});
  vm.runInContext(section('reportes.html','async function cargarRentabilidadCategoria()','// 3.1 CRECIMIENTO'),ctx);await ctx.cargarRentabilidadCategoria();
  assert.match(document.getElementById('tbody-rent-categoria').innerHTML,/Por confirmar/);
  assert.equal(ctx.footers['tbody-rent-categoria'][0][4],'Por confirmar');
});

test('Crecimiento usa todas las ventas operativas del año, incluso después de mil',async()=>{
  const sb=database({ventas:Array.from({length:1268},(_,i)=>({id:i+1,total:1,fecha:'2026-10-01',tienda_codigo:'A'}))});
  let consumed=0;
  const ctx=context({sb,document:elements(),aplicarFiltroTienda:q=>q,exigirRespuestas(){},esc:String,money:String,charts:{},Chart:class{},CreditekReportesHistorico:{serie2026(rows){consumed=rows.length;return Array.from({length:12},()=>({total:1,fuente:'operativa'}));}}});
  vm.runInContext(section('reportes.html','async function cargarCrecimiento()','async function cargarTopProductos()'),ctx);
  await ctx.cargarCrecimiento();
  assert.equal(consumed,1268);
});

test('Tablero resta bajas no monetarias de la utilidad de cada tienda',async()=>{
  const document=elements(), retail={itemRows:[{store:'A',value:1000}],expenses:[{tienda_codigo:'A',monto:100}],writeoffs:[{tienda_codigo:'A',valor:200}],generalExpenses:[],generalAvailable:true,sales:[]};
  let actual;
  const ctx=vm.createContext({sb:{},document,console,tiendasCache:[{codigo:'A',nombre:'Tienda A'}],tablaConsulta:0,rangoSeleccionado:()=>({desde:'2026-10-01',hasta:'2026-10-20'}),fechaISO:()=> '2026-10-20',hoyISO:()=> '2026-10-20',obtenerCreditosLiquidaciones:async()=>({}),creditosTiendas:()=>[],CreditekTableroUtilidad:{retailData:async()=>retail},CreditekTableroEjecutivos:{allRows:async()=>[]},CreditekReversiones:{creditCount:()=>0},renderTablaTiendas:rows=>{actual=rows;},dibujarGraficos(){},calcularAlertas(){}});
  vm.runInContext(section('tablero.html','async function cargarTiendas_Tabla()','function renderTablaTiendas('),ctx);
  await ctx.cargarTiendas_Tabla();
  assert.equal(actual[0].utilidadMes,700);
  assert.equal(actual[0].bajasMes,200);
});

test('Reportes bloquea exportación incompleta y termina una consulta antes de repetir filtros',async()=>{
  let release,fail=false,calls=0;
  const gate=new Promise(resolve=>{release=resolve;});
  const document=elements(),noop=async()=>{};
  const ctx=vm.createContext({window:{},document,sb:{},currentPerfil:{},KoraAlertasCelulares:{mount(){}},labelPeriodo:()=>'',crearCacheRefresco:()=>({}),toast(){},
    cargarKPIs:async()=>{calls++;if(calls===1)await gate;if(fail)throw Error('Error ficticio');},
    cargarVentas:noop,cargarCartera:noop,cargarInventario:noop,cargarPresupuesto:noop,cargarRentabilidadTienda:noop,cargarRentabilidadCategoria:noop,cargarCrecimiento:noop,cargarTopProductos:noop,cargarProveedores:noop});
  vm.runInContext(section('reportes.html','let reportesListos =','// ============================================================================'),ctx);
  vm.runInContext(section('reportes.html','async function refrescarTodo()','// ============================================================================'),ctx);
  assert.throws(()=>ctx.window.KoraReportData.prepareExcel({}),/incompleta/);
  const first=ctx.refrescarTodo();await ctx.refrescarTodo();assert.equal(calls,1);
  release();await first;assert.equal(calls,2);assert.equal(ctx.window.KoraReportData.prepareExcel({id:1}).id,1);
  fail=true;await ctx.refrescarTodo();assert.throws(()=>ctx.window.KoraReportData.prepareExcel({}),/incompleta/);
  assert.match(document.getElementById('estado-reportes').textContent,/Descarga bloqueada/);
});

test('caché de bajas de Reportes obtiene todas las páginas RPC con orden único',async()=>{
  const values=Array.from({length:1268},(_,id)=>({id,valor:1})),ranges=[];
  const sb={rpc(name,args){assert.equal(name,'gastos_inventario_no_monetarios');assert.equal(args.p_tienda,'A');return {order(key){assert.equal(key,'id');return this;},range:async(a,b)=>{ranges.push(a);return {data:values.slice(a,b+1),error:null};}};}};
  const ctx=context({sb,tiendasFiltro:['A'],getPeriodo:()=>({desde:'2026-10-01',hasta:'2026-10-20'})});
  vm.runInContext(section('reportes.html','function crearCacheRefresco()','// ============================================================================'),ctx);
  const result=await ctx.crearCacheRefresco().obtener('bajas');assert.equal(result.data.length,1268);assert.deepEqual(ranges,[0,500,1000]);
});
