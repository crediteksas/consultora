import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../../supabase/migrations/20261005161602_retail_cierre_utilidad_por_corte.sql', import.meta.url), 'utf8');
const oscar = '6de0ad26-64af-4966-8cd9-d468880af627';
const maite = 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const tienda = '00000000-0000-0000-0000-000000000003';
const corte1 = '00000000-0000-0000-0000-000000000101';
const corte2 = '00000000-0000-0000-0000-000000000102';

test('la pantalla normal usa cortes con hora y no ofrece cerrar el día completo', () => {
  const html = readFileSync(new URL('../../creditek/erp/cierre-periodo.html', import.meta.url), 'utf8');
  assert.match(html, /initCierrePorCorte\(\)/);
  assert.match(html, /Cerrar utilidad del corte/);
  assert.match(html, /p_accion:'cerrar',p_corte_id:v\.corte_id,p_huella:v\.huella/);
  assert.match(html, /if \(sesionParam\) \{[\s\S]*?initModoBloques\(sesionParam\)/);
});

test('cierre por corte separa la venta de las 08:53 de la de las 08:55 y exige aprobación del conteo y cierre de Gerencia', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth; create schema inventario_control;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.perfiles(id uuid primary key, rol text, activo boolean);
      insert into public.perfiles values('${oscar}','gerencia',true),('${maite}','auditoria',true),('${tienda}','admin_tienda',true);
      create function public.es_central() returns boolean language sql as $$ select true $$;
      create table public.origenes(codigo text primary key,nombre text,tipo text,activo boolean,inventario_control_desde timestamptz,inventario_control_activo boolean);
      insert into public.origenes values('CK-01','Celfiao Tolú','propia',true,'2026-09-04 05:00+00',true);
      create table inventario_control.cortes(id uuid primary key,tienda_codigo text,tienda_nombre text,corte_at timestamptz,estado text,autorizado_at timestamptz,base_conteo text,revision_fuente jsonb);
      create table inventario_control.lineas(corte_id uuid,cantidad_fisica integer,costo_tienda numeric,valor_ajuste numeric);
      create table public.ventas(id uuid primary key,tienda_codigo text,created_at timestamptz,fecha date,total numeric,anulada boolean);
      create table public.venta_items(venta_id uuid,costo_tienda_congelado numeric,cantidad integer);
      create table public.gastos(tienda_codigo text,fecha date,created_at timestamptz,monto numeric,estado text);
      create table public.periodos(tienda_codigo text,fecha_inicio date,fecha_fin date);
      create table public.creditos(venta_id uuid,valor_real_financiera numeric,valor_esperado_financiera numeric,estado_conciliacion text,conciliado_at timestamptz);
      create function public.cerrar_periodo(p_tienda_codigo text,p_fecha_inicio date,p_fecha_fin date)
        returns jsonb language plpgsql security definer as $$ begin
          if not es_central() then raise exception 'Sin permiso'; end if;
          return '{}'::jsonb;
        end $$;
      insert into inventario_control.cortes values
        ('${corte1}','CK-01','Celfiao Tolú','2026-10-05 13:54:37+00','pendiente',null,'corte_fijo',null),
        ('${corte2}','CK-01','Celfiao Tolú','2026-10-06 13:54:37+00','aplicado','2026-10-06 14:00+00','corte_fijo',null);
      insert into inventario_control.lineas values('${corte1}',9,50,-50),('${corte1}',1,10,10),('${corte2}',7,50,0);
      insert into public.ventas values
        ('00000000-0000-0000-0000-000000000201','CK-01','2026-10-05 13:53+00','2026-10-05',1000,false),
        ('00000000-0000-0000-0000-000000000202','CK-01','2026-10-05 13:55+00','2026-10-05',2000,false);
      insert into public.venta_items values
        ('00000000-0000-0000-0000-000000000201',600,1),
        ('00000000-0000-0000-0000-000000000202',1000,1);
      insert into public.gastos values
        ('CK-01','2026-09-04','2026-09-14 16:59+00',100,'aprobado'),
        ('CK-01','2026-10-05','2026-10-05 14:10+00',75,'aprobado'),
        ('CK-01','2026-10-05','2026-10-05 14:12+00',20,'pendiente');
      grant usage on schema public,inventario_control to authenticated;
    `);
    await db.exec(migration);
    await db.exec(`create table inventario_control.no_conformes(
      tienda_codigo text,corte_id uuid,estado text,cantidad integer,costo_tienda numeric,autorizado_at timestamptz);
      insert into inventario_control.no_conformes values
        ('CK-01',null,'separado_pendiente_destino',1,15,'2026-10-05 13:00+00'),
        ('CK-01','${corte1}','separado_pendiente_destino',1,25,'2026-10-05 15:00+00'),
        ('CK-01',null,'separado_pendiente_destino',1,12,'2026-10-05 14:10+00');`);
    const as = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    };
    const call = async (action, cut, fingerprint = null) =>
      (await db.query('select public.cierre_utilidad_retail($1,$2,$3) r', [action, cut, fingerprint])).rows[0].r;

    await as(tienda);
    await assert.rejects(call('listar', null), /Solo Gestión o Gerencia/);
    await as(maite);
    let preview = await call('vista', corte1);
    assert.equal(preview.listo, false);
    assert.match(preview.bloqueos.join(' '), /aprueben el conteo/);
    await assert.rejects(call('cerrar', corte1, preview.huella), /Solo Gerencia/);

    await db.exec('reset role');
    await db.exec(`update inventario_control.cortes set estado='aplicado',autorizado_at='2026-10-05 15:00+00' where id='${corte1}'`);
    await as(maite);
    const auditPreview = await call('vista', corte1);
    await assert.rejects(call(null, corte1, auditPreview.huella), /Acción de cierre no reconocida/);
    await as(oscar);
    preview = await call('vista', corte1);
    assert.equal(preview.listo, true);
    assert.equal(Number(preview.ventas_totales), 1000);
    assert.equal(Number(preview.costo_vendido), 600);
    assert.equal(Number(preview.gastos_totales), 100);
    assert.equal(Number(preview.perdidas_ajustes), 65);
    assert.equal(Number(preview.gastos_inventario_no_monetarios), 40);
    assert.equal(Number(preview.ganancias_ajustes), 10);
    assert.equal(Number(preview.utilidad_neta), 245);
    await assert.rejects(call('cerrar', corte1, 'vieja'), /cambió desde la vista previa/);
    const closed = await call('cerrar', corte1, preview.huella);
    assert.equal(closed.cerrado, true);
    assert.equal((await call('cerrar', corte1, preview.huella)).cierre_id, closed.cierre_id);
    const next = await call('vista', corte2);
    assert.equal(next.inicio_at, preview.fin_at);
    assert.equal(Number(next.ventas_totales), 2000);
    assert.equal(Number(next.costo_vendido), 1000);
    assert.equal(Number(next.gastos_totales), 75);
    assert.equal(Number(next.gastos_inventario_no_monetarios), 12);
    assert.equal(Number(next.perdidas_ajustes), 12);
    assert.equal(next.listo, false);
    assert.match(next.bloqueos.join(' '), /gastos pendientes/);
    await assert.rejects(db.query("select public.cerrar_periodo('CK-01','2026-09-04','2026-10-05')"), /corte físico aprobado/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from inventario_control.cierres_utilidad')).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
