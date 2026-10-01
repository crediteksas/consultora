import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const sql=await readFile(new URL('../../supabase/migrations/20261001202848_proveedores_ajustes_y_retenciones.sql',import.meta.url),'utf8');
const maite='d1782db6-bacc-4caf-af6f-ce1b8d1c0391';
const oscar='6de0ad26-64af-4966-8cd9-d468880af627';
const otro='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const motivo='Saldo neto auditado al inicio de operaciones; no es pago ni compra';
async function fixture(){
  const db=await PGlite.create();
  await db.exec(`
    create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table perfiles(id uuid primary key,activo boolean,rol text);
    insert into perfiles values('${maite}',true,'auditoria'),('${oscar}',true,'gerencia'),('${otro}',true,'gerencia');
    grant select on perfiles to authenticated;
    create table proveedores(id uuid primary key default gen_random_uuid(),nombre text,activo boolean default true);
    create table facturas_proveedor(id uuid primary key default gen_random_uuid(),proveedor_id uuid references proveedores(id),
      numero text,fecha date,total numeric,saldo numeric,nota text,created_at timestamptz default now(),origen_registro text,registrado_por uuid);
    create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create table pagos_proveedor(id uuid primary key default gen_random_uuid(),factura_id uuid,monto numeric);
    create table banco_movimientos(monto numeric);insert into banco_movimientos values(6269587);
    create table inventario(cantidad int);insert into inventario values(100);
  `);
  await db.exec(sql);
  const proveedor=randomUUID();
  await db.query('insert into proveedores(id,nombre) values($1,$2)',[proveedor,'Proveedor de prueba']);
  const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const factura=async(numero,saldo,fecha='2026-09-01',total=saldo)=>{
    const id=randomUUID();
    await db.query('insert into facturas_proveedor(id,proveedor_id,numero,fecha,total,saldo) values($1,$2,$3,$4,$5,$6)',[id,proveedor,numero,fecha,total,saldo]);return id;
  };
  const preparar=(id,base,objetivo)=>db.query('select preparar_ajuste_proveedor($1,$2,$3,$4,$5) r',[id,proveedor,base,objetivo,motivo]);
  const decidir=(id,aprobar=true,razon=null)=>db.query('select decidir_ajuste_proveedor($1,$2,$3) r',[id,aprobar,razon]);
  const saldo=async()=>Number((await db.query('select coalesce(sum(saldo),0) saldo from facturas_proveedor where proveedor_id=$1',[proveedor])).rows[0].saldo);
  return {db,proveedor,login,factura,preparar,decidir,saldo};
}

