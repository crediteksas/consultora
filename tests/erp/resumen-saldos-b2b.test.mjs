import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const ctx={window:{}};
for(const file of ['cuenta-corriente-domain.js','proveedores-domain.js','resumen-saldos-b2b-domain.js','kora-access-control.js'])vm.runInNewContext(await readFile('creditek/erp/'+file,'utf8'),ctx);
const D=ctx.window.CreditekResumenSaldosB2B;
const datos=()=>({
 origenes:[{codigo:'T',nombre:'Móvil Shopping',tipo:'propia',activo:true},{codigo:'I',nombre:'Tienda cerrada',tipo:'propia',activo:false},{codigo:'Z',nombre:'Sin movimiento',tipo:'propia',activo:true}],
 corriente:[{id:1,tienda_codigo:'T',tipo:'cargo',monto:1000},{id:2,tienda_codigo:'T',tipo:'cargo',monto:300},{id:3,tienda_codigo:'T',tipo:'abono',monto:200},{id:4,tienda_codigo:'I',tipo:'cargo',monto:50}],
 clientes:[{cliente_codigo:'C',cliente:'Cliente externo',saldo:'400'}],
 proveedores:[{id:'p',nombre:'Proveedor A',activo:true},{id:'q',nombre:'Proveedor cerrado',activo:false}],
 facturas:[{id:'f',proveedor_id:'p',saldo:'700',fecha_vencimiento:'2026-09-10'},{id:'g',proveedor_id:'p',saldo:300,fecha_vencimiento:null},{id:'h',proveedor_id:'q',saldo:50,fecha_vencimiento:'2026-09-20'},{id:'i',proveedor_id:'p',saldo:0,fecha_vencimiento:'2026-08-01'}],
});
test('resume deudas completas sin usar ventas ni volver a descontar pagos de proveedores',()=>{
 const d=datos(),r=D.preparar(d,'2026-09-16');
 assert.equal(r.porCobrar,1550);assert.equal(r.porPagar,1050);assert.equal(r.diferencia,500);
 assert.equal(D.sumar(r.cartera),r.porCobrar);assert.equal(D.sumar(r.proveedores),r.porPagar);
 assert.equal(r.cartera.length,4);assert.equal(r.proveedores.length,2);
 assert.equal(r.proveedores[0].facturas,2);assert.equal(r.proveedores[0].vencido,700);assert.equal(r.proveedores[0].proximo,'2026-09-10');
 assert.equal(D.filtrar(r.cartera,'movil')[0].nombre,'Móvil Shopping');
 assert.equal(JSON.stringify(d),JSON.stringify(datos()));
});
test('conserva saldos a favor y diferencias negativas; no los convierte en cero',()=>{
 const d=datos();d.clientes[0].saldo=-1500;const r=D.preparar(d,'2026-09-16');
 assert.equal(r.porCobrar,-350);assert.equal(r.aFavorClientes,1500);assert.equal(r.diferencia,-1400);
});
test('datos incompletos o duplicados no se presentan como saldos válidos',()=>{
 const d=datos();d.facturas[0].saldo=null;assert.throws(()=>D.preparar(d,'2026-09-16'),/valor válido/);
 const e=datos();e.facturas.push(e.facturas[0]);assert.throws(()=>D.preparar(e,'2026-09-16'),/repetidos/);
 const f=datos();f.facturas[0].proveedor_id='ajeno';assert.throws(()=>D.preparar(f,'2026-09-16'),/sin proveedor/);
 const g=datos();g.facturas[0].saldo=-1;assert.throws(()=>D.preparar(g,'2026-09-16'),/negativo/);
});
test('carga todas las páginas, y un error en cualquiera de las fuentes bloquea el total',async()=>{
 const d=datos(),calls=[];
 const sources={origenes:d.origenes,cuenta_corriente:d.corriente,v_cartera_clientes_b2b:d.clientes,proveedores:d.proveedores,facturas_proveedor:Array.from({length:1001},(_,i)=>({id:'f'+i,proveedor_id:'p',saldo:1,fecha_vencimiento:null}))};
 let fail=false;
 const sb={from(table){return {select(){return this},eq(){return this},in(){return this},order(){return this},async range(a,b){calls.push([table,a,b]);return fail&&table==='facturas_proveedor'?{error:{message:'Sin conexión'}}:{data:sources[table].slice(a,b+1)};}};}};
 const r=await D.cargar(sb,'2026-09-16');assert.equal(r.porPagar,1001);assert.ok(calls.some(c=>c[0]==='facturas_proveedor'&&c[1]===1000));
 fail=true;await assert.rejects(D.cargar(sb,'2026-09-16'),/Sin conexión/);
});
test('solo gerencia y auditoría acceden; la ruta nueva no duplica el dashboard de ventas',()=>{
 const A=ctx.window.KoraAccessControl;
 for(const rol of ['gerencia','auditoria']){
  const p={activo:true,rol};assert.equal(A.authorize(p,'resumen-saldos-b2b.html').allowed,true);
  const items=A.navigationFor(p).flatMap(s=>s.items);
  assert.equal(items.filter(i=>i.href==='resumen-saldos-b2b.html').length,1);
  assert.equal(items.filter(i=>i.href.startsWith('utilidad-creditek.html')).length,1);
 }
 for(const rol of ['admin_tienda','asesor'])assert.equal(A.authorize({activo:true,rol,tienda_codigo:'T'},'resumen-saldos-b2b.html').allowed,false);
 assert.equal(A.authorize({activo:false,rol:'gerencia'},'resumen-saldos-b2b.html').allowed,false);
});
test('consulta sin escrituras, sin precios internos ni claves privilegiadas',async()=>{
 const source=await readFile('creditek/erp/resumen-saldos-b2b-domain.js','utf8');
 const app=await readFile('creditek/erp/resumen-saldos-b2b-app.js','utf8');
 assert.doesNotMatch(source+app,/\.(insert|update|delete|upsert|rpc)\(|service_role|costo_unitario/);
 assert.match(app,/perfil\?\.activo/);
 const html=await readFile('creditek/erp/resumen-saldos-b2b.html','utf8');
 assert.match(html,/no representa el capital de trabajo completo/);assert.match(html,/No es utilidad ni efectivo disponible/);
});
