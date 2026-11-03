import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
const context={window:{},URLSearchParams,Intl,Date};
vm.runInNewContext(await read('creditek/erp/presupuestos-negocios.js'),context);
vm.runInNewContext(await read('creditek/erp/presupuestos-b2b.js'),context);
const nav=context.window.KoraPresupuestosNav,b2b=context.window.KoraPresupuestoB2B;
test('presupuestos: tres negocios comparten acceso sin ampliar permisos',()=>{
  assert.deepEqual(Array.from(nav.permitidos({rol:'gerencia',activo:true}),n=>n.id),['retail','b2b','aliados']);
  assert.deepEqual(Array.from(nav.permitidos({rol:'auditoria',activo:true}),n=>n.id),['retail','b2b']);
  assert.equal(nav.permitidos({rol:'auditoria',activo:true,es_operador_aliados:true}).length,3);
  for(const p of [null,{rol:'asesor',activo:true},{rol:'admin_tienda',activo:true},{rol:'gerencia',activo:false}])
    assert.equal(nav.permitidos(p).length,0);
  assert.equal(nav.negocioActual({pathname:'/creditek/erp/presupuestos',search:'?negocio=b2b'}),'b2b');
  assert.equal(nav.negocioActual({pathname:'/creditek/erp/aliados-presupuesto.html',search:''}),'aliados');
  assert.equal(nav.negocioActual({pathname:'/creditek/erp/presupuestos.html',search:'?negocio=externo'}),'retail');
});
test('presupuestos: las rutas anteriores conservan formularios y fuentes independientes',async()=>{
  const [retail,aliados,shell]=await Promise.all(['creditek/erp/presupuestos.html','creditek/erp/aliados-presupuesto.html','creditek/erp/sidebar.js'].map(read));
  for(const html of [retail,aliados])assert.match(html,/data-presupuestos-negocios/);
  assert.match(retail,/guardar_presupuesto_operativo/);
  assert.match(retail,/KoraPresupuestoB2B\.montar/);
  assert.match(aliados,/data-aliados-view="budget"/);
  assert.match(shell,/paginaActual\(\) === 'aliados-presupuesto.html' \? 'presupuestos.html'/);
  assert.doesNotMatch(retail+aliados,/<iframe/i);
});
test('B2B: valida ventas y unidades sin presupuestar utilidad',()=>{
  const base={mes:'2026-10',ventas:'1000000',unidades:'',notas:'Meta octubre',revision:0};
  const p=b2b.validar(base);assert.equal(p.p_meta_ventas,1000000);assert.equal(p.p_meta_unidades,null);assert.equal(p.p_meta_utilidad_neta,undefined);
  for(const patch of [{ventas:''},{ventas:-1},{ventas:'NaN'},{ventas:1.2},{unidades:1.2},{mes:'2026-13'},{revision:-1}])
    assert.throws(()=>b2b.validar({...base,...patch}));
  assert.equal(b2b.validar({...base,unidades:0}).p_meta_unidades,0);
  assert.equal(b2b.mesActual(new Date('2026-11-01T03:00:00Z')),'2026-10');
});

const planningContext = {Intl, Date};
vm.runInNewContext(await read('creditek/erp/presupuestos-retail-planificacion.js'), planningContext);
const planning = planningContext.KoraPresupuestoPlanificacion;
function propuestaFicticia(mes, base=101, meta=173, fuente='histórico mensual uniforme por tienda_codigo') {
  const [y,m]=mes.split('-').map(Number), dias=new Date(Date.UTC(y,m,0)).getUTCDate();
  return Array.from({length:dias},(_,i)=>({fecha:mes+'-'+String(i+1).padStart(2,'0'),base_anterior:String(Math.round(base*(i+1)/dias)-Math.round(base*i/dias)),meta_propuesta:String(Math.round(meta*(i+1)/dias)-Math.round(meta*i/dias)),fuente}));
}
test('planificación: muestra las sumas del servidor sin volver a calcular porcentajes ni distribución',()=>{
  for(const mes of ['2026-02','2028-02','2026-04','2026-10']){
    const filas=propuestaFicticia(mes), antes=JSON.stringify(filas), r=planning.resumir(filas,mes);
    assert.equal(r.base,101);assert.equal(r.propuesta,173);assert.equal(r.estimada,false);
    assert.equal(JSON.stringify(filas),antes);
  }
});
test('planificación: bases estimadas y cero se conservan como tales',()=>{
  const estimada=planning.resumir(propuestaFicticia('2026-10',75,99,'estimación por valor de accesorios y precio promedio propio de 2025'),'2026-10');
  assert.equal(estimada.estimada,true);assert.equal(estimada.base,75);assert.equal(estimada.propuesta,99);
  const cero=planning.resumir(propuestaFicticia('2026-10',0,0),'2026-10');assert.equal(cero.base,0);assert.equal(cero.propuesta,0);
});
test('planificación: falla visible ante días faltantes, repetidos o valores inválidos en lugar de inventar ceros',()=>{
  const make=()=>propuestaFicticia('2026-10');
  assert.throws(()=>planning.resumir([], '2026-10'));assert.throws(()=>planning.resumir(make().slice(1),'2026-10'));
  for(const patch of [{fecha:'2026-11-01'},{fecha:'2026-10-00'},{fecha:'2026-10-32'},{fecha:'2026-10-01'},{base_anterior:null},{base_anterior:''},{base_anterior:'NaN'},{base_anterior:-1},{meta_propuesta:1.2},{meta_propuesta:Infinity},{fuente:''},{fuente:null}]){
    const filas=make();Object.assign(filas[1],patch);assert.throws(()=>planning.resumir(filas,'2026-10'));
  }
  assert.throws(()=>planning.resumir(make(),'2026-13'));
  const overflow=make().map(f=>({...f,base_anterior:Number.MAX_SAFE_INTEGER}));assert.throws(()=>planning.resumir(overflow,'2026-10'));
});