test('proveedores: Maite propone FIFO, Óscar autoriza una vez; sin pagos, banco ni inventario',async()=>{
  const f=await fixture();const {db}=f;
  try{
    const reciente=await f.factura('Nueva',300,'2026-09-20');
    const antigua=await f.factura('Anterior',100,'2026-09-01');
    const id=randomUUID();
    await f.login(oscar);await assert.rejects(f.preparar(id,400,250),/Solo Maite/);
    await f.login(maite);const r=(await f.preparar(id,400,250)).rows[0].r;
    assert.equal(await f.saldo(),400);
    assert.equal(r.plan[0].factura_id,antigua);assert.equal(r.plan[0].saldo_nuevo,0);
    assert.equal(r.plan[1].factura_id,reciente);assert.equal(r.plan[1].saldo_nuevo,250);
    await assert.rejects(f.decidir(id),/Solo Óscar/);
    await assert.rejects(f.preparar(randomUUID(),400,200),/ajuste pendiente/);
    await f.login(oscar);assert.equal((await f.decidir(id)).rows[0].r.estado,'aplicado');
    assert.equal(await f.saldo(),250);
    assert.equal((await f.decidir(id)).rows[0].r.ya_decidido,true);
    assert.equal((await db.query('select count(*)::int n from proveedores_ajustes_detalle')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from pagos_proveedor')).rows[0].n,0);
    assert.equal(Number((await db.query('select sum(monto) n from banco_movimientos')).rows[0].n),6269587);
    assert.equal((await db.query('select cantidad from inventario')).rows[0].cantidad,100);
    await f.login(maite);assert.equal((await f.preparar(id,400,250)).rows[0].r.estado,'aplicado');
    await assert.rejects(f.preparar(id,400,249),/otra solicitud/);
  }finally{await db.close();}
});

test('proveedores: los permisos reales permiten preparar y autorizar, sin escritura directa',async()=>{
  const f=await fixture();const {db}=f;
  try{
    await f.factura('A',400);const id=randomUUID();
    await db.exec('set role authenticated');
    await f.login(maite);await f.preparar(id,400,250);
    assert.equal((await db.query('select count(*)::int n from proveedores_ajustes_solicitudes')).rows[0].n,1);
    await assert.rejects(f.decidir(id),/Solo Óscar/);
    await assert.rejects(db.query("update proveedores_ajustes_solicitudes set estado='aplicado'"),/permission denied/);
    await f.login(oscar);assert.equal((await f.decidir(id)).rows[0].r.estado,'aplicado');
    assert.equal((await db.query('select count(*)::int n from proveedores_ajustes_detalle')).rows[0].n,1);
    await f.login(otro);
    assert.equal((await db.query('select count(*)::int n from proveedores_ajustes_detalle')).rows[0].n,0);
    await db.exec('reset role');assert.equal(await f.saldo(),250);
    assert.equal((await db.query("select has_function_privilege('anon','public.preparar_ajuste_proveedor(uuid,uuid,numeric,numeric,text)','execute') permitido")).rows[0].permitido,false);
    assert.equal((await db.query("select has_function_privilege('anon','public.decidir_ajuste_proveedor(uuid,boolean,text)','execute') permitido")).rows[0].permitido,false);
  }finally{await db.close();}
});

test('proveedores: incremento auditado conserva el pago histórico y no inventa una compra',async()=>{
  const f=await fixture();const {db}=f;
  try{
    const original=await f.factura('tke13234',0,'2026-09-09',11700000);
    await db.query('insert into pagos_proveedor(factura_id,monto) values($1,11700000)',[original]);
    const id=randomUUID();await f.login(maite);await f.preparar(id,0,8072500);
    await f.login(oscar);await f.decidir(id);
    assert.equal(await f.saldo(),8072500);
    const documento=(await db.query("select total,saldo from facturas_proveedor where origen_registro='ajuste_gerencia'")).rows[0];
    assert.equal(Number(documento.total),0);assert.equal(Number(documento.saldo),8072500);
    assert.equal(Number((await db.query('select sum(total) n from facturas_proveedor')).rows[0].n),11700000);
    assert.equal(Number((await db.query('select sum(monto) n from pagos_proveedor')).rows[0].n),11700000);
    assert.equal(Number((await db.query('select sum(diferencia) n from proveedores_ajustes_detalle')).rows[0].n),8072500);
  }finally{await db.close();}
});

test('proveedores: detecta redistribución entre facturas aunque el total siga igual',async()=>{
  const f=await fixture();const {db}=f;
  try{
    const a=await f.factura('A',100),b=await f.factura('B',300);const id=randomUUID();
    await f.login(maite);await f.preparar(id,400,350);
    await db.query('update facturas_proveedor set saldo=saldo+case when id=$1 then 50 else -50 end where id in ($1,$2)',[a,b]);
    await f.login(oscar);await assert.rejects(f.decidir(id),/facturas cambiaron/);
    assert.equal(await f.saldo(),400);
    assert.equal((await db.query('select estado from proveedores_ajustes_solicitudes')).rows[0].estado,'pendiente');
    await assert.rejects(f.decidir(id,false,'No'),/motivo de rechazo/);
    assert.equal((await f.decidir(id,false,'El detalle cambió después de preparar')).rows[0].r.estado,'rechazado');
    assert.equal((await db.query('select count(*)::int n from proveedores_ajustes_detalle')).rows[0].n,0);
  }finally{await db.close();}
});

test('proveedores: validar saldo, pesos, identidad y RLS antes de cualquier cambio',async()=>{
  const f=await fixture();const {db}=f;
  try{
    await f.factura('A',100.25);await f.login(maite);
    await assert.rejects(f.preparar(randomUUID(),100,80),/saldo cambió/);
    for(const destino of [-1,1.1,'NaN','Infinity'])await assert.rejects(f.preparar(randomUUID(),100.25,destino));
    const id=randomUUID();await f.preparar(id,100.25,80);
    await f.login(otro);await assert.rejects(f.decidir(id),/Solo Óscar/);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int n from proveedores_ajustes_solicitudes')).rows[0].n,0);
    await assert.rejects(db.query("update proveedores_ajustes_solicitudes set estado='aplicado'"),/permission denied/);
    await db.exec('reset role');await f.login(oscar);
    await db.exec("update perfiles set activo=false where id='"+oscar+"'");
    await assert.rejects(f.decidir(id),/Solo Óscar/);
    assert.equal(await f.saldo(),100.25);
  }finally{await db.close();}
});

test('proveedores: el ajuste está en Administración y el desglose no lo llama pago',async()=>{
  const html=await readFile(new URL('../../creditek/erp/ajustes-gerencia.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../../creditek/erp/ajustes-gerencia.js',import.meta.url),'utf8');
  const proveedor=await readFile(new URL('../../creditek/erp/proveedores.html',import.meta.url),'utf8');
  assert.match(html,/Deuda con proveedor/);assert.match(html,/no mueve Banco, Caja ni inventario/);
  assert.match(app,/preparar_ajuste_proveedor/);assert.match(app,/decidir_ajuste_proveedor/);
  assert.match(app,/Ver documentos del ajuste antes de autorizar/);
  assert.match(proveedor,/Ajustes de Gerencia \(no son pagos\)/);
  assert.doesNotMatch(sql,/insert into public\.(pagos_proveedor|movimientos_tesoreria|banco_)/i);
});
