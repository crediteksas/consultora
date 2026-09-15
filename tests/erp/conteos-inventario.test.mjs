import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before,after,test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
import XLSX from 'xlsx';
const sql=readFileSync(new URL('../../supabase/migrations/20260915162101_inventario_conteos_auditables.sql',import.meta.url),'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627',maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const storeUser='00000000-0000-0000-0000-000000000003',otherUser='00000000-0000-0000-0000-000000000004',otherAdmin='00000000-0000-0000-0000-000000000005';
let db,n=0;
before(async()=>{
 db=await PGlite.create();
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.perfiles(id uuid primary key,nombre text,rol text,tienda_codigo text,activo boolean default true);
 insert into perfiles(id,nombre,rol,tienda_codigo) values ('${oscar}','Oscar','gerencia',null),('${maite}','Maite','auditoria',null),('${storeUser}','Tienda A','admin_tienda','A'),('${otherUser}','Tienda B','admin_tienda','B'),('${otherAdmin}','Otro auditor','auditoria',null);
 create function public.tienda_actual() returns text language sql security definer as $$select tienda_codigo from perfiles where id=auth.uid()$$;
 create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean default true);
 insert into origenes values ('A','Tienda A','propia',true),('B','Tienda B','propia',true);
 create table productos(id uuid primary key default gen_random_uuid(),codigo text unique,nombre text,tipo text);
 create table stock_cantidad(producto_id uuid references productos,tienda_codigo text references origenes,cantidad integer check(cantidad>=0),precio_tienda numeric,costo_promedio numeric,updated_at timestamptz,primary key(producto_id,tienda_codigo));
 create table unidades(id uuid primary key default gen_random_uuid(),producto_id uuid references productos,imei text unique,estado text,tienda_actual text references origenes,precio_tienda numeric check(precio_tienda>0),costo_remision numeric);
 create table movimientos(id bigint generated always as identity primary key,tipo text check(tipo in ('ajuste_entrada','ajuste_salida')),tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad integer,costo numeric,costo_tienda numeric,referencia_tipo text,referencia_id text,usuario uuid,nota text);
 create table ajustes_inventario(id uuid primary key,tienda_codigo text,solicitado_por uuid,estado text,autorizado_por uuid,autorizado_at timestamptz,nota_rechazo text);
 alter table ajustes_inventario enable row level security;
 grant usage on schema public,auth to authenticated;grant select,insert,update,delete on stock_cantidad,unidades to authenticated;
 `);
 await db.exec(sql);
});
after(async()=>db?.close());
async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function api(action,data={}){return (await db.query('select public.inventario_conteos($1,$2::jsonb) r',[action,JSON.stringify(data)])).rows[0].r;}
async function fixture(qty=250,serialized=false){
 await db.exec('reset role');const code=`REF${++n}`,store=`T${n}`;
 await db.query("insert into origenes values($1,$1,'propia',true)",[store]);
 const id=(await db.query('insert into productos(codigo,nombre,tipo) values($1,$1,$2) returning id',[code,serialized?'serializado':'cantidad'])).rows[0].id;
 if(serialized)await db.query("insert into unidades(producto_id,imei,estado,tienda_actual,precio_tienda,costo_remision) values($1,$2,'disponible',$3,1500,900)",[id,`99999900000${n}`,store]);
 else await db.query('insert into stock_cantidad values($1,$2,$3,1500,900,now())',[id,store,qty]);
 await asUser(maite);const result=await api('crear',{tienda:store});return {id,code,store,result};
}
function upload(f,qty,time=f.result.corte.corte_at){return api('subir',{id:f.result.corte.id,contado_at:time,archivo:'conteo.xlsx',sha256:'a'.repeat(64),filas:[{codigo:f.code,imei:f.result.lineas[0].imei,cantidad:qty}]});}
function apply(f,extra={}){return api('aplicar',{id:f.result.corte.id,motivo:'Revisión física',soporte:'Acta de prueba',clasificacion:'sobrante_por_aclarar',...extra});}
test('el ejemplo conserva ventas posteriores: 250 → físico 499 → venta 17 → 482',async()=>{
 const f=await fixture();await db.exec('reset role');await db.query('update stock_cantidad set cantidad=cantidad-17 where producto_id=$1',[f.id]);await asUser(maite);
 const uploaded=await upload(f,499);assert.equal(uploaded.corte.estado,'pendiente');assert.equal(uploaded.lineas[0].actual,233);assert.equal(uploaded.lineas[0].diferencia,249);
 const applied=await apply(f);assert.equal(applied.lineas[0].posterior,482);assert.equal(Number(applied.lineas[0].valor_ajuste),373500);
 await assert.rejects(apply(f),/cerrado/);
 await db.exec('reset role');const m=(await db.query('select * from movimientos where referencia_id=$1',[f.result.corte.id])).rows;
 assert.equal(m.length,1);assert.equal(Number(m[0].costo_tienda),1500);assert.equal(m[0].usuario,maite);
});
test('si se cuentan 499 después de vender 17, no se restan por segunda vez',async()=>{
 const f=await fixture();await db.exec('reset role');await db.query('update stock_cantidad set cantidad=233 where producto_id=$1',[f.id]);
 const time=(await db.query('select clock_timestamp()::text t')).rows[0].t;await asUser(oscar);
 const u=await upload(f,499,time);assert.equal(u.lineas[0].esperado_conteo,233);assert.equal(u.lineas[0].diferencia,266);
 assert.equal((await apply(f)).lineas[0].posterior,499);
});
test('el conteo sin diferencias queda en historial sin movimientos',async()=>{
 const f=await fixture(10);await upload(f,10);const a=await apply(f);assert.equal(a.corte.estado,'sin_diferencias');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from movimientos where referencia_id=$1',[f.result.corte.id])).rows[0].n,0);
});
test('faltantes no dejan negativo y nuevos ingresos posteriores se conservan',async()=>{
 const f=await fixture(10);await upload(f,8);await db.exec('reset role');await db.query('update stock_cantidad set cantidad=15 where producto_id=$1',[f.id]);await asUser(maite);
 assert.equal((await apply(f)).lineas[0].posterior,13);
 const g=await fixture(2);await upload(g,0);await db.exec('reset role');await db.query('update stock_cantidad set cantidad=0 where producto_id=$1',[g.id]);await asUser(maite);await assert.rejects(apply(g),/negativo/);
});
test('un segundo corte anterior al ajuste no puede volver a aplicarlo',async()=>{
 const f=await fixture(10);const other=await api('crear',{tienda:f.store});await upload(f,12);await apply(f);
 await assert.rejects(api('subir',{id:other.corte.id,contado_at:other.corte.corte_at,archivo:'otro.xlsx',sha256:'b'.repeat(64),filas:[{codigo:f.code,imei:'',cantidad:12}]}),/otro ajuste/);
});
test('fechas, celdas vacías, borradas y duplicados rechazan toda la transacción',async()=>{
 const f=await fixture(10);await assert.rejects(upload(f,10,'2020-01-01T00:00:00Z'),/hora física/);
 const data={id:f.result.corte.id,contado_at:f.result.corte.corte_at,archivo:'test.xlsx',sha256:'c'.repeat(64),filas:[{codigo:f.code,imei:'',cantidad:''}]};
 await assert.rejects(api('subir',data),/inválida/);
 data.filas=[{codigo:f.code,imei:'',cantidad:10},{codigo:f.code,imei:'',cantidad:10}];await assert.rejects(api('subir',data),/duplicado/);
 assert.equal((await api('ver',{id:f.result.corte.id})).corte.estado,'abierto');
});
test('equipos se controlan uno a uno y nunca se anula una venta posterior',async()=>{
 const f=await fixture(1,true);await upload(f,0);await db.exec('reset role');await db.query("update unidades set estado='vendido' where producto_id=$1",[f.id]);await asUser(oscar);await assert.rejects(apply(f),/negativo|disponible/);
 const g=await fixture(1,true);await upload(g,0);assert.equal((await apply(g)).lineas[0].posterior,0);
});
test('todas las tiendas usan las mismas reglas, sin privilegios de aprobación para retail',async()=>{
 await asUser(storeUser);assert.deepEqual((await api('config')).tiendas.map(t=>t.codigo),['A']);
 await assert.rejects(api('crear',{tienda:'B'}),/otra tienda/);
 const own=await api('crear',{tienda:'A'});await assert.rejects(api('rechazar',{id:own.corte.id,motivo:'No aplica'}),/Mayte/);
 await asUser(otherUser);await assert.rejects(api('ver',{id:own.corte.id}),/otra tienda/);
 await asUser(otherAdmin);assert.equal((await api('config')).autoriza,false);await assert.rejects(api('rechazar',{id:own.corte.id,motivo:'No aplica'}),/Mayte/);
 await asUser(maite);await assert.rejects(db.query('update public.stock_cantidad set cantidad=0'),/permission denied/);
 await assert.rejects(db.query('select * from inventario_control.cortes'),/permission denied/);
 await asUser('');await assert.rejects(api('config'),/perfil activo/);
});
test('informe pagina estable y fecha final incluye todo el día colombiano',async()=>{
 await asUser(oscar);const result=await api('informe',{desde:'2020-01-01',hasta:'2099-12-31'});assert.ok(result.cortes.length>=10);
 const last=result.cortes.at(-1);const next=await api('informe',{desde:'2020-01-01',hasta:'2099-12-31',despues_fecha:last.corte_at,despues_id:last.id});assert.equal(next.cortes.length,0);
 await asUser(storeUser);const own=await api('informe',{desde:'2020-01-01',hasta:'2099-12-31'});assert.ok(own.cortes.every(c=>c.tienda_codigo==='A'));
});
test('un inventario vacío también conserva conteo y aprobación sin inventar unidades',async()=>{
 await asUser(storeUser);const c=await api('crear',{tienda:'A'});await api('subir',{id:c.corte.id,contado_at:c.corte.corte_at,archivo:'vacio.xlsx',sha256:'d'.repeat(64),filas:[]});
 await asUser(maite);const a=await apply({result:c});assert.equal(a.corte.estado,'sin_diferencias');assert.equal(a.lineas.length,0);
});
test('API pública invoker, privada autenticada, anónimo sin acceso',async()=>{
 await db.exec('reset role');assert.equal((await db.query("select prosecdef from pg_proc where proname='inventario_conteos'")).rows[0].prosecdef,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.inventario_conteos(text,jsonb)','execute') ok")).rows[0].ok,false);
 assert.doesNotMatch(sql,/\b(?:insert into|update|delete from) public\.(?:cartera|pagos|remision_margenes|financial_entries)/i);
});
test('un perfil sin rol no obtiene autorización por valores nulos',async()=>{
 await db.exec('reset role');const id=(await db.query("insert into perfiles(id,nombre,rol,tienda_codigo) values(gen_random_uuid(),'Sin rol',null,'A') returning id")).rows[0].id;
 await asUser(id);assert.equal((await api('config')).autoriza,false);
 await assert.rejects(api('crear',{tienda:'B'}),/otra tienda/);
 const own=await api('crear',{tienda:'A'});await assert.rejects(api('rechazar',{id:own.corte.id,motivo:'No autorizado'}),/Mayte/);
});
test('un costo ausente confirmado queda también en la existencia, sin modificar costo proveedor',async()=>{
 const f=await fixture(5);await db.exec('reset role');await db.query('update stock_cantidad set precio_tienda=null where producto_id=$1',[f.id]);await asUser(maite);
 f.result=await api('crear',{tienda:f.store});await upload(f,6);
 await apply(f,{costos:[{codigo:f.code,imei:'',costo_tienda:1800}]});await db.exec('reset role');
 const s=(await db.query('select * from stock_cantidad where producto_id=$1',[f.id])).rows[0];assert.equal(Number(s.precio_tienda),1800);assert.equal(Number(s.costo_promedio),900);
});
test('diez tiendas: conteos aislados, revisión de Mayte y mismo saldo final',async()=>{
 for(let i=0;i<10;i++){
   const f=await fixture(20);await db.exec('reset role');const user=(await db.query("insert into perfiles(id,nombre,rol,tienda_codigo) values(gen_random_uuid(),'Operador','admin_tienda',$1) returning id",[f.store])).rows[0].id;
   await asUser(user);assert.equal((await api('ver',{id:f.result.corte.id})).lineas[0].cantidad_corte,20);
   await upload(f,21);await assert.rejects(apply(f),/Mayte/);await asUser(maite);assert.equal((await apply(f)).lineas[0].posterior,21);
 }
});
test('nuevo sobrante exige costo tienda y un IMEI existente nunca se duplica',async()=>{
 const f=await fixture(1,true);await db.exec('reset role');const code=`NEW${++n}`;
 await db.query("insert into productos(codigo,nombre,tipo) values($1,$1,'serializado')",[code]);await asUser(maite);
 await api('subir',{id:f.result.corte.id,contado_at:f.result.corte.corte_at,archivo:'nuevo.xlsx',sha256:'a'.repeat(64),filas:[{codigo:f.code,imei:f.result.lineas[0].imei,cantidad:1},{codigo:code,imei:'998887770001112',cantidad:1}]});
 await assert.rejects(apply(f),/costo de tienda/);
 const a=await apply(f,{costos:[{codigo:code,imei:'998887770001112',costo_tienda:120000}]});
 assert.equal(a.lineas.find(l=>l.codigo===code).posterior,1);
 await db.exec('reset role');assert.equal(Number((await db.query("select precio_tienda from unidades where imei='998887770001112'")).rows[0].precio_tienda),120000);
});
test('la paginación carga más de mil referencias y no disfraza errores como inventario completo',async()=>{
 const ctx={};vm.runInNewContext(readFileSync(new URL('../../creditek/erp/inventario-domain.js',import.meta.url),'utf8'),ctx);
 const data=Array.from({length:1748},(_,i)=>i);
 const result=await ctx.CreditekInventarioDomain.cargarPaginas(()=>({range:(a,b)=>({data:data.slice(a,b+1),error:null})}));
 assert.equal(result.data.length,1748);
 const failure=await ctx.CreditekInventarioDomain.cargarPaginas(()=>({range:(a,b)=>a?{data:null,error:{message:'fallo'}}:{data:data.slice(a,b+1),error:null}}));
 assert.equal(failure.data,null);assert.equal(failure.error.message,'fallo');
});
test('Excel exige cantidades explícitas e identificador persistente',()=>{
 const ctx={};vm.runInNewContext(readFileSync(new URL('../../creditek/erp/conteos-domain.js',import.meta.url),'utf8'),ctx);
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Formato','KORA-CONTEO-1'],['ID',oscar]]),'Resumen');
 XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{'Código producto':'A','IMEI / serial':'','Cantidad física':0}]),'Conteo');
 assert.equal(ctx.KoraConteos.leerLibro(XLSX,book).filas[0].cantidad,0);
 book.Sheets.Conteo.C2.v='';assert.throws(()=>ctx.KoraConteos.leerLibro(XLSX,book),/vacío/);
 assert.equal(ctx.KoraConteos.conciliar(250,499,233).propuesto,482);
 assert.equal(ctx.KoraConteos.conciliar(233,499,233).propuesto,499);
});
