import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260923214541_bloquear_gasto_tienda_sobre_efectivo_diario.sql', import.meta.url), 'utf8');
const html = await readFile(new URL('../../creditek/erp/gastos.html', import.meta.url), 'utf8');

test('un gasto no supera el efectivo disponible de su tienda y día', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create function public.es_central() returns boolean language sql as $$ select true $$;
      create function public.tienda_actual() returns text language sql as $$ select 'CK-01'::text $$;
      create table public.ventas(tienda_codigo text, fecha date, tipo text, total numeric, anulada boolean default false);
      create table public.gastos(id uuid primary key, tienda_codigo text, fecha date, estado text, monto numeric);
    `);
    await db.exec(migration);
    const date = '2026-09-23';
    const put = (id, store, amount, status = 'registrado') => db.query(
      'insert into public.gastos(id,tienda_codigo,fecha,estado,monto) values($1,$2,$3,$4,$5)',
      [id, store, date, status, amount],
    );
    await assert.rejects(put('00000000-0000-0000-0000-000000000001', 'CK-01', 1), /efectivo disponible/);
    await db.query("insert into public.ventas values('CK-01',$1,'contado',50,false)", [date]);
    await db.query("insert into public.ventas values('CK-01',$1,'credito',500,false)", [date]);
    await db.query("insert into public.ventas values('CK-01',$1,'contado',500,true)", [date]);
    await db.query("insert into public.ventas values('CK-02',$1,'contado',500,false)", [date]);
    await assert.rejects(put('00000000-0000-0000-0000-000000000002', 'CK-01', 100), /gasto solicitado 100/);
    await put('00000000-0000-0000-0000-000000000003', 'CK-01', 30);
    await put('00000000-0000-0000-0000-000000000004', 'CK-01', 20);
    await assert.rejects(put('00000000-0000-0000-0000-000000000005', 'CK-01', 1), /disponible 0/);
    const balance = await db.query("select public.saldo_gastos_tienda('CK-01',$1) as saldo", [date]);
    assert.deepEqual(balance.rows[0].saldo, { ventas_contado: 50, gastos_registrados: 50, disponible: 0 });
    await db.query("update public.gastos set estado='rechazado' where id='00000000-0000-0000-0000-000000000004'");
    await assert.rejects(db.query("update public.gastos set monto=51 where id='00000000-0000-0000-0000-000000000003'"), /efectivo disponible/);
    await put('00000000-0000-0000-0000-000000000006', 'CK-02', 100);
    await put('00000000-0000-0000-0000-000000000007', 'CENTRAL', 1000);
    await db.exec('grant select on public.ventas to authenticated; grant select, insert on public.gastos to authenticated; set role authenticated;');
    const saldoAutenticado = await db.query("select public.saldo_gastos_tienda('CK-01',$1) as saldo", [date]);
    assert.equal(saldoAutenticado.rows[0].saldo.disponible, 20);
    await assert.rejects(put('00000000-0000-0000-0000-000000000008', 'CK-01', 21), /efectivo disponible/);
  } finally {
    await db.close();
  }
});

test('la pantalla consulta el saldo antes de enviar el gasto', () => {
  assert.match(html, /sb\.rpc\('saldo_gastos_tienda'/);
  assert.match(html, /monto > Number\(saldo\.disponible\)/);
  assert.match(html, /ventas de contado .*gastos del día .*disponible/);
});
