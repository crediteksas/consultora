import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const domain = await readFile(new URL('creditek/erp/caja-libro-domain.js',root),'utf8');
const ui = await readFile(new URL('creditek/erp/caja-libro-ui.js',root),'utf8');
const context = vm.createContext({Intl,Date,Map,Set});
vm.runInContext(domain+'\n'+ui,context);
const {construir} = context.CreditekCajaLibro;
const {todas,fechas,consultar,renderDia,montar} = context.CreditekCajaLibroUI;
const fecha='2026-09-26';
const cuadre = (apertura,esperado) => ({ok:true,fecha,apertura,esperado,apertura_cierre_anterior:apertura,ajuste_arrastre_movimientos:0});
const mov = (id,tipo,monto,created_at='2026-09-26T16:00:00Z') => ({id,tipo,monto,fecha,created_at,creado_por:'mayte',autorizado_por:'oscar'});

test('Chinucell: retiro y ajuste de salida reconstruyen exactamente $537.849',()=>{
  const libro=construir({cuadre:cuadre(2484892,537849),movimientos:[mov('ajuste','ajuste_auditoria_salida',392307,'2026-09-26T16:00:36Z'),mov('retiro','retiro',1554736,'2026-09-26T15:16:26Z')]});
  assert.equal(libro.cuadra,true);assert.equal(libro.salidas,1947043);assert.equal(libro.entradas,0);
  assert.equal(libro.filas[0].saldo,930156);assert.equal(libro.filas[1].saldoAnterior,930156);assert.equal(libro.filas[1].saldo,537849);
  assert.equal(libro.filas[1].autorizado,'oscar');
});

test('incluye ventas, efectivo complementario Addi y gastos aplicados; excluye anuladas, tarjetas y pendientes',()=>{
  const venta=(id,tipo,total,creditos,anulada=false)=>({id,consecutivo:id,fecha,created_at:'2026-09-26T15:00:00Z',vendedor:'mayte',tipo,total,creditos,anulada});
  const credito=(id,financiera,cuota_inicial,medio_pago_complementario)=>({id,financiera,cuota_inicial,medio_pago_complementario});
  const gasto=(id,monto,estado,preautorizado)=>({id,monto,fecha,created_at:'2026-09-26T16:00:00Z',estado,conceptos_gasto:{nombre:'Gasto',preautorizado}});
  const libro=construir({cuadre:cuadre(100000,1096600),ventas:[
    venta(1,'contado',1000000),venta(2,'contado',999999,[],true),
    venta(3,'credito',552600,[credito('c3','Addi',96600,'efectivo')]),
    venta(4,'credito',552600,[credito('c4','Addi',96600,'tarjeta')]),
    venta(5,'credito',552600,[credito('c5','Addi',96600,'transferencia')]),
    venta(6,'credito',200000,[credito('c6','PayJoy',50000)]),
  ],gastos:[gasto(1,100000,'aprobado',false),gasto(2,50000,'registrado',true),gasto(3,90000,'registrado',false),gasto(4,80000,'rechazado',true)]});
  assert.equal(libro.cuadra,true);assert.equal(libro.entradas,1146600);assert.equal(libro.salidas,150000);assert.equal(libro.pendientes,1);assert.equal(libro.filas.length,5);
});

test('cada tipo de movimiento conserva su signo y los filtros no recomponen saldos',()=>{
  const positivos=['abono','otro_ingreso','ajuste_auditoria_entrada'];
  const negativos=['transferencia_central','pago_directo_central','retiro','consignacion','devolucion_efectivo','ajuste_auditoria_salida'];
  const libro=construir({cuadre:cuadre(1000,700),movimientos:[...positivos,...negativos].map((t,i)=>mov(String(i),t,100))});
  assert.equal(libro.cuadra,true);assert.equal(libro.entradas,300);assert.equal(libro.salidas,600);
  assert.equal(libro.filas.filter(f=>f.tipo.includes('disminución'))[0].saldo,700);
});

test('el arrastre forma la apertura pero no crea otra fila ni otro ingreso',()=>{
  const libro=construir({cuadre:{...cuadre(-2017400,-2017400),apertura_cierre_anterior:2995400,ajuste_arrastre_movimientos:-5012800}});
  assert.equal(libro.cuadra,true);assert.equal(libro.filas.length,0);assert.equal(libro.entradas,0);assert.equal(libro.saldo,-2017400);
  assert.match(renderDia(libro,new Map(),0),/Saldo negativo/);
});

