import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20260910200436_creditos_cartera_nova_ready.sql', import.meta.url), 'utf8');
const andreaPermission = await readFile(new URL('../../supabase/migrations/20260910204442_cartera_permiso_andrea.sql', import.meta.url), 'utf8');
const manager='00000000-0000-4000-8000-000000000001';
const andrea='00000000-0000-4000-8000-000000000009';
const client='00000000-0000-4000-8000-000000000002';
const sale='00000000-0000-4000-8000-000000000003';
const credit='00000000-0000-4000-8000-000000000004';
const liquidation='00000000-0000-4000-8000-000000000005';
const operation='00000000-0000-4000-8000-000000000006';
const beneficiary='00000000-0000-4000-8000-000000000007';
const order='00000000-0000-4000-8000-000000000008';

async function setup(){
  const db=await PGlite.create();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text);
    create table perfiles(id uuid primary key,nombre text,rol text,activo boolean,tienda_codigo text);
    create function rol_actual() returns text language sql stable as $$select rol from perfiles where id=auth.uid() and activo$$;
    create table origenes(codigo text primary key,nombre text,tipo text,activo boolean);
    create table clientes(id uuid primary key default gen_random_uuid(),cedula text unique,nombre_completo text,celular text,celular_verificado boolean,email text,ciudad text,direccion text,origen_codigo text references origenes,fuente text,autorizacion_datos boolean,autorizacion_comercial boolean,autorizacion_timestamp timestamptz,autorizacion_version text,created_at timestamptz default now(),updated_at timestamptz);
    create table solicitudes(id uuid primary key default gen_random_uuid(),cliente_id uuid references clientes,origen_codigo text,vendedor_nombre text,producto_interes text,financiera text,estado_validacion text);
    create table ventas(id uuid primary key,cliente_id uuid references clientes,tienda_codigo text,fecha date);
    create table creditos(id uuid primary key,venta_id uuid references ventas);
    create table liquidations(id uuid primary key);
    create table liquidation_operations(id uuid primary key,liquidation_id uuid references liquidations,plataforma text,external_id text,operation_at timestamptz,origen_codigo text references origenes,cliente_documento text,cliente_nombre text,monto_credito numeric,monto_base numeric,credito_id uuid references creditos);
    create table payment_orders(id uuid primary key,liquidation_id uuid references liquidations,beneficiary_id uuid,estado text,fecha_pagada timestamptz,updated_at timestamptz default now());
    create table payment_items(id uuid primary key default gen_random_uuid(),payment_order_id uuid references payment_orders,operation_id uuid references liquidation_operations);
    insert into perfiles values('${manager}','Gerencia','gerencia',true,null);
    insert into perfiles values('${andrea}','Andrea Karolina Velez Avilez','admin_tienda',true,'T-1');
    insert into auth.users values('${andrea}','andrea.velez@crediteksas.com');
    insert into origenes values('T-1','Tienda Uno','propia',true);
    insert into clientes(id,cedula,nombre_completo,celular,fuente,autorizacion_datos,autorizacion_comercial,origen_codigo) values('${client}','123456','Cliente Prueba','3001234567','registro_interno',true,false,'T-1');
    insert into ventas values('${sale}','${client}','T-1','2026-09-10');
    insert into creditos values('${credit}','${sale}');
    insert into liquidations values('${liquidation}');
    insert into liquidation_operations values('${operation}','${liquidation}','payjoy','PJ-1','2026-09-10','T-1','123456','Cliente Prueba',500000,500000,'${credit}');
    insert into payment_orders values('${order}','${liquidation}','${beneficiary}','pendiente',null,now());
    insert into payment_items(payment_order_id,operation_id) values('${order}','${operation}');
    select set_config('test.uid','${manager}',false);`);
  await db.exec(migration);
  return db;
}

test('la migración corre, conserva Nova apagada y crea cartera al pagar',async()=>{
  const db=await setup();
  try{
    assert.equal((await db.query('select nova_enforcement_enabled enabled from credit_portfolio_settings')).rows[0].enabled,false);
    await db.query("update payment_orders set estado='pagado',fecha_pagada=now() where id=$1",[order]);
    const row=(await db.query('select external_credit_id,pre_nova,outstanding_amount from credit_portfolio_obligations')).rows[0];
    assert.equal(row.external_credit_id,'PJ-1');assert.equal(row.pre_nova,true);assert.equal(Number(row.outstanding_amount),500000);
  }finally{await db.close();}
});

test('la compuerta solo bloquea cuando Gerencia activa Nova',async()=>{
  const db=await setup();
  try{
    await db.query("select creditos_cartera_configurar_nova(true,'2026-09-10')");
    await assert.rejects(db.query("update payment_orders set estado='programado' where id=$1",[order]),/nova_autorizacion_requerida/);
  }finally{await db.close();}
});

test('Andrea gestiona Cartera completa por capacidad sin cambiar su rol',async()=>{
  const db=await setup();
  try{
    await db.exec(andreaPermission);
    await db.query("select set_config('test.uid',$1,false)",[andrea]);
    const capability=(await db.query("select tiene_capacidad_cartera('read') lectura,tiene_capacidad_cartera('manage') gestion,creditos_cartera_puede_leer('OTRA-TIENDA') lectura_global")).rows[0];
    assert.deepEqual(capability,{lectura:true,gestion:true,lectura_global:true});
    assert.equal((await db.query('select rol from perfiles where id=$1',[andrea])).rows[0].rol,'admin_tienda');
  }finally{await db.close();}
});
