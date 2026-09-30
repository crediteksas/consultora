import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const read = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const request='ef50ea35-cf30-4671-9c3a-e546a8bfa200';
const fix=await read('20260926220635_caja_ajuste_auditado_despues_arqueo.sql');

test('arqueo cerrado: reproduce bloqueo, permite ajuste auditado una vez y conserva cierre/cartera', async () => {
  const db=await PGlite.create();
  const rows=async sql => (await db.query(sql)).rows;
  const cash=async offset => Number((await rows(`select (public.caja_calcular_interno('CK-01',current_date+${offset})->>'esperado')::numeric n`))[0].n);
  try {
    await db.exec(`
      set timezone='America/Bogota';
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.origenes(codigo text primary key,tipo text,activo boolean);
      create table public.perfiles(id uuid primary key,activo boolean,rol text);
      create table public.ventas(tienda_codigo text,fecha date,tipo text,total numeric,anulada boolean,id uuid);
      create table public.creditos(venta_id uuid,cuota_inicial numeric,valor_esperado_financiera numeric);
      create table public.venta_items(venta_id uuid);
      create table public.conceptos_gasto(id uuid,preautorizado boolean);
      create table public.gastos(tienda_codigo text,fecha date,monto numeric,estado text,concepto_id uuid);
      create table public.caja_diaria(id uuid default gen_random_uuid(),tienda_codigo text,fecha date,
        estado text,apertura numeric,efectivo_contado numeric,efectivo_esperado numeric,
        arrastre_movimientos_incorporado numeric default 0);
      create table public.caja_cortes(tienda_codigo text,fecha date,estado text);
      create table public.caja_ciclo_config(id boolean,fecha_inicio date);
      insert into public.caja_ciclo_config values(true,current_date-5);
      create function public.caja_pendiente_interno(text) returns date language sql as $$select null::date$$;
      create table public.movimientos_caja_tienda(id uuid primary key default gen_random_uuid(),
        tienda_codigo text not null,fecha date not null,tipo text not null,monto numeric not null,
        soporte_path text not null,observacion text not null,autorizado_por uuid,creado_por uuid,
        idempotency_key uuid unique,created_at timestamptz default now(),
        constraint movimientos_caja_tienda_tipo_check check(tipo in ('otro_ingreso')));
      create table public.cuenta_corriente(id bigserial primary key,tienda_codigo text,tipo text,
        concepto text,monto numeric,referencia_tipo text,referencia_id text,usuario uuid,nota text);
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create table public.ajustes_auditoria_cartera_b2b(id uuid primary key,cliente_codigo text,
        motivo text,saldo_base numeric,saldo_objetivo numeric,nombre_auditado text,referencia text,fecha_corte date);
      create table public.cuentas_cartera(id uuid,tipo_cuenta text,tienda_codigo text,activo boolean);
      create table public.movimientos_cartera(cuenta_id uuid,efecto text,monto numeric);
      create function public.autorizar_ajuste_auditoria_cartera_b2b(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
      insert into public.origenes values('CK-01','propia',true),('OTHER','propia',true);
      insert into public.perfiles values('${oscar}',true,'gerencia'),('${maite}',true,'auditoria');
      insert into public.cuenta_corriente(tienda_codigo,tipo,monto) values('CK-01','cargo',31000000);
      insert into public.ventas values('CK-01',current_date-1,'contado',850850,false,gen_random_uuid()),
        ('CK-01',current_date,'contado',291000,false,gen_random_uuid());
      insert into public.caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_contado,efectivo_esperado)
        values('CK-01',current_date-1,'cerrada',0,850850,850850),
              ('CK-01',current_date,'cerrada',850850,1141850,1141850);
      insert into public.caja_cortes values('CK-01',current_date,'validada');
    `);
    for (const name of ['20260924162808_saldos_auditados_autorizacion_gerencia.sql',
      '20260924180119_ajustes_gerencia_autoservicio.sql','20260924190232_ajustes_gerencia_revision_doble.sql',
      '20260925150100_caja_arrastre_cierres_incluye_ajustes_auditoria.sql']) await db.exec(await read(name));
    const ciclo=await read('20260920181612_caja_corte_arqueo_apertura.sql');
    await db.exec(ciclo.slice(ciclo.indexOf('create function public.caja_exigir_apertura('),ciclo.indexOf('create trigger caja_ciclo_ventas')));
    for (const table of ['movimientos_caja_tienda','ventas','gastos']) {
      await db.exec(`create trigger caja_ciclo_test before insert or update or delete on public.${table}
        for each row execute function public.caja_guardar_movimiento()`);
    }
    const original=await rows('select * from public.caja_diaria order by fecha');
    const cortes=await rows('select * from public.caja_cortes');
    const debt=await rows('select * from public.cuenta_corriente');
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)',
      [request,'caja_retail','CK-01',1141850,1181850,'Ajuste por saldo inicial de caja confirmado']);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)',[request]),/Solo Oscar/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)',[request]),/arqueo validado/);
    assert.equal(await cash(0),1141850);
    await db.exec(fix);
    assert.equal((await rows('select estado from public.ajustes_gerencia_solicitudes'))[0].estado,'pendiente');

    // No arbitrary adjustment, even by Gerencia without its audited proposal context.
    const insert=`insert into public.movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto,soporte_path,
      observacion,autorizado_por,creado_por,idempotency_key) values($1,$2,$3,$4,null,'Prueba', $5,$5,$6)`;
    const today=(await rows('select current_date::text d'))[0].d;
    await assert.rejects(db.query(insert,['CK-01',today,'ajuste_auditoria_entrada',40000,oscar,request]),/ajuste auditado/);
    const result=(await db.query('select public.decidir_ajuste_gerencia($1,true,null) r',[request])).rows[0].r;
    assert.equal(result.estado,'aplicado');
    assert.equal(await cash(0),1181850);
    assert.equal(await cash(1),1181850);
    assert.deepEqual(await rows('select * from public.caja_diaria order by fecha'),original);
    assert.deepEqual(await rows('select * from public.caja_cortes'),cortes);
    assert.deepEqual(await rows('select * from public.cuenta_corriente'),debt);
    const movement=(await rows('select * from public.movimientos_caja_tienda'))[0];
    assert.equal(Number(movement.monto),40000);
    assert.equal(movement.tipo,'ajuste_auditoria_entrada');
    assert.equal(movement.idempotency_key,request);
    const retry=(await db.query('select public.decidir_ajuste_gerencia($1,true,null) r',[request])).rows[0].r;
    assert.equal(retry.ya_decidido,true);
    assert.equal((await rows('select * from public.movimientos_caja_tienda')).length,1);
    assert.equal((await rows("select * from public.audit_log where accion='ajuste_gerencia_aprobado'")).length,1);

    // Ordinary movements, updates and deletions remain blocked on the closed day.
    for (const sql of [
      "insert into public.movimientos_caja_tienda(tienda_codigo,fecha,tipo,monto,soporte_path,observacion) values('CK-01',current_date,'otro_ingreso',10,'test','test')",
      "insert into public.ventas(tienda_codigo,fecha,tipo,total) values('CK-01',current_date,'contado',10)",
      "insert into public.gastos(tienda_codigo,fecha,monto) values('CK-01',current_date,10)",
      "update public.movimientos_caja_tienda set monto=50000",
      "delete from public.movimientos_caja_tienda"
    ]) await assert.rejects(db.exec(sql),/arqueo validado/);

    // An isolated pending fixture exercises each exception guard without changing real data.
    const fake='ef50ea35-cf30-4671-9c3a-e546a8bfa201';
    await db.exec(`insert into public.saldo_ajustes_auditoria(id,referencia,tienda_codigo,fecha_corte,
      caja_base,caja_objetivo,deuda_base,deuda_objetivo,motivo) values('${fake}','FIXTURE','CK-01',current_date,
      1181850,1221850,31000000,31000000,'Propuesta aislada para probar controles');
      set app.saldo_ajuste_id='${fake}';`);
    const tomorrow=(await rows('select (current_date+1)::text d'))[0].d;
    for (const args of [
      ['OTHER',today,'ajuste_auditoria_entrada',40000,oscar,fake],
      ['CK-01',today,'ajuste_auditoria_entrada',40001,oscar,fake],
      ['CK-01',today,'ajuste_auditoria_salida',40000,oscar,fake],
      ['CK-01',tomorrow,'ajuste_auditoria_entrada',40000,oscar,fake],
      ['CK-01',today,'ajuste_auditoria_entrada',40000,maite,fake],
      ['CK-01',today,'ajuste_auditoria_entrada',40000,oscar,request]
    ]) await assert.rejects(db.query(insert,args),/ajuste auditado/);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    await assert.rejects(db.query(insert,['CK-01',today,'ajuste_auditoria_entrada',40000,maite,fake]),/ajuste auditado/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'; update public.perfiles set activo=false where id='${oscar}'`);
    await assert.rejects(db.query(insert,['CK-01',today,'ajuste_auditoria_entrada',40000,oscar,fake]),/ajuste auditado/);
    assert.equal(await cash(0),1181850);
  } finally { await db.close(); }
});
