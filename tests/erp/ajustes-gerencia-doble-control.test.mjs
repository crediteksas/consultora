import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration=await readFile(new URL('../../supabase/migrations/20260924190232_ajustes_gerencia_revision_doble.sql',import.meta.url),'utf8');
const page=await readFile(new URL('../../creditek/erp/ajustes-gerencia.html',import.meta.url),'utf8');
const app=await readFile(new URL('../../creditek/erp/ajustes-gerencia.js',import.meta.url),'utf8');
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';

test('Ajustes de Gerencia está centralizado y distingue preparación de autorización',()=>{
  assert.match(page,/Caja Retail/);
  assert.match(page,/Cartera de tienda Retail/);
  assert.match(page,/Cartera de cliente B2B/);
  assert.match(app,/preparar_ajuste_gerencia/);
  assert.match(app,/decidir_ajuste_gerencia/);
  assert.doesNotMatch(app,/sb\.rpc\('ajuste_gerencia_retail'/);
});

test('Maite prepara sin mover cartera; Oscar autoriza una vez y puede rechazar',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.perfiles(id uuid primary key,activo boolean,rol text);
      create table public.origenes(codigo text primary key,tipo text,activo boolean);
      create table public.cuenta_corriente(tienda_codigo text,tipo text,monto numeric);
      create table public.cuentas_cartera(id uuid primary key,tienda_codigo text,tipo_cuenta text,activo boolean);
      create table public.movimientos_cartera(cuenta_id uuid,efecto text,monto numeric);
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create function public.caja_calcular_interno(p_tienda text,p_hoy date) returns jsonb
        language sql as $$select jsonb_build_object('esperado',1000)$$;
      create function public.ajuste_gerencia_retail(
        p_request_id uuid,p_tienda_codigo text,p_caja_actual numeric,p_deuda_actual numeric,
        p_caja_objetivo numeric,p_deuda_objetivo numeric,p_motivo text)
      returns jsonb language plpgsql as $$begin
        if p_deuda_objetivo is not null then
          insert into public.cuenta_corriente values(p_tienda_codigo,
            case when p_deuda_objetivo>p_deuda_actual then 'cargo' else 'abono' end,
            abs(p_deuda_objetivo-p_deuda_actual));
        end if;
        return jsonb_build_object('estado','aplicado');
      end$$;
      create function public.ajuste_gerencia_b2b(
        p_request_id uuid,p_cliente_codigo text,p_saldo_actual numeric,p_saldo_objetivo numeric,p_motivo text)
      returns jsonb language plpgsql as $$begin
        insert into public.movimientos_cartera values(
          '7f981755-ec1e-4482-8ee6-8b844e638c63',
          case when p_saldo_objetivo>p_saldo_actual then 'debito' else 'credito' end,
          abs(p_saldo_objetivo-p_saldo_actual));
        return jsonb_build_object('estado','aplicado');
      end$$;
      insert into public.perfiles values('${maite}',true,'auditoria'),('${oscar}',true,'gerencia');
      insert into public.origenes values('CK-02','propia',true),('CK-13','cliente_b2b',true);
      insert into public.cuenta_corriente values('CK-02','cargo',100000);
      insert into public.cuentas_cartera values('7f981755-ec1e-4482-8ee6-8b844e638c63','CK-13','cliente_b2b',true);
      insert into public.movimientos_cartera values('7f981755-ec1e-4482-8ee6-8b844e638c63','debito',500000);
    `);
    await db.exec(migration);
    const args=['b3908c2f-fd45-4773-9512-7975ae18158d','cartera_retail','CK-02',100000,200000,
      'Auditoría física de cartera revisada por Maite'];
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)',args),/Solo Maite/);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    const prepared=(await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6) as r',args)).rows[0].r;
    assert.equal(prepared.estado,'pendiente');
    assert.equal(Number((await db.query("select sum(case when tipo='cargo' then monto else -monto end) saldo from public.cuenta_corriente")).rows[0].saldo),100000);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)',[args[0]]),/Solo Oscar/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    const approved=(await db.query('select public.decidir_ajuste_gerencia($1,true,null) as r',[args[0]])).rows[0].r;
    assert.equal(approved.estado,'aplicado');
    assert.equal(Number((await db.query("select sum(case when tipo='cargo' then monto else -monto end) saldo from public.cuenta_corriente")).rows[0].saldo),200000);
    const retry=(await db.query('select public.decidir_ajuste_gerencia($1,true,null) as r',[args[0]])).rows[0].r;
    assert.equal(retry.ya_decidido,true);
    assert.equal((await db.query('select count(*)::int n from public.cuenta_corriente')).rows[0].n,2);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    const rejectId='3e2c563c-f322-42e8-8e5b-59dd9b6cda5e';
    await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)',
      [rejectId,'cartera_retail','CK-02',200000,190000,'Auditoría nueva de cartera para revisión gerencial']);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    const rejected=(await db.query('select public.decidir_ajuste_gerencia($1,false,$2) as r',
      [rejectId,'No corresponde al arqueo'])).rows[0].r;
    assert.equal(rejected.estado,'rechazado');
    assert.equal(Number((await db.query("select sum(case when tipo='cargo' then monto else -monto end) saldo from public.cuenta_corriente")).rows[0].saldo),200000);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    const staleId='f491da1b-3992-4212-9c0e-73be558d6d14';
    await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)',
      [staleId,'cartera_retail','CK-02',200000,250000,'Arqueo de cartera que requiere validación posterior']);
    await db.exec("insert into public.cuenta_corriente values('CK-02','cargo',1000)");
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query('select public.decidir_ajuste_gerencia($1,true,null)',[staleId]),/saldo cambió/);
    assert.equal((await db.query('select estado from public.ajustes_gerencia_solicitudes where id=$1',[staleId])).rows[0].estado,'pendiente');
    assert.equal(Number((await db.query("select sum(case when tipo='cargo' then monto else -monto end) saldo from public.cuenta_corriente")).rows[0].saldo),201000);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    const b2bId='a68ff795-6f5c-407e-89d4-763a88bbb7ba';
    await db.query('select public.preparar_ajuste_gerencia($1,$2,$3,$4,$5,$6)',
      [b2bId,'cartera_b2b','CK-13',500000,600000,'Arqueo del cliente B2B validado por Gestión']);
    assert.equal(Number((await db.query('select sum(monto) as saldo from public.movimientos_cartera')).rows[0].saldo),500000);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    const b2b=(await db.query('select public.decidir_ajuste_gerencia($1,true,null) as r',[b2bId])).rows[0].r;
    assert.equal(b2b.estado,'aplicado');
    assert.equal(Number((await db.query('select sum(monto) as saldo from public.movimientos_cartera')).rows[0].saldo),600000);
  }finally{await db.close()}
});
