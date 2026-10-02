import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../../supabase/migrations/20261002185106_presupuestos_sin_meta_utilidad.sql', import.meta.url), 'utf8');
const gerente = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('la migración conserva historia, retira metas de utilidad y permite solo cuatro indicadores Retail', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema presupuestos_control_private;
      grant usage on schema auth,presupuestos_control_private to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table perfiles(id uuid primary key, rol text, activo boolean);
      insert into perfiles values('${gerente}','gerencia',true);
      create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create table presupuestos(tienda_codigo text,fecha date,meta_utilidad numeric,
        primary key(tienda_codigo,fecha));
      insert into presupuestos values('CK-01','2026-09-01',999);
      create table b2b_presupuestos(
        mes date primary key, meta_ventas numeric not null, meta_utilidad_neta numeric not null,
        meta_unidades integer, notas text not null default '', revision integer not null default 1,
        creado_por uuid, creado_at timestamptz default now(), actualizado_por uuid, actualizado_at timestamptz default now());
      create function public.rol_actual() returns text language sql stable as $$
        select rol from public.perfiles where id=auth.uid() $$;
      create function public.es_central() returns boolean language sql stable as $$ select true $$;
      create function public.proponer_presupuesto_manual(text,date,text,numeric)
        returns table(fecha date,base_anterior numeric,meta_propuesta numeric,fuente text)
        language sql as $$ select date '2026-10-01',1::numeric,2::numeric,'prueba'::text $$;
      create function public.guardar_presupuesto_manual(text,date,text,numeric)
        returns jsonb language sql as $$ select jsonb_build_object('metrica',$3) $$;
      create function public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric)
        returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function presupuestos_control_private.guardar_b2b(date,numeric,numeric,numeric,text,integer)
        returns jsonb language sql as $$ select '{}'::jsonb $$;
      create function public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer)
        returns jsonb language sql as $$ select '{}'::jsonb $$;
      revoke all on function public.proponer_presupuesto_manual(text,date,text,numeric),
        public.guardar_presupuesto_manual(text,date,text,numeric),
        public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric),
        presupuestos_control_private.guardar_b2b(date,numeric,numeric,numeric,text,integer),
        public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer) from public;
      grant execute on function public.proponer_presupuesto_manual(text,date,text,numeric),
        public.guardar_presupuesto_manual(text,date,text,numeric),
        public.guardar_presupuesto_manual_general(text,date,numeric,numeric,numeric,numeric,numeric),
        presupuestos_control_private.guardar_b2b(date,numeric,numeric,numeric,text,integer),
        public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer) to authenticated;
      insert into b2b_presupuestos(mes,meta_ventas,meta_utilidad_neta,notas,revision,creado_por,actualizado_por)
      values('2026-09-01',100,23,'Histórica',1,'${gerente}','${gerente}');
      select set_config('request.jwt.claim.sub','${gerente}',false);
    `);
    await db.exec(sql);
    const privileges = await db.query(`select
      has_function_privilege('authenticated','public.guardar_presupuesto_manual(text,date,text,numeric)','execute') old_retail,
      has_function_privilege('authenticated','public.guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer)','execute') old_b2b,
      has_function_privilege('authenticated','public.guardar_presupuesto_operativo_general(text,date,numeric,numeric,numeric,numeric)','execute') new_retail`);
    assert.deepEqual(privileges.rows[0], { old_retail: false, old_b2b: false, new_retail: true });
    await db.exec('set role authenticated');
    await assert.rejects(db.query(`select * from proponer_presupuesto_operativo('CK-01','2026-10-01','meta_utilidad',25)`), /La utilidad es un resultado/);
    const retail = await db.query(`select guardar_presupuesto_operativo_general('CK-01','2026-10-01',20,25,20,25) as r`);
    assert.equal(retail.rows[0].r.indicadores.length, 4);
    const b2b = await db.query(`select guardar_presupuesto_b2b_operativo('2026-10-01',1000,10,'Nueva meta',0) as r`);
    assert.equal(b2b.rows[0].r.meta_utilidad_neta, null);
    await db.exec('reset role');
    const historic = await db.query(`select meta_utilidad_neta from b2b_presupuestos where mes='2026-09-01'`);
    assert.equal(Number(historic.rows[0].meta_utilidad_neta), 23);
    await assert.rejects(db.exec(`insert into presupuestos values('CK-01','2026-10-01',500)`), /La utilidad no se presupuesta/);
    await assert.rejects(db.exec(`update presupuestos set meta_utilidad=1000 where fecha='2026-09-01'`), /La utilidad no se presupuesta/);
    assert.equal(Number((await db.query(`select meta_utilidad from presupuestos where fecha='2026-09-01'`)).rows[0].meta_utilidad), 999);
  } finally {
    await db.close();
  }
});
