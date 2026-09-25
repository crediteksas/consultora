import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration=await readFile(new URL('../../supabase/migrations/20260925161938_banco_abonos_proveedores_final.sql',import.meta.url),'utf8');
const page=await readFile(new URL('../../creditek/erp/banco-creditek.html',import.meta.url),'utf8');
const app=await readFile(new URL('../../creditek/erp/banco-creditek.js',import.meta.url),'utf8');
const treasury=await readFile(new URL('../../creditek/erp/aliados-tesoreria.html',import.meta.url),'utf8');
const guard=await readFile(new URL('../../creditek/erp/kora-access-control.js',import.meta.url),'utf8');
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const supplier='21c4d945-2cc2-44ab-8ebd-029d19417642';
const first='a151d606-1929-4115-b30b-f3ccf1601b7e';
const second='89039af3-472d-461d-85af-c153a1a23e6b';
const request='c6d305b8-1d9c-4897-9ce2-029f93418bc5';

test('Banco está en Administración y la autorización de proveedor en Tesorería; no se elige factura',()=>{
  assert.match(page,/Banco Creditek/);
  assert.match(page,/sin escoger factura/);
  assert.doesNotMatch(app,/supplier_invoice_id|factura_id.*select/);
  assert.match(treasury,/supplierBankApprovalSection/);
  assert.match(guard,/normalized === 'banco-creditek\.html'/);
  assert.match(migration,/order by fecha,created_at,id for update/);
  assert.match(migration,/banco_creditek_registrar_giro_proveedor/);
});

