import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationFile = 'supabase/migrations/20260919224627_permitir_reverso_movimientos_anulacion.sql';
const original = readFileSync('supabase/migrations/20260917230803_traslados_recepcion_y_visto_bueno_central.sql', 'utf8');
const costs = readFileSync('supabase/migrations/20260914164745_costos_tienda_lecturas_seguras.sql', 'utf8');
function extractFunction(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `No se encontró ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start);
  return source.slice(start, end + endText.length);
}
const realRpc = extractFunction(original, 'create or replace function public.anular_traslado(', '$function$;');
const realFreeze = extractFunction(costs, 'create or replace function kora_private.congelar_costo_movimiento_tienda()', 'end $$;');
const id = number => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const reason = 'Destino incorrecto: devolver a la tienda de origen';

async function fixture(state = 'despachado') {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema kora_private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid', true), '')::uuid$$;
    create table public.perfiles(id uuid primary key, rol text, activo boolean);
    insert into public.perfiles values
      ('${id(1)}','gerencia',true),('${id(2)}','auditoria',true),('${id(3)}','admin_tienda',true),('${id(4)}','gerencia',false);
    create function public.rol_actual() returns text language sql stable security definer set search_path='' as $$
      select rol from public.perfiles where id=auth.uid() and activo;
    $$;
    create function public.es_central() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce(public.rol_actual() in ('gerencia','auditoria'),false);
    $$;
    create table public.traslados(id uuid primary key, consecutivo bigint, estado text, tienda_origen text, tienda_destino text, nota text);
    create table public.traslado_items(id uuid primary key, traslado_id uuid references public.traslados(id), producto_id uuid, unidad_id uuid, cantidad integer, costo numeric, precio_tienda numeric);
    create table public.unidades(id uuid primary key, producto_id uuid, estado text, tienda_actual text, costo_remision numeric, precio_tienda numeric);
    create table public.stock_cantidad(producto_id uuid, tienda_codigo text, cantidad integer, costo_promedio numeric, precio_tienda numeric, updated_at timestamptz, primary key(producto_id,tienda_codigo));
    create table public.venta_items(venta_id uuid,producto_id uuid,unidad_id uuid,costo_tienda_congelado numeric,cantidad integer,estado_costo_tienda text);
    create table public.movimientos(
      id bigint generated always as identity primary key,
      tipo text not null,
      tienda_codigo text, producto_id uuid, unidad_id uuid, cantidad integer,
      costo numeric, precio numeric, referencia_tipo text, referencia_id text,
      reverso_de bigint references public.movimientos(id), usuario uuid, nota text,
      created_at timestamptz default now(), costo_tienda numeric,
      constraint movimientos_tipo_check check(tipo in (
        'compra_entrada','remision_entrada','remision_salida_central',
        'traslado_salida','venta','ajuste_entrada','ajuste_salida','carga_inicial'
      ))
    );
    ${realFreeze}
    create trigger congelar_costo_movimiento_tienda before insert on public.movimientos
      for each row execute function kora_private.congelar_costo_movimiento_tienda();
    insert into public.traslados values('${id(11)}',11,'${state}','SONIVOX','CELFIAO','Nota original');
    insert into public.unidades values('${id(101)}','${id(201)}','en_traslado','SONIVOX',315000,338000);
    insert into public.stock_cantidad values('${id(202)}','SONIVOX',7,7000,10000,now());
    insert into public.traslado_items values
      ('${id(301)}','${id(11)}','${id(201)}','${id(101)}',1,315000,338000),
      ('${id(302)}','${id(11)}','${id(202)}',null,3,7000,10000);
    insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id,usuario)
      values('traslado_salida','SONIVOX','${id(201)}','${id(101)}',1,315000,338000,'traslado','${id(11)}','${id(3)}'),
            ('traslado_salida','SONIVOX','${id(202)}',null,3,7000,10000,'traslado','${id(11)}','${id(3)}');
    ${realRpc}
    revoke all on function public.anular_traslado(uuid,text) from public,anon;
    grant usage on schema public,auth to authenticated;
    grant execute on function public.anular_traslado(uuid,text) to authenticated;
  `);
  const actor = async number => {
    await db.exec('reset role');
    await db.query("select set_config('app.uid',$1,false)", [number ? id(number) : '']);
    await db.exec('set role authenticated');
  };
  const invoke = (motivo = reason) => db.query('select public.anular_traslado($1,$2) result', [id(11), motivo]);
  const read = async sql => { await db.exec('reset role'); return (await db.query(sql)).rows; };
  const snapshot = () => read(`select jsonb_build_object(
    'traslados',(select jsonb_agg(to_jsonb(t) order by id) from public.traslados t),
    'unidades',(select jsonb_agg(to_jsonb(t) order by id) from public.unidades t),
    'stock',(select jsonb_agg(to_jsonb(t) order by producto_id) from public.stock_cantidad t),
    'movimientos',(select jsonb_agg(to_jsonb(t) order by id) from public.movimientos t)
  ) snapshot`);
  const migrate = async () => {
    await db.exec('reset role');
    await db.exec(readFileSync(migrationFile, 'utf8'));
  };
  return { db, actor, invoke, read, snapshot, migrate };
}

