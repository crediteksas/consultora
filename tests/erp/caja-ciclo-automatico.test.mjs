import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const admin='00000000-0000-4000-8000-000000000001';
const gerente='00000000-0000-4000-8000-000000000002';
const otro='00000000-0000-4000-8000-000000000003';
const concepto='00000000-0000-4000-8000-000000000004';
let db, hoy, ayer, antes, ancla;
const query=(s,p=[])=>db.query(s,p);
const cambiarUsuario=id=>query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const calcular=async(fecha=ayer)=>(await query('select calcular_efectivo_esperado_tienda($1,$2) c',['TEST-A',fecha])).rows[0].c;
const validar=async(monto,nota=null,autorizar=false,key=randomUUID())=>(await query('select validar_arqueo_caja($1,$2,$3,$4,$5,$6) c',['TEST-A',ayer,monto,key,nota,autorizar])).rows[0].c;
const venta=(fecha,total=50,tienda='TEST-A')=>query("insert into ventas(tienda_codigo,fecha,tipo,total) values($1,$2,'contado',$3) returning id",[tienda,fecha,total]);

before(async()=>{
 db=await PGlite.create();
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table origenes(codigo text primary key,nombre text,tipo text,activo boolean);
 create table perfiles(id uuid primary key,rol text,tienda_codigo text,activo boolean);
 create table caja_diaria(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,estado text default 'abierta',
 apertura numeric default 0,contado_ventas numeric default 0,financiado_ventas numeric default 0,iniciales numeric default 0,
 otros_ingresos numeric default 0,gastos_efectivo numeric default 0,salidas_explicitas numeric default 0,
 efectivo_esperado numeric,efectivo_contado numeric,diferencia numeric,cerrada_por uuid,cerrada_at timestamptz,
 nota text,cierre_idempotency_key uuid,unique(tienda_codigo,fecha));
 create table ventas(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean default false);
 create table creditos(id uuid primary key default gen_random_uuid(),venta_id uuid,cuota_inicial numeric,valor_esperado_financiera numeric);
 create table venta_items(id uuid primary key default gen_random_uuid(),venta_id uuid,precio_venta numeric,cantidad numeric);
 create table conceptos_gasto(id uuid primary key,preautorizado boolean);
 create table gastos(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,monto numeric,concepto_id uuid,estado text);
 create table movimientos_caja_tienda(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,monto numeric);
 `);
 await db.exec(await readFile(new URL('../../supabase/migrations/20260906191354_caja_arrastre_movimientos_retroactivos.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20260920181612_caja_corte_arqueo_apertura.sql',import.meta.url),'utf8'));
 const d=(await query("select (now() at time zone 'America/Bogota')::date::text hoy, ((now() at time zone 'America/Bogota')::date-1)::text ayer, ((now() at time zone 'America/Bogota')::date-2)::text antes, ((now() at time zone 'America/Bogota')::date-3)::text ancla")).rows[0];
 ({hoy,ayer,antes,ancla}=d);
});
beforeEach(async()=>{
 await db.exec(`reset role; truncate caja_arqueo_intentos,caja_cortes,caja_diaria,creditos,venta_items,ventas,gastos,movimientos_caja_tienda,conceptos_gasto,perfiles,origenes cascade;
 update caja_ciclo_config set fecha_inicio=(now() at time zone 'America/Bogota')::date+1;
 insert into origenes values('TEST-A','Tienda A','propia',true),('TEST-B','Tienda B','propia',true);
 insert into perfiles values('${admin}','admin_tienda','TEST-A',true),('${gerente}','gerencia',null,true),('${otro}','admin_tienda','TEST-B',true);
 insert into conceptos_gasto values('${concepto}',false);`);
 await cambiarUsuario(admin);
 await venta(ancla,100);
 await query("insert into caja_diaria(tienda_codigo,fecha,estado,contado_ventas,efectivo_esperado,efectivo_contado,diferencia) values('TEST-A',$1,'cerrada',100,100,100,0)",[ancla]);
 await venta(antes,50);
 await venta(ayer,200);
 await query('update caja_ciclo_config set fecha_inicio=$1',[ayer]);
});
after(async()=>db?.close());

test('el corte es idempotente, conserva la venta sin arqueo y nunca fabrica efectivo contado',async()=>{
 const antesC=(await query('select to_jsonb(c) c from caja_diaria c')).rows;
 const respuesta=(await query('select generar_cortes_caja($1) cortes',[ayer])).rows[0].cortes;
 assert.equal(Array.isArray(respuesta),true,'El RPC devuelve un JSON array, no un objeto contenedor');
 assert.equal(respuesta.length,2);
 assert.equal(respuesta[0].efectivo_contado,null);
 await query('select generar_cortes_caja($1)',[ayer]);
 const c=(await query("select * from caja_cortes where tienda_codigo='TEST-A'")).rows;
 assert.equal(c.length,1); assert.equal(c[0].estado,'pendiente'); assert.equal(c[0].efectivo_contado,null);
 assert.equal(c[0].resumen_corte.esperado,350);
 assert.deepEqual((await query('select to_jsonb(c) c from caja_diaria c')).rows,antesC);
});
test('no se salta días sin cierre y el arqueo arrastra el saldo una sola vez',async()=>{
 assert.equal((await calcular()).apertura,150);
 assert.equal((await validar(350)).ok,true);
 assert.equal((await calcular(hoy)).apertura,350);
 await venta(hoy,10);
 assert.equal((await calcular(hoy)).esperado,360);
});
test('un registro abierto previo se completa con el arqueo, no se ignora por conflicto',async()=>{
 await query("insert into caja_diaria(tienda_codigo,fecha,estado) values('TEST-A',$1,'abierta')",[ayer]);
 assert.equal((await validar(350)).ok,true);
 const fila=(await query("select estado,efectivo_contado from caja_diaria where tienda_codigo='TEST-A' and fecha=$1",[ayer])).rows[0];
 assert.equal(fila.estado,'cerrada');assert.equal(fila.efectivo_contado,'350');
 await assert.rejects(query("delete from caja_diaria where tienda_codigo='TEST-A' and fecha=$1",[ayer]),/inmutable/);
});
test('las nuevas ventas se bloquean aunque el programador no haya corrido',async()=>{
 await assert.rejects(venta(hoy),/CAJA_PENDIENTE/);
 await assert.rejects(venta(ayer),/CAJA_PENDIENTE/);
 assert.equal((await query("select count(*) n from caja_cortes")).rows[0].n,0);
 const estado=(await query("select estado_apertura_caja('TEST-A') c")).rows[0].c;
 assert.equal(estado.bloqueada,true); assert.equal(estado.fecha_pendiente,ayer);
});
test('gasto atrasado se puede registrar; pendiente no autoriza la apertura',async()=>{
 await query("insert into gastos(tienda_codigo,fecha,monto,concepto_id,estado) values('TEST-A',$1,30,$2,'registrado')",[ayer,concepto]);
 const r=await validar(320,'Gasto pendiente de aprobación');
 assert.equal(r.ok,false); assert.equal(r.gastos_pendientes,1);
 await cambiarUsuario(gerente);
 assert.equal((await validar(320,'Revisado por gestión',true)).ok,false);
 await query("update gastos set estado='aprobado'");
 await cambiarUsuario(admin);
 assert.equal((await validar(320)).ok,true);
 assert.equal((await calcular(hoy)).apertura,320);
});
test('diferencia queda registrada, no bloquea la evidencia y requiere central para autorizar',async()=>{
 assert.equal((await validar(340,'Diferencia en revisión')).ok,false);
 await assert.rejects(validar(340,'Intento de autorización',true),/Solo Gestión/);
 await assert.rejects(venta(hoy),/CAJA_PENDIENTE/);
 await cambiarUsuario(gerente);
 assert.equal((await validar(340,'Autorización documentada',true)).estado,'autorizada');
 assert.equal((await calcular(hoy)).apertura,340);
 const c=(await query("select diferencia from caja_diaria where fecha=$1",[ayer])).rows[0];
 assert.equal(Number(c.diferencia),-10);
});
test('no permite autorizar un efectivo distinto del contado registrado',async()=>{
 await validar(340,'Diferencia en revisión'); await cambiarUsuario(gerente);
 await assert.rejects(validar(339,'Autorización documentada',true),/arqueo registrado/);
});
test('permisos por tienda y RPC del programador cerrados para clientes',async()=>{
 await cambiarUsuario(otro);
 await assert.rejects(calcular(),/No autorizado/);
 await assert.rejects(validar(350),/No autorizado/);
 await db.exec('set role authenticated');
 await assert.rejects(query('select generar_cortes_caja($1)',[ayer]),/permission denied/);
 await assert.rejects(query("select caja_calcular_interno('TEST-A',$1)",[ayer]),/permission denied/);
 await assert.rejects(query("update caja_cortes set estado='validada'"),/permission denied/);
 await db.exec('reset role');
});
test('reintento no duplica arqueos ni contabiliza el mismo saldo otra vez',async()=>{
 const key=randomUUID(),r=await validar(350,null,false,key);
 assert.deepEqual(await validar(350,null,false,key),r);
 assert.equal((await query('select count(*) n from caja_arqueo_intentos')).rows[0].n,1);
 await assert.rejects(validar(351,null,false,key),/Identificador/);
});
test('fecha futura y día actual no sirven para arqueo',async()=>{
 await assert.rejects(query('select validar_arqueo_caja($1,$2,350,$3,null,false)',['TEST-A',hoy,randomUUID()]),/día anterior/);
 await assert.rejects(query("select calcular_efectivo_esperado_tienda('TEST-A',$1::date+1)",[hoy]),/fecha futura/);
});
test('no se reescriben días ya arqueados y los RPC antiguos no saltan la validación',async()=>{
 await assert.rejects(query("select cerrar_caja_piloto('TEST-A',$1,350,$2,null)",[ayer,randomUUID()]),/Valida el arqueo/);
 await validar(350);
 await assert.rejects(query("insert into gastos(tienda_codigo,fecha,monto,concepto_id,estado) values('TEST-A',$1,10,$2,'aprobado')",[ayer,concepto]),/arqueo validado/);
});
test('entradas abono y consignaciones tardías participan exactamente una vez',async()=>{
 await cambiarUsuario(gerente);
 await query("insert into movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto) values('TEST-A',$1,'consignacion',20),('TEST-A',$1,'abono',5)",[ancla]);
 assert.equal((await calcular()).esperado,335);
 await validar(335);
 assert.equal((await calcular(hoy)).apertura,335);
});
test('un gasto preautorizado rechazado no se descuenta',async()=>{
 await query('update conceptos_gasto set preautorizado=true');
 await query("insert into gastos(tienda_codigo,fecha,monto,concepto_id,estado) values('TEST-A',$1,30,$2,'rechazado')",[ayer,concepto]);
 assert.equal((await calcular()).esperado,350);
});