test('no disimula faltantes, duplicados, importes ausentes ni tipos desconocidos',()=>{
  const libro=construir({cuadre:cuadre(100,200)});assert.equal(libro.cuadra,false);assert.equal(libro.diferencia,-100);
  assert.match(renderDia(libro,new Map(),0),/El detalle no cuadra/);
  assert.throws(()=>construir({cuadre:{ok:false}}));
  assert.throws(()=>construir({cuadre:cuadre(null,0)}));
  for(const monto of [null,undefined,'',NaN,-1]) assert.throws(()=>construir({cuadre:cuadre(0,0),movimientos:[mov('1','retiro',monto)]}));
  assert.throws(()=>construir({cuadre:cuadre(0,0),movimientos:[mov('1','nuevo_tipo',1)]}));
  assert.throws(()=>construir({cuadre:cuadre(0,0),movimientos:[mov('1','abono',1),mov('1','abono',1)]}));
});

test('paginación supera los límites sin truncar ni ocultar fallos',async()=>{
  const datos=Array.from({length:1207},(_,id)=>({id})),rangos=[];
  const rows=await todas(()=>({order:()=>({range:async(a,b)=>{rangos.push([a,b]);return {data:datos.slice(a,b+1)};}})}));
  assert.equal(rows.length,1207);assert.deepEqual(rangos,[[0,499],[500,999],[1000,1499]]);
  await assert.rejects(todas(()=>({order:()=>({range:async()=>({error:new Error('denegado')})})})),/denegado/);
  await assert.rejects(todas(()=>({order:()=>({range:async()=>({data:null})})})),/verificables/);
});

test('rango válido de máximo 31 días, sin futuro ni fechas inexistentes',()=>{
  assert.equal(fechas('2026-09-01','2026-09-26',fecha).length,26);
  for(const [a,b] of [['2026-09-26','2026-09-25'],['2026-08-01',fecha],[fecha,'2026-09-27'],['2026-02-30','2026-03-01'],['x',fecha]]) assert.throws(()=>fechas(a,b,fecha));
});

test('consulta filtra cada origen por tienda y fecha, utiliza solo RPC de lectura y resuelve los nombres',async()=>{
  const filtros=[],rpcs=[];
  const sb={from(tabla){const q={select(){return q;},eq(k,v){filtros.push([tabla,k,v]);return q;},gte(k,v){filtros.push([tabla,k,v]);return q;},lte(k,v){filtros.push([tabla,k,v]);return q;},order(){return q;},async range(){return {data:tabla==='movimientos_caja_tienda'?[mov('1','abono',100)]:[]};},async in(){return {data:[{id:'mayte',nombre:'Mayte'},{id:'oscar',nombre:'Óscar'}]};}};return q;},async rpc(nombre,args){rpcs.push([nombre,args]);return {data:cuadre(0,100)};}};
  const r=await consultar(sb,'CK-05',fecha,fecha,fecha);
  assert.equal(r.libros[0].saldo,100);assert.equal(r.nombres.get('mayte'),'Mayte');
  for(const t of ['ventas','gastos','movimientos_caja_tienda']) assert.ok(filtros.some(f=>f[0]===t&&f[1]==='tienda_codigo'&&f[2]==='CK-05'));
  assert.equal(rpcs.length,1);assert.equal(rpcs[0][0],'calcular_efectivo_esperado_tienda');
  sb.rpc=async()=>({error:new Error('Sin permisos')});await assert.rejects(consultar(sb,'CK-05',fecha,fecha,fecha),/Sin permisos/);
});

test('el libro usa nombres y escapa texto; solo se monta para Gerencia o Auditoría activas',()=>{
  const libro=construir({cuadre:cuadre(0,10),movimientos:[{...mov('1','abono',10),observacion:'<img onerror=alert(1)>'}]});
  const html=renderDia(libro,new Map([['mayte','Mayte'],['oscar','Óscar']]),0);
  assert.match(html,/Mayte/);assert.match(html,/Óscar/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
  for(const perfil of [{rol:'admin_tienda',activo:true},{rol:'gerencia',activo:false},null]) assert.doesNotThrow(()=>montar({perfil}));
  const htmlAdmin=readFile(new URL('creditek/erp/ajustes-gerencia.html',root),'utf8');
  return htmlAdmin.then(s=>assert.match(s,/Consultar libro de caja por tienda/));
});