test('Maite solicita, Óscar autoriza y solo el giro comprobado descuenta Banco y aplica FIFO',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`
      create role anon;create role authenticated;
      create schema auth;
      create schema kora_private;
      create schema storage;
      create table storage.objects(bucket_id text,name text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.perfiles(id uuid primary key,activo boolean,rol text);
      create table public.proveedores(id uuid primary key,nombre text,activo boolean);
      create table public.facturas_proveedor(id uuid primary key,proveedor_id uuid references public.proveedores(id),
        numero text,fecha date,created_at timestamptz default now(),saldo numeric);
      create table public.pagos_proveedor(id uuid primary key default gen_random_uuid(),
        factura_id uuid,proveedor_id uuid,monto numeric,fecha date,metodo text,referencia text,
        soporte_path text,nota text,idempotency_key uuid unique);
      create table public.audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
      create table kora_private.cuenta_recaudo_creditek(id boolean,titular text,numero_cuenta text,
        banco text,tipo_cuenta text,activa boolean);
      create function public.registrar_pago_proveedor(p_factura_id uuid,p_monto numeric,p_fecha date,
        p_metodo text,p_referencia text,p_soporte_path text,p_nota text,p_idempotency_key uuid)
      returns jsonb language plpgsql as $$
      declare v_pago uuid;v_proveedor uuid;v_saldo numeric;
      begin
        select id into v_pago from public.pagos_proveedor where idempotency_key=p_idempotency_key;
        if found then return jsonb_build_object('reutilizado',true,'pago_id',v_pago);end if;
        select proveedor_id,saldo into v_proveedor,v_saldo from public.facturas_proveedor
          where id=p_factura_id for update;
        if p_monto>v_saldo then raise exception 'Sobrepago';end if;
        insert into public.pagos_proveedor(factura_id,proveedor_id,monto,fecha,metodo,referencia,
          soporte_path,nota,idempotency_key)
          values(p_factura_id,v_proveedor,p_monto,p_fecha,p_metodo,p_referencia,p_soporte_path,p_nota,p_idempotency_key)
          returning id into v_pago;
        update public.facturas_proveedor set saldo=saldo-p_monto where id=p_factura_id;
        return jsonb_build_object('reutilizado',false,'pago_id',v_pago);
      end$$;
      create function public.registrar_pago_proveedor_desde_saldo_b2b(
        uuid,uuid,numeric,date,text,text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
      insert into public.perfiles values('${maite}',true,'auditoria'),('${oscar}',true,'gerencia');
      insert into kora_private.cuenta_recaudo_creditek values(true,'Creditek S.A.S.',
        '87600004006','Bancolombia','Ahorros',true);
      insert into public.proveedores values('${supplier}','Proveedor de prueba',true);
      insert into public.facturas_proveedor(id,proveedor_id,numero,fecha,saldo) values
        ('${first}','${supplier}','F-ANTIGUA','2026-08-01',100),
        ('${second}','${supplier}','F-SIGUIENTE','2026-09-01',200);
    `);
    await db.exec(migration);
    const account=(await db.query('select numero_cuenta,saldo_actual from public.banco_creditek_cuentas')).rows[0];
    assert.equal(account.numero_cuenta,'87600004006');
    assert.equal(account.saldo_actual,null);

    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await assert.rejects(db.query('select public.banco_creditek_solicitar_pago_proveedor($1,$2,150,$3)',
      [request,supplier,'Abono a proveedor']),/Solo Maite/);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    await db.query('select public.banco_creditek_solicitar_pago_proveedor($1,$2,150,$3)',
      [request,supplier,'Abono a proveedor']);
    const prepared=(await db.query('select * from public.banco_creditek_pagos_proveedor where id=$1',[request])).rows[0];
    assert.equal(prepared.estado,'pendiente');
    await assert.rejects(db.query('select public.banco_creditek_solicitar_pago_proveedor($1,$2,350,$3)',
      ['5888bad5-bb71-4a13-842c-bf5339f390c6',supplier,'Solicitud excesiva']),/supera la deuda/);
    await assert.rejects(db.query('select public.banco_creditek_decidir_pago_proveedor($1,true,null)',[request]),/Solo Óscar/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await db.query('select public.banco_creditek_decidir_pago_proveedor($1,true,null)',[request]);
    const authorized=(await db.query('select * from public.banco_creditek_pagos_proveedor where id=$1',[request])).rows[0];
    assert.equal(authorized.estado,'autorizado');
    assert.equal((await db.query('select count(*)::int n from public.pagos_proveedor')).rows[0].n,0);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    await assert.rejects(db.query('select public.banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',
      [request,'2026-09-25','BANCO-TEST','aliados/tesoreria/soporte.pdf']),/comprobante bancario no existe/);
    await db.exec(`insert into storage.objects values('soportes','aliados/tesoreria/soporte.pdf')`);
    await assert.rejects(db.query('select public.banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',
      [request,'2026-09-25','BANCO-TEST','aliados/tesoreria/soporte.pdf']),/sincroniza el saldo/);
    await db.exec(`set request.jwt.claim.sub='${oscar}'`);
    await db.query('select public.banco_creditek_sincronizar_saldo(500,$1,$2)',
      ['2026-09-24','Saldo inicial auditado']);
    await db.exec(`set request.jwt.claim.sub='${maite}'`);
    await db.query('select public.banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',
      [request,'2026-09-25','BANCO-TEST','aliados/tesoreria/soporte.pdf']);
    const paid=(await db.query('select * from public.banco_creditek_pagos_proveedor where id=$1',[request])).rows[0];
    assert.equal(paid.estado,'pagado');
    assert.equal(Number(paid.saldo_banco_despues),350);
    const allocations=(await db.query('select factura_id,monto,orden from public.banco_creditek_aplicaciones_proveedor order by orden')).rows;
    assert.deepEqual(allocations.map(x=>[x.factura_id,Number(x.monto),x.orden]),[[first,100,1],[second,50,2]]);
    const invoices=(await db.query('select id,saldo from public.facturas_proveedor order by fecha')).rows;
    assert.deepEqual(invoices.map(x=>Number(x.saldo)),[0,150]);
    await db.query('select public.banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',
      [request,'2026-09-25','BANCO-TEST','aliados/tesoreria/soporte.pdf']);
    const retried=(await db.query('select * from public.banco_creditek_pagos_proveedor where id=$1',[request])).rows[0];
    assert.equal(retried.estado,'pagado');
    assert.equal((await db.query('select count(*)::int n from public.banco_creditek_movimientos')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.pagos_proveedor')).rows[0].n,2);
    await assert.rejects(db.query('select public.banco_creditek_registrar_giro_proveedor($1,$2,$3,$4)',
      [request,'2026-09-25','OTRA-REF','aliados/tesoreria/soporte.pdf']),/otra evidencia/);
  }finally{await db.close()}
});
