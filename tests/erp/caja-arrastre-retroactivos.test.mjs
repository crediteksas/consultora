import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL aislado: se ejecutan las funciones PL/pgSQL reales, sin conexión
// a Supabase ni datos bancarios. Los UUID son exclusivamente de prueba.
const migrationPath = new URL('../../supabase/migrations/20260906191354_caja_arrastre_movimientos_retroactivos.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');
const html = await readFile(new URL('../../creditek/erp/caja.html', import.meta.url), 'utf8');
const gerente = '00000000-0000-4000-8000-000000000001';
const admin = '00000000-0000-4000-8000-000000000002';
let db;

const calcular = async (fecha = '2026-09-06', tienda = 'TEST-A') =>
  (await db.query('select public.calcular_efectivo_esperado_tienda($1,$2) as c', [tienda, fecha])).rows[0].c;
const cerrar = async (fecha, valor, key = randomUUID(), tienda = 'TEST-A') =>
  (await db.query('select public.cerrar_caja_piloto($1,$2,$3,$4) as c', [tienda, fecha, valor, key])).rows[0].c;
const movimiento = async (tipo, monto, fecha = '2026-09-03', tienda = 'TEST-A', createdAt = '2026-09-06T17:45:00Z') => {
  await db.query(`insert into public.movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto,created_at)
    values($1,$2,$3,$4,$5)`, [tienda, fecha, tipo, monto, createdAt]);
};

async function seed() {
  await db.exec(`
    reset role;
    truncate public.movimientos_caja_tienda, public.caja_diaria, public.ventas, public.creditos, public.gastos, public.conceptos_gasto, public.perfiles;
    insert into public.perfiles values
      ('${gerente}','gerencia',null,true), ('${admin}','admin_tienda','TEST-A',true);
    select set_config('request.jwt.claim.sub','${gerente}',false);
    insert into public.caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_esperado,efectivo_contado,diferencia,cerrada_at)
    values
      ('TEST-A','2026-09-02','cerrada',0,1556000,1556000,0,'2026-09-02T23:03:00Z'),
      ('TEST-A','2026-09-03','cerrada',1556000,1737150,1737150,0,'2026-09-03T23:04:00Z'),
      ('TEST-A','2026-09-04','cerrada',1737150,3653150,3653150,0,'2026-09-04T23:08:00Z'),
      ('TEST-A','2026-09-05','cerrada',3653150,4490900,4490900,0,'2026-09-05T23:15:00Z'),
      ('TEST-A','2026-09-06','cerrada',4490900,5202900,5202900,0,'2026-09-06T18:04:00Z'),
      ('TEST-B','2026-09-05','cerrada',0,80000,80000,0,'2026-09-05T23:15:00Z');
    insert into public.ventas(tienda_codigo,fecha,tipo,total,anulada) values
      ('TEST-A','2026-09-03','contado',181150,false),
      ('TEST-A','2026-09-06','contado',712000,false);
  `);
  await movimiento('consignacion', 1000000);
  await movimiento('consignacion', 500000);
}

