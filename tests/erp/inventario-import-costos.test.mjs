import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const original = readFileSync(new URL('20260901234416_kora_2026_000048_importacion_inventario_inicial.sql', migrations), 'utf8');
const initialCosts = readFileSync(new URL('20260914223020_corregir_costos_carga_inicial_tiendas.sql', migrations), 'utf8');
const signature = 'public.inventario_importar_inicial_excel(text,jsonb,text)';
const manager = '00000000-0000-0000-0000-000000000001';
const adviser = '00000000-0000-0000-0000-000000000002';
const existingProduct = '00000000-0000-0000-0000-000000000003';
let db;
let functionBefore;

async function functionMetadata() {
  return (await db.query(`
    select oid, proowner::regrole::text as owner, proacl::text as acl,
           prosecdef as security_definer, proconfig as settings
    from pg_proc where oid = $1::regprocedure
  `, [signature])).rows[0];
}

async function importRows(rows, store = 'CK-01') {
  return (await db.query(
    'select public.inventario_importar_inicial_excel($1,$2::jsonb,$3) as result',
    [store, JSON.stringify(rows), 'Regresión de costos de inventario inicial'],
  )).rows[0].result;
}

function quantityRow(overrides = {}) {
  return {
    producto_codigo: 'ACC-NUEVO', producto_nombre: 'Cable nuevo', categoria: 'ACC CELULAR',
    tipo: 'cantidad', imei: '', cantidad: 4, costo: 200, precio: 500,
    observacion: 'Costo distinto del precio comercial', ...overrides,
  };
}

