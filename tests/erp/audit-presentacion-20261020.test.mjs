import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync('creditek/erp/'+f,'utf8');
const section=(file,start,end)=>{const s=read(file),a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return s.slice(a,b);};
function documentMock(){const nodes=new Map();return {getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',style:{},dataset:{},textContent:'',innerHTML:'',querySelectorAll(){return [];},closest(){return {dataset:{}};}});return nodes.get(id);}};}

test('catálogo pagina 3084 referencias sin recortar el informe ni exponer márgenes de tienda',()=>{
  const document=documentMock(),ctx=vm.createContext({document,currentPerfil:{rol:'asesor'},productoFoto:{permisosCatalogo:()=>({})},inventarioDomain:{textoBusqueda:s=>s.toLowerCase()},esCentral:()=>false,nombreCategoria:x=>x,fmtMargen:()=>{throw Error('Margen privado');},fmtCOP:n=>'$ '+n,escapeHtml:String});
  vm.runInContext('let paginaCatalogo=0,catalogoCargado=true;const filasCatalogo=100;let productosCache='+JSON.stringify(Array.from({length:3084},(_,i)=>({id:i,codigo:'REF-'+i,nombre:'Producto '+i,categoria:'C',tipo:'cantidad',_precio_mostrar:123.45,margen_valor:999})))+';'+section('catalogo.html','function filtrarCatalogo()','function abrirModalFoto('),ctx);
  ctx.renderTabla();assert.equal((document.getElementById('tbodyProductos').innerHTML.match(/<tr>/g)||[]).length,100);
  assert.equal(ctx.reporteCatalogo().tables[0].rows.length,3084);
  assert.equal(ctx.reporteCatalogo().tables[0].headers.at(-1),'Mi costo');
  assert.ok(ctx.reporteCatalogo().tables[0].rows.every(row=>row.length===5&&row[4]==='$ 123.45'));
  vm.runInContext('paginaCatalogo=30',ctx);ctx.renderTabla(false);
  assert.equal((document.getElementById('tbodyProductos').innerHTML.match(/<tr>/g)||[]).length,84);
  assert.equal(document.getElementById('catalogo-siguiente').disabled,true);
  document.getElementById('filtroBusqueda').value='REF-3083';ctx.renderTabla();
  assert.equal(vm.runInContext('paginaCatalogo',ctx),0);assert.equal(ctx.reporteCatalogo().tables[0].rows.length,1);
  assert.match(ctx.reporteCatalogo().tables[0].totalRows[0][0],/1$/);
  vm.runInContext('catalogoCargado=false',ctx);assert.throws(()=>ctx.reporteCatalogo(),/termine la carga/);
  assert.match(read('catalogo.html'),/tabla-wrap" data-kora-no-export/);
  assert.match(read('catalogo.html'),/data-label="Mi costo"/);
  assert.match(read('catalogo.html'),/grid-template-columns:85px minmax\(0,1fr\)/);
});

test('footer Retail suma solamente las tiendas visibles y conserva centavos',()=>{
  const document=documentMock(),ctx=vm.createContext({document,esCentral:()=>true,tiendasCache:[{codigo:'A'},{codigo:'B'}],calcularResumenPorTienda:()=>({A:{saldo:100.25},B:{saldo:-20.1},OCULTA:{saldo:9999}}),nombreTienda:x=>x,escapeHtml:String});
  vm.runInContext(section('cuenta-corriente.html','function fmtCOP','function mostrarBanner'),ctx);
  vm.runInContext(section('cuenta-corriente.html','function renderTablaTiendas()','async function cargarCompensacionesRecibidas'),ctx);
  ctx.renderTablaTiendas();const footer=document.getElementById('tfootTiendas').innerHTML;
  assert.match(footer,/TOTAL NETO/);assert.match(footer,/80,15/);assert.doesNotMatch(footer,/9999/);
  ctx.tiendasCache=[];ctx.renderTablaTiendas();assert.equal(document.getElementById('tfootTiendas').innerHTML,'');
});

test('footer de cartera B2B sigue el filtro, conserva centavos y desaparece con fechas inválidas',()=>{
  const document=documentMock();let footer;
  const table={dataset:{},querySelector:()=>footer,appendChild(p){footer=p;p.remove=()=>{footer=undefined;};}};
  const rows={innerHTML:'',closest:()=>table,querySelectorAll:()=>[]};
  const accounts=['A','B'].map(cliente_codigo=>({cliente_codigo,cliente:'Ficticio '+cliente_codigo,canal:'B2B',activo:true}));
  const movements=[['A','cargo',100,'2026-09-01'],['A','cargo',10,'2026-10-02'],['A','abono',9.75,'2026-10-03'],['B','abono',20.1,'2026-10-02'],['A','cargo',9999,'2026-11-01']].map(([tienda_codigo,tipo,monto,fecha],id)=>({id,tienda_codigo,tipo,monto,fecha,created_at:fecha+'T12:00:00Z'}));
  let ctx;
  Object.defineProperty(rows,'rows',{get:()=>vm.runInContext('resumen',ctx).map(()=>({cells:Array.from({length:6},()=>({dataset:{}}))}))});
  document.createElement=()=>({innerHTML:''});
  const plain=()=>({value:'',textContent:'',dataset:{},style:{}});
  ctx=vm.createContext({window:{},document,rows,clientes:accounts,movimientos:movements,cargado:true,desde:{value:'2026-10-01'},hasta:{value:'2026-10-20'},cliente:{value:''},buscar:{value:''},resumen:[],kInicial:plain(),kCargos:plain(),kAbonos:plain(),kAjustes:plain(),kSaldo:plain(),loadError:plain(),csv:plain(),pdf:plain(),periodo:plain(),empty:plain(),esc:String,origenInicial:()=>'',filtrados:()=>[]});
  vm.runInContext(read('cuenta-corriente-domain.js'),ctx);vm.runInContext(read('cartera-b2b-domain.js'),ctx);
  ctx.D=ctx.window.CreditekCarteraB2BDomain;
  vm.runInContext(read('cartera-b2b.html').match(/const money=n=>[^;]+;/)[0],ctx);
  vm.runInContext(section('cartera-b2b.html','function render(){','function openDetail('),ctx);
  ctx.render();assert.match(footer.innerHTML,/TOTAL NETO/);assert.match(footer.innerHTML,/80,15/);assert.equal(ctx.kSaldo.dataset.koraReportValue,'80,15');
  ctx.cliente.value='A';ctx.render();assert.match(footer.innerHTML,/100,25/);assert.equal(ctx.kSaldo.dataset.koraReportValue,'100,25');
  ctx.desde.value='2026-11-01';ctx.render();assert.equal(footer,undefined);assert.equal(ctx.csv.disabled,true);assert.equal(ctx.kSaldo.textContent,'—');
});

test('encabezados de incidencias corresponden a las celdas reales de ambos modos',()=>{
  class Node {constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};}append(n){this.children.push(n);}replaceChildren(){this.children=[];}addEventListener(){}}
  const nodes=new Map(),document={querySelector:s=>nodes.get(s)||nodes.set(s,new Node('div')).get(s)};
  const incident={incident_code:'CAS-FICTICIO',status:'confirmado',priority:'alta',title:'Prueba ficticia',store_name_snapshot:'Tienda ficticia',created_at:'2026-10-20',updated_at:'2026-10-20',module:'inventario',user_name_snapshot:'Reportante ficticio',assigned_to:'a',kora_version:'TEST'};
  const ctx=vm.createContext({Node,document,PAGE_SIZE:20,state:{mode:'admin',currentPage:1},filteredIncidents:()=>[incident],management:{paginateIncidents:items=>({items,currentPage:1,totalPages:1}),statusTone:()=>''},label:x=>x,formatDate:x=>x,age:()=>'',assigneeName:()=>'',el:(tag,text)=>new Node(tag,text)});
  vm.runInContext(section('incidencias-app.js','  function renderList()','  async function loadIncidents()'),ctx);
  const text=n=>n.textContent+n.children.map(text).join('');
  ctx.renderList();let cells=nodes.get('[data-incident-list]').children[0].children;
  assert.equal(cells.length,11);assert.deepEqual(cells.slice(0,4).map(text),['CAS-FICTICIO','confirmado','alta','Prueba ficticia']);
  const headers=[...read('incidencias.html').matchAll(/<th>(.*?)<\/th>/g)].map(m=>m[1]);assert.deepEqual(headers.slice(0,4),['Código','Estado','Prioridad','Título']);
  ctx.state.mode='store';ctx.renderList();cells=nodes.get('[data-incident-list]').children[0].children;assert.equal(cells.length,7);assert.equal(text(cells[5]),'confirmado');
});

test('bodega virtual informa pendiente de despacho sin alarma roja de descuadre',()=>{
  const document=documentMock(),ctx=vm.createContext({document,alertaData:[{descuadrado:true,stock_actual_central:5,nombre:'Ficticio'}],esc:String});
  vm.runInContext(section('bodega-central.html','function actualizarKPIs()','function render()'),ctx);ctx.actualizarKPIs();
  assert.equal(document.getElementById('estado-titulo').textContent,'1 referencias por despachar');
  assert.doesNotMatch(document.getElementById('card-estado').className,/rojo|pulse/);
  assert.equal(document.getElementById('kpi-unidades').textContent,5);
});

test('acciones, filtros, zoom y estados tienen contratos visuales claros',()=>{
  assert.match(read('gastos.html'),/btn-rechazar danger/);assert.match(read('gastos.html'),/btn-devolver secondary/);
  assert.match(read('remisiones.html'),/id="filtroEstado" aria-label="Estado de la remisión"/);
  assert.doesNotMatch(read('registro.html'),/maximum-scale=1/);
  assert.match(read('kora-incident-management.js'),/confirmado: 'Confirmada'/);
  assert.match(read('kora-incident-management.js'),/en_desarrollo: 'En desarrollo'/);
  assert.match(read('kardex.html'),/valor: 'compra_entrada', label: '📥 Entrada por compra'/);
  assert.match(read('auditoria-cruzada.html'),/activas e historial/);
  assert.match(read('auditoria-cruzada.html'),/s.estado === 'abierta' && !vencida/);
  assert.doesNotMatch(read('auditoria-cruzada.html'),/\.nombre \|\| id;/);
  assert.match(read('incidencias.html'),/<th>Código<\/th><th>Estado<\/th><th>Prioridad<\/th>/);
  assert.match(read('incidencias-app.js'),/statusIndex = state.mode === 'admin' \? 1 : 5/);
});
