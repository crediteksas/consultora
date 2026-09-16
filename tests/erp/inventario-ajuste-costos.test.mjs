import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260916160714_inventario_ajuste_costos_maite_oscar.sql', import.meta.url),
  'utf8',
);
const oscar = '6de0ad26-64af-4966-8cd9-d468880af627';
const maite = 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const other = '00000000-0000-0000-0000-000000000003';
const product = 'a26d7168-c70f-4453-92b7-6c7368275918';
let db;

before(async () => {
  db = await PGlite.create();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean default true);
    insert into public.perfiles values
      ('${oscar}','Oscar','gerencia',true),
      ('${maite}','Maite','auditoria',true),
      ('${other}','Otro auditor','auditoria',true);
    create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean default true);
    insert into public.origenes values('CK-02','Movishopping','propia',true);
    create table public.productos(id uuid primary key,codigo text,nombre text,tipo text);
    insert into public.productos values('${product}','4GE0024','P. SILICONE ORIGINAL','cantidad');
    create table public.stock_cantidad(
      producto_id uuid,tienda_codigo text,cantidad integer,precio_tienda numeric,
      costo_promedio numeric,updated_at timestamptz,primary key(producto_id,tienda_codigo)
    );
    insert into public.stock_cantidad values('${product}','CK-02',590,6200,6200,now());
    create table public.unidades(
      id uuid primary key default gen_random_uuid(),producto_id uuid,imei text,estado text,
      tienda_actual text,precio_tienda numeric,costo_remision numeric
    );
    create table public.audit_log(
      id bigint generated always as identity primary key,usuario uuid,accion text,tabla text,
      registro_id uuid,detalle jsonb,created_at timestamptz default now()
    );
    grant usage on schema public,auth to authenticated;
  `);
  await db.exec(migration);
});

after(async () => db?.close());

async function asUser(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}

async function adjust({ user = maite, storeCost = 6400, internalCost = 6350, unit = null } = {}) {
  await asUser(user);
  return db.query(
    'select public.inventario_ajustar_costo($1,$2,$3,$4,$5,$6) result',
    ['CK-02', product, storeCost, internalCost, 'Corrección validada por factura', unit],
  );
}

test('la corrección solicitada deja P. SILICONE ORIGINAL en $6.300 sin cambiar cantidad', async () => {
  await db.exec('reset role');
  const row = (await db.query('select * from stock_cantidad where producto_id=$1', [product])).rows[0];
  assert.equal(Number(row.precio_tienda), 6300);
  assert.equal(Number(row.costo_promedio), 6300);
  assert.equal(row.cantidad, 590);
  const audit = (await db.query("select detalle from audit_log where accion='inventario_costo_ajustado' order by id limit 1")).rows[0].detalle;
  assert.equal(audit.cantidades_modificadas, false);
  assert.equal(audit.ventas_historicas_modificadas, false);
});

test('Maite y Oscar pueden ajustar costos vigentes con motivo y auditoría', async () => {
  await adjust();
  await adjust({ user: oscar, storeCost: 6450, internalCost: 6400 });
  await db.exec('reset role');
  const row = (await db.query('select * from stock_cantidad where producto_id=$1', [product])).rows[0];
  assert.equal(Number(row.precio_tienda), 6450);
  assert.equal(Number(row.costo_promedio), 6400);
  assert.equal(row.cantidad, 590);
  assert.equal((await db.query("select count(*)::int n from audit_log where accion='inventario_costo_ajustado'")).rows[0].n, 3);
});

test('otro auditor no puede modificar costos y los datos quedan intactos', async () => {
  await assert.rejects(adjust({ user: other, storeCost: 1, internalCost: 1 }), /Solo Maite u Oscar/);
  await db.exec('reset role');
  const row = (await db.query('select * from stock_cantidad where producto_id=$1', [product])).rows[0];
  assert.equal(Number(row.precio_tienda), 6450);
  assert.equal(Number(row.costo_promedio), 6400);
});

test('una unidad disponible se ajusta individualmente y una vendida se rechaza', async () => {
  await db.exec('reset role');
  const available = (await db.query(
    "insert into unidades(producto_id,imei,estado,tienda_actual,precio_tienda,costo_remision) values($1,'111','disponible','CK-02',100,80) returning id",
    [product],
  )).rows[0].id;
  await adjust({ unit: available, storeCost: 110, internalCost: 90 });
  await db.exec('reset role');
  const unit = (await db.query('select * from unidades where id=$1', [available])).rows[0];
  assert.equal(Number(unit.precio_tienda), 110);
  assert.equal(Number(unit.costo_remision), 90);
  await db.query("update unidades set estado='vendido' where id=$1", [available]);
  await assert.rejects(adjust({ user: oscar, unit: available }), /unidad vendida/);
});

test('la función no contiene escrituras sobre ventas, caja o cantidades', () => {
  assert.doesNotMatch(migration, /update public\.(?:ventas|venta_items|caja|movimientos)/i);
  assert.doesNotMatch(migration, /set\s+cantidad\s*=/i);
  assert.match(migration, /ventas_historicas_modificadas', false/);
  assert.match(migration, /cantidades_modificadas', false/);
});