before(async () => {
  db = await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema kora_private;
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.perfiles(id uuid primary key,activo boolean,rol text);
    insert into public.perfiles values('${manager}',true,'gerencia'),('${adviser}',true,'asesor');
    create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean,aliases jsonb default '[]');
    insert into public.origenes(codigo,nombre,tipo,activo) values
      ('CK-01','Tolú','propia',true),('CK-02','Otra tienda','propia',true),('CENTRAL','Central','central',true);
    create table public.productos(
      id uuid primary key default gen_random_uuid(),codigo text unique,nombre text,categoria text,
      tipo text,precio_guia numeric,activo boolean
    );
    insert into public.productos values('${existingProduct}','ACC-EXISTENTE','Cable existente','ACC_CELULAR','cantidad',1600,true);
    create table public.stock_cantidad(
      producto_id uuid,tienda_codigo text,cantidad integer,costo_promedio numeric,precio_tienda numeric,
      updated_at timestamptz default now(),primary key(producto_id,tienda_codigo)
    );
    insert into public.stock_cantidad(producto_id,tienda_codigo,cantidad,costo_promedio,precio_tienda) values
      ('${existingProduct}','CK-01',2,700,900),('${existingProduct}','CK-02',6,600,800);
    create table public.unidades(
      id uuid primary key default gen_random_uuid(),producto_id uuid,imei text unique,estado text,
      tienda_actual text,costo_remision numeric,precio_tienda numeric
    );
    create table public.movimientos(
      id bigint generated always as identity primary key,tipo text,tienda_codigo text,producto_id uuid,
      unidad_id uuid,cantidad integer,costo numeric,precio numeric,costo_tienda numeric,
      referencia_tipo text,referencia_id text,usuario uuid,nota text
    );
  `);
  await db.exec(original);
  // Preserve the production restriction that retired application imports.
  await db.exec(`revoke execute on function ${signature} from public,anon,authenticated,service_role;`);
  functionBefore = await functionMetadata();
  await db.exec(initialCosts.slice(initialCosts.indexOf('create or replace function kora_private.costo_inicial_movimiento()')));
  const candidates = readdirSync(migrations).filter(name => name.endsWith('_separar_costos_precios_importacion_inicial.sql'));
  assert.equal(candidates.length, 1, 'Debe existir una migración para separar costo y precio del importador');
  await db.exec(readFileSync(new URL(candidates[0], migrations), 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager]);
});

after(async () => db?.close());

test('la corrección conserva identidad, permisos y configuración de la función retirada', async () => {
  assert.deepEqual(await functionMetadata(), functionBefore);
  assert.equal(functionBefore.security_definer, true);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const access = (await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed', [role, signature])).rows[0];
    assert.equal(access.allowed, false, `${role} no debe recuperar acceso al importador`);
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(importRows([quantityRow()]), /permission denied for function inventario_importar_inicial_excel/);
    } finally {
      await db.exec('reset role');
    }
  }
});

test('importa costo Retail e interno, preservando precio guía, precio del movimiento y promedio ponderado', async () => {
  const otherBefore = (await db.query("select * from stock_cantidad where tienda_codigo='CK-02'")).rows;
  const rows = [
    quantityRow(),
    quantityRow({ producto_codigo: 'ACC-EXISTENTE', producto_nombre: 'Cable existente', cantidad: 3, costo: 1000, precio: 1800 }),
    quantityRow({ producto_codigo: 'CEL-NUEVO', producto_nombre: 'Equipo nuevo', categoria: 'CELULAR', tipo: 'serializado', imei: '358680811376158', cantidad: 1, costo: 740000, precio: 860000 }),
  ];
  const result = await importRows(rows);
  assert.equal(result.ok, true);
  assert.equal(result.filas, 3);
  assert.equal(result.cantidad, 8);
  assert.equal(result.productos_creados, 2);
  assert.match(result.referencia_id, /^[0-9a-f-]{36}$/);

  const stock = (await db.query(`
    select p.codigo,s.cantidad,s.costo_promedio,s.precio_tienda,p.precio_guia
    from stock_cantidad s join productos p on p.id=s.producto_id where s.tienda_codigo='CK-01' order by p.codigo
  `)).rows.map(row => ({ ...row, costo_promedio: Number(row.costo_promedio), precio_tienda: Number(row.precio_tienda), precio_guia: Number(row.precio_guia) }));
  assert.deepEqual(stock, [
    { codigo: 'ACC-EXISTENTE', cantidad: 5, costo_promedio: 880, precio_tienda: 960, precio_guia: 1600 },
    { codigo: 'ACC-NUEVO', cantidad: 4, costo_promedio: 200, precio_tienda: 200, precio_guia: 500 },
  ]);
  const unit = (await db.query(`
    select u.imei,u.estado,u.tienda_actual,u.costo_remision,u.precio_tienda,p.precio_guia
    from unidades u join productos p on p.id=u.producto_id
  `)).rows[0];
  assert.deepEqual({ ...unit, costo_remision: Number(unit.costo_remision), precio_tienda: Number(unit.precio_tienda), precio_guia: Number(unit.precio_guia) }, {
    imei: '358680811376158', estado: 'disponible', tienda_actual: 'CK-01', costo_remision: 740000, precio_tienda: 740000, precio_guia: 860000,
  });
  assert.deepEqual((await db.query("select * from stock_cantidad where tienda_codigo='CK-02'")).rows, otherBefore);

  const movements = (await db.query(`
    select p.codigo,m.* from movimientos m join productos p on p.id=m.producto_id order by m.id
  `)).rows;
  assert.equal(movements.length, 3);
  for (const [index, movement] of movements.entries()) {
    assert.equal(movement.codigo, rows[index].producto_codigo);
    assert.equal(movement.tipo, 'carga_inicial');
    assert.equal(movement.tienda_codigo, 'CK-01');
    assert.equal(movement.cantidad, rows[index].cantidad);
    assert.equal(Number(movement.costo), rows[index].costo);
    assert.equal(Number(movement.costo_tienda), rows[index].costo);
    assert.equal(Number(movement.precio), rows[index].precio);
    assert.equal(movement.referencia_tipo, 'importacion_excel');
    assert.equal(movement.referencia_id, result.referencia_id);
    assert.equal(movement.usuario, manager);
    assert.equal(movement.unidad_id !== null, rows[index].tipo === 'serializado');
  }
});

test('una fila inválida revierte todo el lote y se mantienen las validaciones de perfil y tienda', async () => {
  const countBefore = (await db.query('select count(*)::int as n from movimientos')).rows[0].n;
  const pending = quantityRow({ producto_codigo: 'ACC-REVERTIDO', producto_nombre: 'No debe persistir' });
  await assert.rejects(importRows([pending, quantityRow({ producto_codigo: 'ACC-INVALIDO', cantidad: 0 })]), /Cantidad, costo o precio inválido/);
  assert.equal((await db.query("select count(*)::int as n from productos where codigo in ('ACC-REVERTIDO','ACC-INVALIDO')")).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from movimientos')).rows[0].n, countBefore);
  await assert.rejects(importRows([pending], 'CENTRAL'), /Bodega Central no está soportada/);
  await assert.rejects(importRows([pending], 'NO-EXISTE'), /tienda indicada no existe/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [adviser]);
  try {
    await assert.rejects(importRows([pending]), /Solo gerencia o auditoria/);
  } finally {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager]);
  }
});
