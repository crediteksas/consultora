import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../../supabase/migrations/20260911195932_remisiones_clientes_b2b_cartera_directa.sql',import.meta.url),'utf8');
test('B2B carga cartera una vez, conserva factura y no crea inventario destino',async()=>{
 const db=new PGlite();try{
 await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
 create schema remisiones_edicion_private;
 create function remisiones_edicion_private.permitido() returns boolean language sql as $$select coalesce(current_setting('test.permitido',true),'si')<>'no'$$;
 create function es_central() returns boolean language sql as $$select true$$;
 create table origenes(codigo text,nombre text,tipo text,activo boolean);
 insert into origenes values('CK-12','Oscar','cliente_b2b',true),('CK-13','Luis','cliente_b2b',true),('CK-14','Meico','cliente_b2b',true),('CK-02','Tienda','propia',true);
 create table cuentas_cartera(id uuid default gen_random_uuid(),tienda_codigo text,tipo_cuenta text,activo boolean);
 insert into cuentas_cartera(tienda_codigo,tipo_cuenta,activo) select codigo,'cliente_b2b',true from origenes where tipo='cliente_b2b';
 create table remisiones(id uuid default gen_random_uuid(),consecutivo serial,estado text constraint remisiones_estado_check check(estado in ('despachada')),tienda_codigo text);
 create table remision_items(id uuid default gen_random_uuid(),remision_id uuid,cantidad int,precio_remision numeric,factura text);
 create table unidades(estado text constraint unidades_estado_check check(estado in ('en_traslado')),remision_item_id uuid,tienda_actual text,factura text);
 create table movimientos_cartera(cuenta_id uuid,tienda_codigo text,efecto text,monto numeric,concepto text,referencia_tipo text,referencia_id text,fecha_efectiva date,metadatos jsonb,creado_por uuid);
 create function public.despachar_remision_desde_central(text,jsonb,text) returns jsonb language plpgsql set search_path=public,pg_temp as $$
 declare r uuid;i uuid;n int;
 begin
 if ($2->0->>'cantidad')::int>3 then raise exception 'Stock insuficiente';end if;
 insert into remisiones(estado,tienda_codigo) values('despachada',$1) returning id,consecutivo into r,n;
 insert into remision_items(remision_id,cantidad,precio_remision,factura) values(r,($2->0->>'cantidad')::int,100,'FE-123') returning id into i;
 insert into unidades values('en_traslado',i,'CENTRAL','FE-123');
 return jsonb_build_object('ok',true,'remision_id',r,'consecutivo',n);end;$$;
 `);
 await db.exec(sql);
 const request='00000000-0000-0000-0000-000000000002';
 const call=(dest,items,key=request)=>db.query('select public.despachar_remision_cliente_b2b($1,$2::jsonb,null,$3) r',[dest,JSON.stringify(items),key]);
 const result=(await call('CK-12',[{cantidad:3}])).rows[0].r;
 assert.deepEqual((await call('CK-12',[{cantidad:3}])).rows[0].r,result);
 assert.equal((await db.query('select count(*)::int n from movimientos_cartera')).rows[0].n,1);
 assert.equal((await db.query('select monto from movimientos_cartera')).rows[0].monto,'300');
 assert.equal((await db.query('select estado from remisiones')).rows[0].estado,'cartera_b2b');
 assert.deepEqual((await db.query('select estado,tienda_actual,factura from unidades')).rows[0],{estado:'salida_b2b',tienda_actual:'CENTRAL',factura:'FE-123'});
 await assert.rejects(call('CK-13',[{cantidad:3}]),/otros datos/);
 await assert.rejects(call('CK-02',[{cantidad:1}],'00000000-0000-0000-0000-000000000003'),/no rows/);
 await assert.rejects(call('CK-14',[{cantidad:4}],'00000000-0000-0000-0000-000000000004'),/Stock/);
 await db.exec("select set_config('test.permitido','no',false)");
 await assert.rejects(call('CK-12',[{cantidad:3}]),/Solo Maite/);
 await assert.rejects(db.query("select public.despachar_remision_desde_central('CK-12','[]',null)"),/cartera B2B/);
 assert.equal((await db.query('select count(*)::int n from movimientos_cartera')).rows[0].n,1);
 }finally{await db.close()}
});
