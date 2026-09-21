import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const source = readFileSync('supabase/migrations/20260917230803_traslados_recepcion_y_visto_bueno_central.sql','utf8');
const start = source.indexOf('create or replace function public.aprobar_traslado_recepcion(');
const rpc = source.slice(start, source.indexOf('$function$;',start)+12);
const migration = readFileSync('supabase/migrations/20260921184612_permitir_entrada_movimientos_traslado.sql','utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('aprobación real: reproduce CHECK, corrige IMEI y accesorio, conserva cartera y evita duplicados', async () => {
 const db = new PGlite();
 try {
  await db.exec(`
   create schema auth;
   create function auth.uid() returns uuid language sql as $$select '${id(1)}'::uuid$$;
   create function public.es_central() returns boolean language sql as $$select current_setting('app.central',true)='true'$$;
   create table traslados(id uuid primary key,consecutivo bigint,estado text,tienda_origen text,tienda_destino text,aprobado_at timestamptz,aprobado_por uuid);
   create table traslado_items(id uuid,traslado_id uuid,producto_id uuid,unidad_id uuid,cantidad int,costo numeric,precio_tienda numeric);
   create table unidades(id uuid,tienda_actual text,estado text,precio_tienda numeric);
   create table movimientos(tipo text,tienda_codigo text,producto_id uuid,unidad_id uuid,cantidad int,costo numeric,precio numeric,referencia_tipo text,referencia_id text,usuario uuid,
    constraint movimientos_tipo_check check(tipo in ('compra_entrada','remision_entrada','remision_salida_central','traslado_salida','venta','ajuste_entrada','ajuste_salida','carga_inicial','reverso')));
   create table origenes(codigo text,nombre text);
   create table cuentas_cartera(id uuid default gen_random_uuid(),tipo_cuenta text,tienda_codigo text,nombre text,activo boolean default true,updated_at timestamptz);
   create unique index on cuentas_cartera(tienda_codigo,tipo_cuenta) where tienda_codigo is not null;
   create table movimientos_cartera(cuenta_id uuid,tienda_codigo text,efecto text,monto numeric,concepto text,referencia_tipo text,referencia_id text,metadatos jsonb,unique(cuenta_id,referencia_tipo,referencia_id,efecto));
   create table cuenta_corriente(tienda_codigo text,tipo text,concepto text,monto numeric,referencia_tipo text,referencia_id text,usuario uuid);
   create table stock_test(tienda text,producto uuid,cantidad int,costo numeric,precio numeric);
   create function aplicar_costo_promedio_tienda(text,uuid,integer,numeric,numeric,text,text,text) returns void language sql as $$insert into stock_test values($1,$2,$3,$4,$5)$$;
   insert into origenes values('ORIGEN','Origen'),('DESTINO','Destino');
   insert into traslados values('${id(5)}',5,'recibido_pendiente_aprobacion','ORIGEN','DESTINO',null,null);
   insert into unidades values('${id(10)}','ORIGEN','en_traslado',645000);
   insert into traslado_items values('${id(20)}','${id(5)}','${id(30)}','${id(10)}',1,600000,645000),('${id(21)}','${id(5)}','${id(31)}',null,2,10000,12000);
   ${rpc}
   set app.central='true';
  `);
  const invoke = () => db.query('select aprobar_traslado_recepcion($1) result',[id(5)]);
  const snapshot = async () => (await db.query(`select jsonb_build_object('documento',(select jsonb_agg(t) from traslados t),'unidades',(select jsonb_agg(t) from unidades t),'movimientos',(select jsonb_agg(t) from movimientos t),'cartera',(select jsonb_agg(t) from movimientos_cartera t),'cc',(select jsonb_agg(t) from cuenta_corriente t),'stock',(select jsonb_agg(t) from stock_test t)) data`)).rows;
  const before = await snapshot();
  await assert.rejects(invoke(), /movimientos_tipo_check/);
  assert.deepEqual(await snapshot(),before);
  await db.exec(migration);
  await db.exec("set app.central='false'");
  await assert.rejects(invoke(), /Solo Gerencia o Auditoría/);
  assert.deepEqual(await snapshot(),before);
  await db.exec("set app.central='true'");
  const result = (await invoke()).rows[0].result;
  assert.equal(result.total,669000); assert.equal(result.estado,'cerrado');
  assert.deepEqual((await db.query('select tienda_actual,estado,precio_tienda from unidades')).rows,[{tienda_actual:'DESTINO',estado:'disponible',precio_tienda:'645000'}]);
  const movements = (await db.query('select tipo,costo,precio,cantidad from movimientos order by precio desc')).rows;
  assert.deepEqual(movements,[{tipo:'traslado_entrada',costo:'600000',precio:'645000',cantidad:1},{tipo:'traslado_entrada',costo:'10000',precio:'12000',cantidad:2}]);
  assert.equal((await db.query('select count(*)::int n from stock_test')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from movimientos_cartera')).rows[0].n,2);
  assert.equal((await db.query("select sum(case efecto when 'debito' then monto else -monto end) neto from movimientos_cartera")).rows[0].neto,'0');
  assert.equal((await db.query('select count(*)::int n from cuenta_corriente')).rows[0].n,2);
  const after = await snapshot();
  await assert.rejects(invoke(), /pendiente de visto bueno/);
  assert.deepEqual(await snapshot(),after);
  await assert.rejects(db.exec("insert into movimientos(tipo) values('inventado')"), /movimientos_tipo_check/);
  for (const tipo of ['compra_entrada','remision_entrada','remision_salida_central','traslado_salida','venta','ajuste_entrada','ajuste_salida','carga_inicial','reverso','traslado_entrada']) {
   await db.query('insert into movimientos(tipo) values($1)',[tipo]);
  }
 } finally { await db.close(); }
});
