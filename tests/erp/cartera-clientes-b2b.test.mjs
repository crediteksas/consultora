import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../../creditek/erp/cartera-b2b.html', import.meta.url), 'utf8');
const access = readFileSync(new URL('../../creditek/erp/kora-access-control.js', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../supabase/migrations/20260903231515_separar_clientes_cartera_b2b.sql', import.meta.url), 'utf8');
const context={window:{}};
for(const f of ['cuenta-corriente-domain.js','cartera-b2b-domain.js'])vm.runInNewContext(readFileSync(new URL('../../creditek/erp/'+f,import.meta.url),'utf8'),context);
const D=context.window.CreditekCarteraB2BDomain;

test('reúne libros sin duplicarlos y usa la fecha de cada fuente',()=>{
 const origenes=[{codigo:'T',nombre:'Tienda',tipo:'propia',activo:true},{codigo:'C',nombre:'Cliente',tipo:'cliente_b2b',activo:true}];
 const clientes=[{cuenta_id:'cuenta',cliente_codigo:'C'}];
 const data=D.reunir(origenes,clientes,[{id:1,tienda_codigo:'T',tipo:'cargo',monto:100,created_at:'2026-09-01T02:00:00Z'},{id:2,tienda_codigo:'C',tipo:'cargo',monto:999,created_at:'2026-09-01T12:00:00Z'}],[{id:'a',cuenta_id:'cuenta',tienda_codigo:'C',efecto:'debito',monto:50,fecha_efectiva:'2026-09-02'}]);
 assert.equal(data.movimientos.length,2);
 assert.equal(data.movimientos[0].fecha,'2026-08-31');
 const rows=D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16');
 const tienda=rows.find(c=>c.cliente_codigo==='T'),cliente=rows.find(c=>c.cliente_codigo==='C');
 assert.equal(tienda.inicial,100);assert.equal(tienda.cargos,0);assert.equal(tienda.saldo,100);
 assert.equal(cliente.cargos,50);assert.equal(cliente.saldo,50);
});

test('saldo inicial, cargos y abonos respetan el período y conservan la regla existente',()=>{
 const clientes=[{cliente_codigo:'T',cliente:'Móvil Shopping'}];
 const movimientos=[['2026-08-31','cargo',100],['2026-09-01','cargo',30],['2026-09-16','abono',20],['2026-09-17','cargo',900]].map(([fecha,tipo,monto])=>({fecha,tipo,monto,tienda_codigo:'T'}));
 const r=D.resumir(clientes,movimientos,'2026-09-01','2026-09-16')[0];
 assert.equal(r.inicial,100);assert.equal(r.cargos,30);assert.equal(r.abonos,20);assert.equal(r.saldo,110);
 assert.equal(r.inicial+r.cargos-r.abonos,r.saldo);
 assert.equal(D.resumir(clientes,movimientos,'2026-09-01','2026-09-16','','movil').length,1);
 assert.equal(D.resumir(clientes,movimientos,'2026-09-01','2026-09-16','otro').length,0);
});

test('incluye tiendas sin movimientos e inactivas con historial',()=>{
 const origenes=[{codigo:'A',nombre:'Activa',tipo:'propia',activo:true},{codigo:'I',nombre:'Inactiva',tipo:'propia',activo:false},{codigo:'V',nombre:'Vacía',tipo:'propia',activo:false}];
 const data=D.reunir(origenes,[],[{id:1,tienda_codigo:'I',tipo:'abono',monto:10,created_at:'2026-09-01T12:00:00Z'}],[]);
 assert.equal(data.clientes.length,2);
 const rows=D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16');
 assert.equal(rows[0].saldo,0);assert.equal(rows[1].saldo,-10);
});

test('consulta todas las páginas y no convierte un error parcial en saldo cero',async()=>{
 const filas=Array.from({length:1100},(_,id)=>({id}));
 const r=await D.leerTodas(()=>({range:async(a,b)=>({data:filas.slice(a,b+1)})}));
 assert.equal(r.length,1100);
 await assert.rejects(D.leerTodas(()=>({range:async a=>a?{error:new Error('sin acceso')}:{data:filas.slice(0,500)}})),/sin acceso/);
});

test('la consulta solo incorpora movimientos aplicados y conserva los permisos de registro',()=>{
 assert.match(page,/sb.from\('cuenta_corriente'\)/);
 assert.match(page,/\.in\('cuenta_id',cuentas\)/);
 assert.doesNotMatch(page,/sb.from\('abonos'\)|sb.from\('compensaciones/);
 assert.match(page,/fCliente.innerHTML=b2b.map/);
 assert.match(page,/\['gerencia','auditoria'\]/);
 assert.match(page,/Saldo al cierre/);
});

test('Oscar, Luis y Meico se reclasifican como clientes B2B sin alterar saldos', () => {
  assert.match(sql, /update public\.origenes set tipo='cliente_b2b'/i);
  assert.match(sql, /codigo in \('CK-12','CK-13','CK-14'\)/);
  assert.doesNotMatch(sql, /insert into public\.movimientos_cartera[\s\S]*CK-12/);
});

test('cada cliente B2B tiene un libro separado de Retail', () => {
  assert.match(sql, /tipo_cuenta='cliente_b2b'/);
  assert.match(sql, /v_cartera_clientes_b2b/);
  assert.match(sql, /security_invoker=true/);
});

test('solo Gestión y Gerencia registran cargos o abonos con soporte', () => {
  assert.match(sql, /rol not in \('gerencia','auditoria'\)/);
  assert.match(sql, /Concepto y soporte son obligatorios/);
  assert.match(sql, /p_efecto not in \('debito','credito'\)/);
  assert.match(page, /accept="image\/\*,application\/pdf"/);
});

test('la pantalla ofrece mes vigente, detalle, trazabilidad y exportación', () => {
  assert.match(page, /h\.slice\(0,7\)\+'-01'/);
  assert.match(page, /Fecha efectiva/);
  assert.match(page, /Responsable/);
  assert.match(page, /esc\(m\.id\)/);
  assert.match(page, />Excel</);
  assert.match(page, />PDF</);
});

test('la navegación B2B enlaza el libro correcto', () => {
  assert.match(access, /Cartera clientes B2B[^\n]+cartera-b2b\.html/);
  assert.match(sidebar, /Cartera clientes B2B[^\n]+cartera-b2b\.html/);
});
