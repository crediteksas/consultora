import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
const sql = await readFile(new URL('../../supabase/migrations/20260926221304_ventas_obsequios_autorizacion.sql', import.meta.url),'utf8');
const registroSql = await readFile(new URL('../../supabase/migrations/20260928121506_ventas_registro_antes_contabilizacion.sql', import.meta.url),'utf8');
const fechaSql = await readFile(new URL('../../supabase/migrations/20261001030322_ventas_fecha_bogota_autorizacion.sql', import.meta.url),'utf8');
const ceroTrasArqueoSql = await readFile(new URL('../../supabase/migrations/20261001042000_venta_cero_autorizada_tras_arqueo.sql', import.meta.url),'utf8');
const ceroDecimalSql = await readFile(new URL('../../supabase/migrations/20261001044500_venta_cero_arqueo_total_decimal.sql', import.meta.url),'utf8');
const original = await readFile(new URL('./fixtures/registrar-venta-auditada-20260910.sql',import.meta.url),'utf8');
const html = await readFile(new URL('../../creditek/erp/ventas.html',import.meta.url),'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627', mayte='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const seller='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const product='20000000-0000-4000-8000-000000000001', phone='20000000-0000-4000-8000-000000000002', unit='30000000-0000-4000-8000-000000000001';
const request='40000000-0000-4000-8000-000000000001';
async function setup(upgrade=true){
 const db=await PGlite.create();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema kora_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table perfiles(id uuid primary key,nombre text,rol text,activo boolean default true,tienda_codigo text);
 create function rol_actual() returns text language sql security definer as $$select rol from public.perfiles where id=auth.uid() and activo$$;
 create function tienda_actual() returns text language sql security definer as $$select tienda_codigo from public.perfiles where id=auth.uid() and activo$$;
 create function es_central() returns boolean language sql security definer as $$select coalesce(public.rol_actual() in ('gerencia','auditoria'),false)$$;
 create table clientes(id uuid primary key,nombre_completo text,cedula text);
 create table origenes(codigo text primary key,nombre text);
 insert into origenes values('CK-01','Tienda prueba');
 create table productos(id uuid primary key,nombre text,tipo text);
 create table unidades(id uuid primary key,producto_id uuid,tienda_actual text,estado text,costo_remision numeric,precio_tienda numeric,imei text);
 create table stock_cantidad(producto_id uuid,tienda_codigo text,cantidad int,costo_promedio numeric,updated_at timestamptz);
 create table ventas(id uuid primary key default gen_random_uuid(),consecutivo bigint generated always as identity,tienda_codigo text,vendedor uuid,tipo text,cliente_id uuid,total numeric(14,2),anulada boolean,nota text,fecha date default current_date);
 create table venta_items(venta_id uuid,producto_id uuid,unidad_id uuid,cantidad int,precio_venta numeric,costo_congelado numeric);
 create table movimientos(tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad int,costo numeric,precio numeric,referencia_tipo text,referencia_id text,usuario uuid);
 create table creditos(venta_id uuid,financiera text,cuota_inicial numeric,valor_esperado_financiera numeric,plazo_meses int,estado_conciliacion text);
 insert into perfiles values('${seller}','Vendedor','asesor',true,'CK-01'),('${other}','Otro auditor','auditoria',true,null),('${oscar}','Oscar','gerencia',true,null),('${mayte}','Mayte','auditoria',true,null);
 insert into productos values('${product}','Vidrio blindado','cantidad'),('${phone}','Celular','serializado');
 insert into stock_cantidad values('${product}','CK-01',10,1500,now());
 insert into unidades values('${unit}','${phone}','CK-01','disponible',300000,430000,'123456789012345');`);
 const protection=await readFile(new URL('../../supabase/migrations/20260903204915_proteger_ventas_y_anulacion_administrativa.sql',import.meta.url),'utf8');
 await db.exec(protection.slice(protection.indexOf('create or replace function public.proteger_registro_venta_confirmada()'),protection.indexOf('create or replace function public.corregir_venta_administrativa(')));
 await db.exec(original);
 await db.exec(sql);
 if(upgrade) await db.exec(registroSql);
 if(upgrade) await db.exec(fechaSql);
 await db.exec('grant usage on schema public,auth to authenticated');
 await login(db,seller);
 return db;
}
async function login(db,id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
const items=price=>[{producto_id:product,unidad_id:null,cantidad:1,precio_venta:price}];
async function register(db,price=0,id=request,lines=items(price)){
 return (await db.query('select public.registrar_venta_con_autorizacion($1,$2,$3,null,$4,null,null) as r',[id,'CK-01','contado',JSON.stringify(lines)])).rows[0].r;
}
async function resolve(db,approve=true){return (await db.query('select public.resolver_autorizacion_venta($1,$2,$3) as r',[request,approve,approve?null:'No autorizado'])).rows[0].r;}
async function count(db,table){return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n);}
async function activarArqueoValidado(db){
 await db.exec(`create table caja_cortes(tienda_codigo text,fecha date,estado text,efectivo_contado numeric);
 create function caja_exigir_apertura(p_tienda text,p_fecha date,p_es_gasto boolean default false)
 returns void language plpgsql as $$begin
   if exists(select 1 from caja_cortes where tienda_codigo=p_tienda and fecha>=p_fecha and estado='validada')
   then raise exception 'El día ya tiene arqueo validado'; end if;
 end$$;
 create function caja_guardar_movimiento() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 declare fila jsonb; anterior jsonb; tienda text; fecha_mov date; venta uuid;
 begin
   fila:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
   if tg_table_name='venta_items' then
     venta:=(fila->>'venta_id')::uuid;
     select tienda_codigo,fecha into tienda,fecha_mov from ventas where id=venta;
   else tienda:=fila->>'tienda_codigo'; fecha_mov:=(fila->>'fecha')::date; end if;
   -- Ambas tiendas/fechas se verifican al reasignar, no solo el destino nuevo.
   if tg_op='UPDATE' then
     anterior:=to_jsonb(old);
     perform caja_exigir_apertura((anterior->>'tienda_codigo'),(anterior->>'fecha')::date,false);
   end if;
   perform caja_exigir_apertura(tienda,fecha_mov,false);
   if tg_op='DELETE' then return old; else return new; end if;
 end$$;
 create trigger caja_ciclo_ventas before insert or update of total,tipo,fecha,tienda_codigo,anulada or delete on ventas
 for each row execute function caja_guardar_movimiento();
 create trigger caja_ciclo_items before insert or update of precio_venta,cantidad,venta_id or delete on venta_items
 for each row execute function caja_guardar_movimiento();`);
 await db.exec(ceroTrasArqueoSql);
 await db.exec(ceroDecimalSql);
}

test('obsequio cargado, autorizado por Mayte, conserva vendedor y no duplica inventario ni venta',async()=>{
 const db=await setup();try{
  const registrada = await register(db);
  assert.equal(registrada.estado,'pendiente');
  assert.equal(registrada.registrada,true);assert.equal(registrada.contabilizada,false);assert.ok(registrada.consecutivo);
  assert.deepEqual(await register(db),registrada);
  const lista=(await db.query('select listar_ventas_registradas_sin_contabilizar() as r')).rows[0].r;
  assert.equal(lista.length,1);assert.equal(lista[0].consecutivo,registrada.consecutivo);
  assert.equal(lista[0].venta_items[0].precio_venta,0);
  assert.equal(await count(db,'ventas_autorizaciones'),1);
  for(const t of ['ventas','venta_items','movimientos','creditos']) assert.equal(await count(db,t),0);
  assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,10);
  await assert.rejects(resolve(db),/Solo Mayte/);
  await login(db,other);await assert.rejects(resolve(db),/Solo Mayte/);
  await login(db,mayte);const result=await resolve(db);assert.equal(result.estado,'aprobada');assert.equal(Number(result.total),0);
  assert.equal(result.consecutivo,registrada.consecutivo);assert.equal(result.venta_id,registrada.venta_id);assert.equal(result.contabilizada,true);
  assert.deepEqual((await db.query('select listar_ventas_registradas_sin_contabilizar() as r')).rows[0].r,[]);
  assert.deepEqual(await resolve(db),result);
  assert.equal(await count(db,'ventas'),1);assert.equal(await count(db,'movimientos'),1);
  assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,9);
  assert.equal((await db.query('select vendedor from ventas')).rows[0].vendedor,seller);
  const audit=(await db.query('select * from ventas_autorizaciones')).rows[0];assert.equal(audit.resuelto_por,mayte);assert.ok(audit.resuelto_en);
 }finally{await db.close();}
});
test('la autorización contabiliza con la fecha de registro en Colombia, aunque se apruebe después',async()=>{
 const db=await setup();try{
  await register(db);
  await db.exec(`update ventas_autorizaciones set creado_en='2026-09-30 20:50:51+00' where id='${request}'`);
  await login(db,mayte);
  assert.equal((await resolve(db)).estado,'aprobada');
  assert.equal((await db.query('select fecha::text from ventas where id=$1',[request])).rows[0].fecha,'2026-09-30');
 }finally{await db.close();}
});
test('Mayte y Óscar pueden aprobar un obsequio $0 tras arqueo sin alterar Caja; una venta con valor sigue bloqueada',async()=>{
 for(const autorizador of [mayte,oscar]){
  const db=await setup();try{
   await activarArqueoValidado(db);
   await register(db);
   const fecha=(await db.query("select (creado_en at time zone 'America/Bogota')::date as fecha from ventas_autorizaciones where id=$1",[request])).rows[0].fecha;
   await db.query("insert into caja_cortes values('CK-01',$1,'validada',1781050)",[fecha]);
   await login(db,autorizador);
   const aprobado=await resolve(db);
   assert.equal(aprobado.estado,'aprobada');
   assert.equal(Number((await db.query('select total from ventas')).rows[0].total),0);
   assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,9);
   assert.equal((await db.query('select efectivo_contado from caja_cortes')).rows[0].efectivo_contado,'1781050');
   assert.equal((await db.query('select resuelto_por from ventas_autorizaciones')).rows[0].resuelto_por,autorizador);
  }finally{await db.close();}
 }
 const db=await setup();try{
  await activarArqueoValidado(db);
  await register(db,1000);
  const fecha=(await db.query("select (creado_en at time zone 'America/Bogota')::date as fecha from ventas_autorizaciones where id=$1",[request])).rows[0].fecha;
  await db.query("insert into caja_cortes values('CK-01',$1,'validada',1781050)",[fecha]);
  await login(db,mayte);
  await assert.rejects(resolve(db),/arqueo validado/);
  assert.equal(await count(db,'ventas'),0);
  assert.equal((await db.query('select estado from ventas_autorizaciones')).rows[0].estado,'pendiente');
 }finally{await db.close();}
});
test('precio por debajo del costo Retail solicita autorización de Óscar aunque supere costo central',async()=>{
 const db=await setup();try{
  assert.equal((await register(db,0,request,[{producto_id:phone,unidad_id:unit,cantidad:1,precio_venta:400000}])).estado,'pendiente');
  await login(db,oscar);assert.equal((await resolve(db)).estado,'aprobada');
  assert.equal((await db.query('select estado from unidades')).rows[0].estado,'vendido');
 }finally{await db.close();}
});
test('venta mixta conserva celular y vidrio de regalo sin contabilizar antes de aprobar',async()=>{
 const db=await setup();try{
  const result=await register(db,0,request,[{producto_id:phone,unidad_id:unit,cantidad:1,precio_venta:530000},...items(0)]);
  assert.equal(result.estado,'pendiente');assert.equal(Number(result.total),530000);assert.equal(await count(db,'ventas'),0);
  const registro=(await db.query('select listar_ventas_registradas_sin_contabilizar() as r')).rows[0].r[0];
  assert.equal(registro.id,result.venta_id);assert.equal(registro.consecutivo,result.consecutivo);
  assert.deepEqual(registro.venta_items.map(i=>Number(i.precio_venta)).sort((a,b)=>a-b),[0,530000]);
  await login(db,oscar);await resolve(db);assert.equal(await count(db,'venta_items'),2);
  assert.equal(Number((await db.query('select total from ventas')).rows[0].total),530000);
 }finally{await db.close();}
});
test('precio normal registra, precio negativo/vacío/NaN y cantidades inválidas se rechazan',async()=>{
 const db=await setup();try{
  for(const p of [-1,null,'','NaN','Infinity']) await assert.rejects(register(db,p));
  for(const q of [-1,0,0.5]) await assert.rejects(register(db,2000,request,[{...items(2000)[0],cantidad:q}]));
  assert.equal(await count(db,'ventas_autorizaciones'),0);
  assert.equal((await register(db,1500)).estado,'registrada');
  await register(db,1500);assert.equal(await count(db,'ventas'),1);
  await assert.rejects(register(db,2000),/otros datos/);
 }finally{await db.close();}
});
test('rechazo no descuenta stock, es auditable y la cuenta desactivada no puede aprobar',async()=>{
 const db=await setup();try{
  await register(db,1000);await login(db,oscar);await db.exec(`update perfiles set activo=false where id='${oscar}'`);
  await assert.rejects(resolve(db),/Solo Mayte/);await login(db,mayte);
  assert.equal((await resolve(db,false)).estado,'rechazada');assert.equal((await resolve(db)).estado,'rechazada');
  const registros=(await db.query('select listar_ventas_registradas_sin_contabilizar() as r')).rows[0].r;assert.equal(registros.length,1);assert.equal(registros[0].estado_contabilizacion,'rechazada');
  assert.equal(await count(db,'ventas'),0);assert.equal((await db.query('select cantidad from stock_cantidad')).rows[0].cantidad,10);
 }finally{await db.close();}
});
test('se vuelve a comprobar inventario y costo al aprobar; una falla deja pendiente',async()=>{
 const db=await setup();try{
  await register(db);await login(db,mayte);await db.exec('update stock_cantidad set cantidad=0');
  await assert.rejects(resolve(db),/Stock insuficiente/);
  await db.exec('update stock_cantidad set cantidad=10,costo_promedio=2000');await assert.rejects(resolve(db),/costo o detalle cambió/);
  assert.equal((await db.query('select estado from ventas_autorizaciones')).rows[0].estado,'pendiente');assert.equal(await count(db,'ventas'),0);
 }finally{await db.close();}
});
test('ni RPC antiguo, ni otra tienda, ni acceso directo permiten omitir autorización',async()=>{
 const db=await setup();try{
  const r=(await db.query("select registrar_venta('CK-01','contado',null,$1,null,null) as r",[JSON.stringify(items(1000))])).rows[0].r;
  assert.equal(r.estado,'pendiente');assert.equal(await count(db,'ventas'),0);
  await db.exec(`update perfiles set tienda_codigo='CK-02' where id='${seller}'`);await assert.rejects(register(db),/No autorizado/);
  for(const signature of ['kora_private.registrar_venta_autorizada_interno(text,text,uuid,jsonb,jsonb,text,uuid)','kora_private.inspeccionar_venta_excepcional(text,jsonb)']){
   assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') ok",[signature])).rows[0].ok,false);
  }
  assert.equal((await db.query("select has_table_privilege('authenticated','ventas_autorizaciones','INSERT') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('paso productos acepta $0 y no confunde campo vacío con obsequio',()=>{
 const f=html.slice(html.indexOf('function avanzarPaso()'),html.indexOf('\nfunction retrocederPaso('));
 for(const [price,advance] of [[0,true],[1000,true],[-1,false],[null,false],['',false],[NaN,false]]){
  const err={classList:{remove(){},add(){}},textContent:''};let step=null;
  const c=vm.createContext({document:{getElementById(){return err;}},pasoActual:3,venta:{tipo:'contado',items:[{tipoProducto:'cantidad',precio_venta:price,costo_unitario:1500}]},mostrarPaso(n){step=n;}});
  vm.runInContext(f,c);c.avanzarPaso();assert.equal(step===5,advance);
 }
 assert.match(html,/precio_venta \?\? ''/);assert.match(html,/precio_venta == null/);
 assert.match(html,/data.estado === 'pendiente'/);assert.match(html,/p_solicitud_id: venta.solicitudId/);
});

test('RLS muestra solo solicitudes de la tienda y ninguna a un perfil desactivado',async()=>{
 const db=await setup();try{
  await register(db);await db.exec('set role authenticated');
  assert.equal(await count(db,'ventas_autorizaciones'),1);
  await assert.rejects(db.exec("update ventas_autorizaciones set estado='aprobada'"),/permission denied/);
  await db.exec('reset role');await db.exec(`update perfiles set tienda_codigo='CK-02' where id='${seller}'`);await db.exec('set role authenticated');
  assert.equal(await count(db,'ventas_autorizaciones'),0);
  assert.deepEqual((await db.query('select listar_ventas_registradas_sin_contabilizar() as r')).rows[0].r,[]);
  await login(db,mayte);assert.equal(await count(db,'ventas_autorizaciones'),1);
  await db.exec('reset role');await db.exec(`update perfiles set activo=false where id='${mayte}'`);await db.exec('set role authenticated');
  assert.equal(await count(db,'ventas_autorizaciones'),0);
 }finally{await db.close();}
});

test('listado incluye registradas y reserva los indicadores para ventas contabilizadas',()=>{
 assert.match(html,/listar_ventas_registradas_sin_contabilizar/);
 assert.match(html,/!v.anulada && !v.sin_contabilizar/);
 assert.match(html,/Venta #\$\{data.consecutivo\} registrada con los precios ingresados/);
 assert.doesNotMatch(html,/Cargar para autorización/);
 assert.match(html,/Registrar venta/);
 assert.match(html,/nombresTiendas\.get\(r\.tienda_codigo\)/);
 assert.match(html,/caja_cortes/);
 assert.match(html,/arqueo validado/);
 assert.match(html,/obsequioSinEfectivo/);
 assert.match(html,/visto bueno de Mayte u Óscar/);
 assert.match(html,/class="autorizacion-error" role="alert" hidden/);
});

test('ventas pendientes anteriores adquieren número sin contabilizar ni alterar precios',async()=>{
 const db=await setup(false);try{
  await register(db,0);await db.exec(registroSql);
  const r=(await db.query('select listar_ventas_registradas_sin_contabilizar() as r')).rows[0].r[0];
  assert.ok(r.consecutivo);assert.equal(r.venta_items[0].precio_venta,0);assert.equal(await count(db,'ventas'),0);
  await login(db,mayte);const aprobado=await resolve(db);assert.equal(aprobado.consecutivo,r.consecutivo);assert.equal(aprobado.venta_id,r.id);
 }finally{await db.close();}
});
