import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const tiendaUser='00000000-0000-4000-8000-000000000001';
const otraTiendaUser='00000000-0000-4000-8000-000000000002';

test('gastos usa apertura y movimientos de caja, reserva pendientes y no duplica al aprobar', async () => {
  const db=await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create table public.perfiles(id uuid primary key,activo boolean,rol text,tienda_codigo text);
      insert into public.perfiles values
        ('${tiendaUser}',true,'admin_tienda','CK-02'),
        ('${otraTiendaUser}',true,'admin_tienda','CK-04');
      create table public.gastos(id uuid primary key,tienda_codigo text,fecha date,estado text,monto numeric);
      create table public.caja_base(tienda_codigo text primary key,monto numeric not null);
      insert into public.caja_base values('CK-02',100000),('CK-04',200000);
      create function public.caja_calcular_interno(p_tienda text,p_fecha date)
      returns jsonb language sql stable as $$
        select jsonb_build_object(
          'esperado',b.monto-coalesce((select sum(g.monto) from public.gastos g
            where g.tienda_codigo=p_tienda and g.fecha=p_fecha and g.estado='aprobado'),0),
          'gastos_efectivo',coalesce((select sum(g.monto) from public.gastos g
            where g.tienda_codigo=p_tienda and g.fecha=p_fecha and g.estado='aprobado'),0),
          'contado_ventas',0)
        from public.caja_base b where b.tienda_codigo=p_tienda
      $$;
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20260925152146_gastos_validar_efectivo_real_caja.sql',import.meta.url),'utf8'));
    await db.exec('grant usage on schema auth to authenticated; grant select,insert,update on public.gastos to authenticated; set role authenticated;');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[tiendaUser]);
    const fecha='2026-09-25';
    const saldo=async tienda=>(await db.query('select public.saldo_gastos_tienda($1,$2) as saldo',[tienda,fecha])).rows[0].saldo;
    const agregar=(id,monto,estado='registrado',tienda='CK-02')=>db.query(
      'insert into public.gastos values($1,$2,$3,$4,$5)',[id,tienda,fecha,estado,monto]);

    assert.equal((await saldo('CK-02')).disponible,100000);
    await agregar('00000000-0000-4000-8000-000000000011',50000);
    assert.equal((await saldo('CK-02')).disponible,50000);
    await assert.rejects(agregar('00000000-0000-4000-8000-000000000012',50001),/efectivo disponible/);
    await db.query("update public.gastos set estado='aprobado' where id='00000000-0000-4000-8000-000000000011'");
    assert.equal((await saldo('CK-02')).disponible,50000);
    await agregar('00000000-0000-4000-8000-000000000013',50000);
    assert.equal((await saldo('CK-02')).disponible,0);
    await assert.rejects(saldo('CK-04'),/No autorizado/);
    await db.query("update public.gastos set estado='rechazado' where id='00000000-0000-4000-8000-000000000013'");
    assert.equal((await saldo('CK-02')).disponible,50000);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otraTiendaUser]);
    assert.equal((await saldo('CK-04')).disponible,200000);
  } finally {
    await db.close();
  }
});