before(async () => {
  db = await PGlite.create();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.perfiles(id uuid primary key,rol text,tienda_codigo text,activo boolean);
    create table public.caja_diaria(
      id uuid primary key default gen_random_uuid(), tienda_codigo text, fecha date,
      estado text default 'abierta', apertura numeric default 0,
      contado_ventas numeric default 0, financiado_ventas numeric default 0,
      iniciales numeric default 0, otros_ingresos numeric default 0,
      gastos_efectivo numeric default 0, salidas_explicitas numeric default 0,
      efectivo_esperado numeric, efectivo_contado numeric, diferencia numeric,
      cerrada_por uuid, cerrada_at timestamptz, nota text, cierre_idempotency_key uuid unique,
      unique(tienda_codigo,fecha)
    );
    create table public.movimientos_caja_tienda(
      id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,
      tipo text,monto numeric,created_at timestamptz default now()
    );
    create table public.ventas(id uuid primary key default gen_random_uuid(),tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean);
    create table public.creditos(venta_id uuid,valor_esperado_financiera numeric,cuota_inicial numeric);
    create table public.conceptos_gasto(id uuid primary key,preautorizado boolean);
    create table public.gastos(tienda_codigo text,fecha date,monto numeric,concepto_id uuid,estado text);
  `);
  await db.exec(await readFile(new URL('../../creditek/erp/migrations/20260727_corrige_efectivo_credito_pendiente.sql', import.meta.url), 'utf8'));
  await seed();
  assert.equal((await calcular()).esperado, 5202900, 'reproduce el defecto antes del parche');
  await db.exec(migration);
});
beforeEach(seed);
after(async () => db?.close());

test('abonos retroactivos: 5.202.900 pasa a 3.702.900 sin reescribir cierres ni movimientos', async () => {
  const antes = (await db.query('select jsonb_agg(to_jsonb(c) order by fecha,tienda_codigo) as datos from caja_diaria c')).rows[0].datos;
  for (let i = 0; i < 3; i++) {
    const c = await calcular();
    assert.equal(c.apertura_cierre_anterior, 4490900);
    assert.equal(c.ajuste_arrastre_movimientos, -1500000);
    assert.equal(c.apertura, 2990900);
    assert.equal(c.esperado, 3702900);
    assert.equal(c.caja.efectivo_contado, 5202900, 'el cierre histórico es inmutable');
  }
  const despues = (await db.query('select jsonb_agg(to_jsonb(c) order by fecha,tienda_codigo) as datos from caja_diaria c')).rows[0].datos;
  assert.deepEqual(despues, antes);
  assert.equal((await db.query('select count(*)::int as n from movimientos_caja_tienda')).rows[0].n, 2);
});

test('la fecha original muestra la salida en el día, no duplicada en la apertura', async () => {
  const c = await calcular('2026-09-03');
  assert.equal(c.ajuste_arrastre_movimientos, 0);
  assert.equal(c.salidas_explicitas, 1500000);
  assert.equal(c.esperado, 237150);
});

test('el siguiente día conserva el descuento aunque el último cierre legado fuera posterior a la validación', async () => {
  assert.equal((await calcular('2026-09-07')).esperado, 3702900);
});

test('dos nuevos cierres incorporan el arrastre una sola vez y conservan idempotencia', async () => {
  const key = randomUUID();
  const primero = await cerrar('2026-09-07', 3702900, key);
  assert.deepEqual(await cerrar('2026-09-07', 3702900, key), primero);
  const c = await calcular('2026-09-08');
  assert.equal(c.esperado, 3702900);
  assert.equal(c.ajuste_arrastre_movimientos, 0);
  assert.equal(c.arrastre_movimientos_total, -1500000);
  await cerrar('2026-09-08', 3702900);
  assert.equal((await calcular('2026-09-09')).esperado, 3702900);
  await assert.rejects(cerrar('2026-09-07', 3702900), /ya está cerrada/);
});

test('un segundo abono tardío solo incorpora su diferencia después de un cierre corregido', async () => {
  await cerrar('2026-09-07', 3702900);
  await movimiento('consignacion', 200000, '2026-09-04');
  const c = await calcular('2026-09-08');
  assert.equal(c.ajuste_arrastre_movimientos, -200000);
  assert.equal(c.esperado, 3502900);
  await cerrar('2026-09-08', 3502900);
  assert.equal((await calcular('2026-09-09')).esperado, 3502900);
});

test('los movimientos del propio día no se mezclan con el ajuste de días anteriores', async () => {
  await movimiento('retiro', 100000, '2026-09-07');
  const c = await calcular('2026-09-07');
  assert.equal(c.salidas_explicitas, 100000);
  assert.equal(c.ajuste_arrastre_movimientos, -1500000);
  assert.equal(c.esperado, 3602900);
  await cerrar('2026-09-07', 3602900);
  assert.equal((await calcular('2026-09-08')).esperado, 3602900);
});

test('una entrada tardía suma y se conserva después del siguiente cierre', async () => {
  await movimiento('otro_ingreso', 250000, '2026-09-04');
  assert.equal((await calcular()).esperado, 3952900);
  await cerrar('2026-09-07', 3952900);
  assert.equal((await calcular('2026-09-08')).esperado, 3952900);
});

test('el cálculo no depende del timestamp de creación ni inventa una validación faltante', async () => {
  await movimiento('consignacion', 200000, '2026-09-04', 'TEST-A', '2026-09-01T00:00:00Z');
  assert.equal((await calcular()).esperado, 3502900);
  // Cartera o un comprobante sin movimiento de efectivo no intervienen en este RPC.
  assert.doesNotMatch(migration, /(?:from|insert into|update)\s+public\.(?:abonos|cuenta_corriente|comprobantes_consignacion)\b/i);
});

test('las tiendas y fechas quedan aisladas; no afecta a cajas sin diferencias', async () => {
  assert.equal((await calcular('2026-09-06', 'TEST-B')).esperado, 80000);
  await movimiento('consignacion', 7000, '2026-09-05', 'TEST-B');
  assert.equal((await calcular('2026-09-06', 'TEST-B')).esperado, 73000);
  assert.equal((await calcular()).esperado, 3702900);
  await movimiento('consignacion', 99000, '2026-09-10');
  assert.equal((await calcular()).esperado, 3702900);
});

test('movimientos ya incluidos al cerrar no generan un segundo descuento', async () => {
  await db.exec("update caja_diaria set salidas_explicitas=1500000 where tienda_codigo='TEST-A' and fecha='2026-09-03'");
  assert.equal((await calcular()).ajuste_arrastre_movimientos, 0);
});

test('el cierre rechaza diferencias y no permite ocultar el ajuste con una nota', async () => {
  await assert.rejects(cerrar('2026-09-07', 5202900), /diferencia de caja/);
  assert.equal((await db.query("select count(*)::int as n from caja_diaria where fecha='2026-09-07'")).rows[0].n, 0);
});

test('la autorización permanece por rol, tienda y perfil activo', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  assert.equal((await calcular()).esperado, 3702900);
  await assert.rejects(calcular('2026-09-06', 'TEST-B'), /No autorizado/);
  await assert.rejects(cerrar('2026-09-07', 80000, randomUUID(), 'TEST-B'), /No autorizado/);
  await db.query('update perfiles set activo=false where id=$1', [admin]);
  await assert.rejects(calcular(), /No autorizado/);
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(calcular(), /No autorizado/);
  const grants = (await db.query(`select
    has_function_privilege('anon','public.calcular_efectivo_esperado_tienda(text,date)','execute') as anon,
    has_function_privilege('authenticated','public.calcular_efectivo_esperado_tienda(text,date)','execute') as authenticated`)).rows[0];
  assert.equal(grants.anon, false);
  assert.equal(grants.authenticated, true);
});

test('precisión decimal: sin redondear ni descartar diferencias pequeñas', async () => {
  await movimiento('consignacion', '0.01');
  assert.equal((await calcular()).esperado, 3702899.99);
  await cerrar('2026-09-07', 3702899.99);
  assert.equal((await calcular('2026-09-08')).esperado, 3702899.99);
});

test('la migración es repetible sin reiniciar el arrastre ya incorporado', async () => {
  await cerrar('2026-09-07', 3702900);
  await db.exec(migration);
  assert.equal((await calcular('2026-09-08')).esperado, 3702900);
  assert.equal((await calcular('2026-09-08')).ajuste_arrastre_movimientos, 0);
});

test('Caja distingue apertura ajustada y registro original sin recalcular dos veces en navegador', () => {
  assert.match(html, /Ajuste por movimientos de días anteriores/);
  assert.match(html, /Registro del cierre original/);
  assert.match(html, /Number\(cuadre\.ajuste_arrastre_movimientos \|\| 0\)/);
  assert.match(html, /aperturaCierreAnterior/);
  assert.doesNotMatch(html, /esperado\s*[-+]\s*c\.ajusteArrastre/);
});
