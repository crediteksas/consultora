import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/20261002202045_estimar_accesorios_tolu_por_valor.sql', import.meta.url), 'utf8');

test('estima accesorios de Tolú sin falsear el histórico ni tocar otras metas', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create function public.rol_actual() returns text language sql as $$select 'gerencia'::text$$;
      create function public.es_central() returns boolean language sql as $$select true$$;
      create table public.origenes(codigo text,tipo text,activo boolean);
      insert into public.origenes values('CK-01','propia',true),('CK-03','propia',true);
      create table public.historico_mensual(
        tienda_codigo text,anio integer,mes integer,venta_total numeric,cred_uds integer,
        cel_uds integer,acc_uds integer,acc_venta numeric
      );
      insert into public.historico_mensual values
        ('CK-01',2025,1,0,0,0,2698,53453000),
        ('CK-01',2025,10,0,0,0,0,3366000),
        ('CK-03',2025,10,0,0,0,326,5447000);
      create table public.historico_importado(
        tienda_codigo text,fecha date,venta_total numeric,creditos numeric,
        equipos_contado_cantidad numeric,accesorios_cantidad numeric,accesorios_venta numeric
      );
      create table public.ventas(tienda_codigo text,fecha date,total numeric,anulada boolean);
      create table public.presupuestos(
        id integer generated always as identity primary key,tienda_codigo text,fecha date,
        meta_uds_acc numeric,meta_venta_total numeric,generado_desde text
      );
      insert into public.presupuestos(tienda_codigo,fecha,meta_uds_acc,meta_venta_total,generado_desde)
      select 'CK-01',d::date,0,100,'manual:anterior'
      from generate_series(date '2026-10-01',date '2026-10-31',interval '1 day') d;
      insert into public.presupuestos(tienda_codigo,fecha,meta_uds_acc,meta_venta_total,generado_desde)
      values('CK-03','2026-10-01',77,500,'manual:otra_tienda');
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    `);
    await db.exec(sql);
    const target = (await db.query(`select count(*)::integer dias,sum(meta_uds_acc) unidades,
      min(meta_uds_acc) minimo,max(meta_uds_acc) maximo,sum(meta_venta_total) ventas
      from public.presupuestos where tienda_codigo='CK-01'`)).rows[0];
    assert.equal(target.dias, 31);
    assert.equal(Number(target.unidades), 213);
    assert(Number(target.maximo) - Number(target.minimo) <= 1);
    assert.equal(Number(target.ventas), 3100);
    assert.equal(Number((await db.query("select meta_uds_acc from public.presupuestos where tienda_codigo='CK-03'")).rows[0].meta_uds_acc), 77);
    const proposal = (await db.query("select * from public.proponer_presupuesto_manual('CK-01','2026-10-01','meta_uds_acc',25)")).rows;
    assert.equal(proposal.reduce((n,r) => n + Number(r.base_anterior), 0), 170);
    assert.equal(proposal.reduce((n,r) => n + Number(r.meta_propuesta), 0), 213);
    assert.match(proposal[0].fuente, /estimación por valor/);
    const historical = (await db.query("select acc_uds from public.historico_mensual where tienda_codigo='CK-01' and mes=10")).rows[0];
    assert.equal(historical.acc_uds, 0);
    assert.equal((await db.query('select count(*)::integer n from public.audit_log')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
