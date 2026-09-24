import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260924162808_saldos_auditados_autorizacion_gerencia.sql', import.meta.url), 'utf8');
const selfService = await readFile(new URL('../../supabase/migrations/20260924180119_ajustes_gerencia_autoservicio.sql', import.meta.url), 'utf8');
const oscar = '6de0ad26-64af-4966-8cd9-d468880af627';

test('solo Oscar autoriza ambos ajustes en una transacción, sin venta ni consignación', async () => {
  const db = await PGlite.create();
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
        language sql stable as $$select jsonb_build_object('esperado',1132864+
          coalesce((select sum(case when tipo='ajuste_auditoria_entrada' then monto
            when tipo='ajuste_auditoria_salida' then -monto else 0 end)
            from public.movimientos_caja_tienda where tienda_codigo=p_tienda),0))$$;
      insert into public.origenes values('CK-02','propia',true);
      insert into public.perfiles values('${oscar}',true,'gerencia');
      insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto)
        values('CK-02','cargo','Base anterior',12671188);
    `);
    await db.exec(migration);
    // The B2B type exists in production; a minimal stub lets this test isolate Retail.
    await db.exec(`create table public.ajustes_auditoria_cartera_b2b(id uuid primary key,cliente_codigo text,
      motivo text,saldo_base numeric,saldo_objetivo numeric,nombre_auditado text,referencia text,
      fecha_corte date); create table public.cuentas_cartera(id uuid,tipo_cuenta text,tienda_codigo text,activo boolean);
      create table public.movimientos_cartera(cuenta_id uuid,efecto text,monto numeric);`);
    await db.exec(`create function public.autorizar_ajuste_auditoria_cartera_b2b(p_id uuid)
      returns jsonb language sql as $$select '{}'::jsonb$$;`);
    await db.exec(selfService);
    const id = (await db.query("select id from public.saldo_ajustes_auditoria where referencia='CK02-AUD-20260924'")).rows[0].id;
    await assert.rejects(db.query('select public.autorizar_ajuste_saldos_auditados($1)',[id]),/Solo Oscar/);
    await assert.rejects(db.query(`select public.ajuste_gerencia_retail($1,$2,$3,$4,$5,$6,$7)`,
      ['2a89b269-8d84-47dd-959c-130c50f5cb9b','CK-02',1132864,12671188,1133864,null,
        'Arqueo de Gerencia con diferencia física validada']),/Solo Oscar/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query(`insert into public.movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto,
      observacion,autorizado_por,creado_por,idempotency_key)
      values('CK-02',current_date,'ajuste_auditoria_entrada',1,'Intento directo',$1,$1,$2)`,[oscar,id]),/requiere autorización/);
    const first = await db.query('select public.autorizar_ajuste_saldos_auditados($1) as r',[id]);
    assert.equal(first.rows[0].r.estado,'aplicado');
    assert.equal(first.rows[0].r.ya_aplicado,false);
    const second = await db.query('select public.autorizar_ajuste_saldos_auditados($1) as r',[id]);
    assert.equal(second.rows[0].r.ya_aplicado,true);
    assert.equal(Number((await db.query("select (public.caja_calcular_interno('CK-02',current_date)->>'esperado')::numeric as n")).rows[0].n),1580050);
    assert.equal(Number((await db.query("select sum(case when tipo='cargo' then monto else -monto end) as n from public.cuenta_corriente where tienda_codigo='CK-02'")).rows[0].n),12446088);
    assert.equal((await db.query("select count(*)::int as n from public.movimientos_caja_tienda where tipo='ajuste_auditoria_entrada'")).rows[0].n,1);
    const componentes=(await db.query("select public.caja_componentes_rango('CK-02',current_date,current_date) as v")).rows[0].v;
    assert.equal(Number(componentes.ajustes_auditoria),447186);
    assert.equal(Number(componentes.otros_ingresos),0);
    assert.equal((await db.query("select count(*)::int as n from public.audit_log where accion='saldos_auditados_autorizados'")).rows[0].n,1);
    const request='2a89b269-8d84-47dd-959c-130c50f5cb9b';
    const args=[request,'CK-02',1580050,12446088,1581050,null,'Arqueo de Gerencia con diferencia física validada'];
    const generic=await db.query(`select public.ajuste_gerencia_retail($1,$2,$3,$4,$5,$6,$7) as r`,args);
    assert.equal(generic.rows[0].r.estado,'aplicado');
    assert.equal(Number(generic.rows[0].r.caja),1581050);
    const retry=await db.query(`select public.ajuste_gerencia_retail($1,$2,$3,$4,$5,$6,$7) as r`,args);
    assert.equal(retry.rows[0].r.ya_aplicado,true);
    await assert.rejects(db.query(`select public.ajuste_gerencia_retail($1,$2,$3,$4,$5,$6,$7)`,
      ['7e274684-ab83-4ca8-b9eb-32e74712a765','CK-02',1580050,12446088,1582050,null,
        'Otro arqueo de Gerencia con diferencia validada']),/saldos cambiaron/);
  } finally { await db.close(); }
});
