import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrations = await Promise.all([
  '20260924162808_saldos_auditados_autorizacion_gerencia.sql',
  '20260924180119_ajustes_gerencia_autoservicio.sql',
  '20260924190232_ajustes_gerencia_revision_doble.sql',
  '20260926203211_cartera_ajuste_preserva_caja_negativa.sql',
].map(name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')));
const oscar = '6de0ad26-64af-4966-8cd9-d468880af627';
const maite = 'd1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const request = 'ef50ea35-cf30-4671-9c3a-e546a8bfa100';

test('cartera con caja negativa: reproduce el bloqueo y corrige sin mover caja ni duplicar cartera', async () => {
  const db = await PGlite.create();
  const scalar = async sql => Number((await db.query(sql)).rows[0].n);
  const balance = () => scalar("select sum(case when tipo='cargo' then monto else -monto end) n from public.cuenta_corriente");
  const cash = () => scalar("select (public.caja_calcular_interno('CK-06',current_date)->>'esperado')::numeric n");
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.origenes(codigo text primary key,tipo text,activo boolean);
      create table public.perfiles(id uuid primary key,activo boolean,rol text);
      create table public.ventas(tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean,id uuid);
      create table public.creditos(venta_id uuid,cuota_inicial numeric,valor_esperado_financiera numeric);
      create table public.conceptos_gasto(id uuid,preautorizado boolean);
      create table public.gastos(tienda_codigo text,fecha date,monto numeric,estado text,concepto_id uuid);
      create table public.caja_diaria(tienda_codigo text,fecha date,efectivo_contado numeric);
      create table public.movimientos_caja_tienda(id uuid primary key default gen_random_uuid(),
        tienda_codigo text not null,fecha date not null,tipo text not null,monto numeric not null,
        soporte_path text not null,observacion text not null,autorizado_por uuid,creado_por uuid,
        idempotency_key uuid unique,created_at timestamptz default now(),
        constraint movimientos_caja_tienda_tipo_check check(tipo in ('abono','otro_ingreso',
          'transferencia_central','pago_directo_central','retiro','consignacion','devolucion_efectivo')));
      create table public.cuenta_corriente(id bigserial primary key,tienda_codigo text,tipo text,
        concepto text,monto numeric,referencia_tipo text,referencia_id text,usuario uuid,nota text);
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create function public.caja_calcular_interno(p_tienda text,p_fecha date) returns jsonb
        language sql stable as $$select jsonb_build_object('esperado',-2017400+
          coalesce((select sum(case when tipo='ajuste_auditoria_entrada' then monto
            when tipo='ajuste_auditoria_salida' then -monto else 0 end)
            from public.movimientos_caja_tienda where tienda_codigo=p_tienda),0))$$;
      insert into public.origenes values('CK-06','propia',true);
      insert into public.perfiles values('${oscar}',true,'gerencia'),('${maite}',true,'auditoria');
      insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto)
        values('CK-06','cargo','Base de prueba aislada',25431488);
      create table public.ajustes_auditoria_cartera_b2b(id uuid primary key,cliente_codigo text,
        motivo text,saldo_base numeric,saldo_objetivo numeric,nombre_auditado text,referencia text,fecha_corte date);
      create table public.cuentas_cartera(id uuid,tipo_cuenta text,tienda_codigo text,activo boolean);
      create table public.movimientos_cartera(cuenta_id uuid,efecto text,monto numeric);
      create function public.autorizar_ajuste_auditoria_cartera_b2b(p_id uuid)
        returns jsonb language sql as $$select '{}'::jsonb$$;
    `);
    for (const sql of migrations.slice(0, 3)) await db.exec(sql);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    const args = [request,'cartera_retail','CK-06',25431488,21356300,'ajuste real de la deuda'];
    await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)', args);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)', [request]), /Solo Oscar/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)', [request]), /saldo_ajustes_auditoria_caja_objetivo_check/);
    assert.equal(await balance(), 25431488);
    assert.equal(await cash(), -2017400);
    assert.equal(await scalar('select count(*) n from public.saldo_ajustes_auditoria'), 0);

    await db.exec(migrations[3]);
    // DDL fixes the rule, never applies the pending financial proposal itself.
    assert.equal((await db.query('select estado from public.ajustes_gerencia_solicitudes where id=$1',[request])).rows[0].estado,'pendiente');
    assert.equal(await balance(),25431488);
    const result = (await db.query('select public.decidir_ajuste_gerencia($1,true,null) r',[request])).rows[0].r;
    assert.equal(result.estado,'aplicado');
    assert.equal(await balance(),21356300);
    assert.equal(await cash(),-2017400);
    assert.equal(await scalar('select count(*) n from public.movimientos_caja_tienda'),0);
    const snapshot = (await db.query('select * from public.saldo_ajustes_auditoria where id=$1',[request])).rows[0];
    assert.equal(Number(snapshot.caja_base),-2017400);
    assert.equal(Number(snapshot.caja_objetivo),-2017400);
    assert.equal(snapshot.movimiento_caja_id,null);
    assert.ok(snapshot.movimiento_cartera_id);
    const entry = (await db.query("select tipo,monto from public.cuenta_corriente where referencia_id=$1",[request])).rows[0];
    assert.equal(entry.tipo,'abono');
    assert.equal(Number(entry.monto),4075188);
    const retry = (await db.query('select public.decidir_ajuste_gerencia($1,true,null) r',[request])).rows[0].r;
    assert.equal(retry.ya_decidido,true);
    assert.equal(await scalar('select count(*) n from public.cuenta_corriente'),2);
    assert.equal(await scalar("select count(*) n from public.audit_log where accion='ajuste_gerencia_aprobado'"),1);

    // Negative targets remain forbidden, both through the RPC and directly.
    await assert.rejects(db.query('select public.ajuste_gerencia_retail(gen_random_uuid(),$1,$2,$3,$4,$5,$6)',
      ['CK-06',-2017400,21356300,-1,null,'Intento de nuevo saldo negativo de caja']), /no pueden ser negativos/);
    await assert.rejects(db.query(`insert into public.saldo_ajustes_auditoria(referencia,tienda_codigo,fecha_corte,
      caja_base,deuda_base,caja_objetivo,deuda_objetivo,motivo) values('NEG-TEST','CK-06',current_date,
      -2017400,21356300,-1,21000000,'Intento de nuevo saldo negativo de caja')`), /caja_objetivo_check/);
    await assert.rejects(db.query(`insert into public.saldo_ajustes_auditoria(referencia,tienda_codigo,fecha_corte,
      caja_base,deuda_base,caja_objetivo,deuda_objetivo,motivo) values('NOOP-TEST','CK-06',current_date,
      -2017400,21356300,-2017400,21356300,'Propuesta sin cambio de ningun saldo')`), /caja_objetivo_check/);

    // Stale debt must still block authorization and preserve the pending case.
    const stale='ef50ea35-cf30-4671-9c3a-e546a8bfa101';
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)',
      [stale,'cartera_retail','CK-06',21356300,21000000,'Segunda propuesta de cartera para probar saldo']);
    await db.exec("insert into public.cuenta_corriente(tienda_codigo,tipo,monto,referencia_tipo) values('CK-06','cargo',1000,'remision')");
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)',[stale]),/saldo cambió/);
    assert.equal((await db.query('select estado from public.ajustes_gerencia_solicitudes where id=$1',[stale])).rows[0].estado,'pendiente');
    assert.equal(await scalar('select count(*) n from public.movimientos_caja_tienda'),0);
  } finally { await db.close(); }
});