test('CHECK anterior reproduce el error real y revierte todo el inventario/documento', async () => {
  const f = await fixture();
  try {
    const before = await f.snapshot();
    await f.actor(1);
    await assert.rejects(f.invoke(), /movimientos_tipo_check/);
    assert.deepEqual(await f.snapshot(), before);
  } finally { await f.db.close(); }
});

test('migración real permite reverso conservando RPC, costos, precios, cantidades y trazabilidad', async () => {
  for (const [state, actor] of [['despachado', 1], ['recibido_pendiente_aprobacion', 2]]) {
    const f = await fixture(state);
    try {
      const beforeFunction = await f.read("select pg_get_functiondef('public.anular_traslado(uuid,text)'::regprocedure) def");
      await f.migrate();
      assert.deepEqual(await f.read("select pg_get_functiondef('public.anular_traslado(uuid,text)'::regprocedure) def"), beforeFunction);
      await f.actor(actor);
      const result = (await f.invoke()).rows[0].result;
      assert.equal(result.ok, true);
      assert.equal(result.consecutivo, 11);
      const [unit] = await f.read('select * from public.unidades');
      assert.equal(unit.estado, 'disponible'); assert.equal(unit.tienda_actual, 'SONIVOX');
      assert.equal(Number(unit.costo_remision), 315000); assert.equal(Number(unit.precio_tienda), 338000);
      const [stock] = await f.read('select * from public.stock_cantidad');
      assert.equal(stock.cantidad, 10); assert.equal(stock.tienda_codigo, 'SONIVOX');
      assert.equal(Number(stock.costo_promedio), 7000); assert.equal(Number(stock.precio_tienda), 10000);
      const [document] = await f.read('select * from public.traslados');
      assert.equal(document.estado, 'anulado');
      assert.equal(document.tienda_destino, 'CELFIAO');
      assert.equal(document.nota, `Nota original | Anulado: ${reason}`);
      const reversals = await f.read("select r.*, m.tipo original_tipo, m.costo original_costo,m.precio original_precio,m.cantidad original_cantidad,m.costo_tienda original_costo_tienda from public.movimientos r join public.movimientos m on m.id=r.reverso_de where r.tipo='reverso' order by r.id");
      assert.equal(reversals.length, 2);
      for (const movement of reversals) {
        assert.equal(movement.original_tipo, 'traslado_salida');
        assert.equal(movement.costo, movement.original_costo);
        assert.equal(movement.precio, movement.original_precio);
        assert.equal(movement.cantidad, movement.original_cantidad);
        assert.equal(movement.costo_tienda, movement.original_costo_tienda);
        assert.equal(movement.usuario, id(actor)); assert.equal(movement.nota, reason);
        assert.equal(movement.referencia_tipo, 'traslado'); assert.equal(movement.referencia_id, id(11));
        assert.equal(movement.tienda_codigo, 'SONIVOX');
      }
      // Misma semántica vigente de valoración: salida + reverso = cero, sin reformularla.
      const [value] = await f.read("select sum(case when tipo='reverso' then costo_tienda*cantidad when tipo='traslado_salida' then -costo_tienda*cantidad else 0 end) balance from public.movimientos");
      assert.equal(Number(value.balance), 0);
      const after = await f.snapshot();
      await f.actor(actor);
      await assert.rejects(f.invoke(), /Solo se puede anular antes del visto bueno final/);
      assert.deepEqual(await f.snapshot(), after, 'segundo intento no duplica inventario ni contramovimientos');
      await assert.rejects(f.db.exec("insert into public.movimientos(tipo) values('tipo_inventado')"), /movimientos_tipo_check/);
      for (const type of ['compra_entrada','remision_entrada','remision_salida_central','traslado_salida','venta','ajuste_entrada','ajuste_salida','carga_inicial','reverso']) {
        await f.db.query('insert into public.movimientos(tipo) values($1)', [type]);
      }
      for (const type of ['traslado_entrada','ajuste','garantia_salida','devolucion_reingreso','reverso_compra_contado']) {
        await assert.rejects(f.db.query('insert into public.movimientos(tipo) values($1)', [type]), /movimientos_tipo_check/);
      }
    } finally { await f.db.close(); }
  }
});

test('tienda, ausencia de sesión, perfil inactivo, cerrado y motivo vacío siguen bloqueados', async () => {
  const f = await fixture();
  try {
    await f.migrate();
    const before = await f.snapshot();
    for (const actor of [3, null, 4]) {
      await f.actor(actor);
      await assert.rejects(f.invoke(), /Solo Gerencia\/Auditoría/);
      assert.deepEqual(await f.snapshot(), before);
    }
    for (const reason of ['', '   ', null]) {
      await f.actor(1);
      await assert.rejects(f.invoke(reason), /motivo de anulación es obligatorio/);
      assert.deepEqual(await f.snapshot(), before);
    }
    await f.db.exec("reset role; update public.traslados set estado='cerrado'");
    const closed = await f.snapshot();
    await f.actor(1);
    await assert.rejects(f.invoke(), /Solo se puede anular antes del visto bueno final/);
    assert.deepEqual(await f.snapshot(), closed);
    await f.db.exec('reset role; set role anon');
    await assert.rejects(f.invoke(), /permission denied/);
  } finally { await f.db.close(); }
});
