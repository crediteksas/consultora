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
