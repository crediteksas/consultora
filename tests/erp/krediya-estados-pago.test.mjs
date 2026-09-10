import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import domain from '../../creditek/erp/aliados-liquidaciones-domain.js';
const migration=fs.readFileSync('supabase/migrations/20260910170801_krediya_estados_pago_y_seguimiento.sql','utf8');
const source=(contract,pay)=>({movimientos:[{original:{'estado del contrato':contract,'estado del pago':pay}}]});
test('importador excluye contratos no finalizados; pendiente sin solicitud aprobada no es devolución',()=>{
 const headers=['# Crédito','Tienda','IMEI','Cédula','Estado del contrato','Estado del Pago','Monto a Financiar','Abono (moneda)','Fecha'];
 const rows=[headers,['C1','A TIENDA','123','456','ANULADO','PENDIENTE',100,0,'2026-09-01'],['C2','A TIENDA','124','457','FIRMADO','PENDIENTE',100,0,'2026-09-01']];
 const result=domain.importarKrediya(rows,[]);
 assert.equal(result.operaciones.filter(o=>o.reconocida).length,0);
 assert.ok(result.operaciones.every(o=>o.incidencias.includes('krediya_pago_pendiente')));
 assert.ok(result.operaciones.every(o=>!o.incidencias.includes('operacion_no_reconocida')));
});
test('importador acepta firmado y aprobado pendiente; no acepta anulados ni duplica crédito',()=>{
 const h=['# Crédito','Tienda','IMEI','Cédula','Estado del contrato','Estado del Pago','Estado de la solicitud','Monto a Financiar','Abono (moneda)','Fecha'];
 const row=(id,contract,application)=>[id,'A TIENDA','123','456',contract,'PENDIENTE',application,100,0,'2026-09-01'];
 const r=domain.importarKrediya([h,row('C1','FIRMADO','Aprobado'),row('C2','ANULADO','Aprobado'),row('C3','FIRMADO','Pendiente'),row('C1','FIRMADO','Aprobado')],[]);
 assert.ok(!r.operaciones[0].incidencias.includes('krediya_pago_pendiente'));
 assert.ok(!r.operaciones[0].incidencias.includes('krediya_estado_por_validar'));
 assert.ok(r.operaciones.find(o=>o.externalId==='C2').incidencias.includes('krediya_pago_pendiente'));
 assert.ok(r.operaciones.find(o=>o.externalId==='C3').incidencias.includes('krediya_pago_pendiente'));
 assert.equal(r.operaciones.filter(o=>o.incidencias.includes('operacion_duplicada')).length,1);
});
test('SQL: pendientes excluidos, promoción posterior única, trazabilidad y aislamiento por plataforma',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create schema kora_private;create schema auth;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table liquidations(id uuid primary key default gen_random_uuid(),plataforma text,estado text default 'importada',frozen_at timestamptz);
 create table liquidation_operations(id uuid primary key default gen_random_uuid(),liquidation_id uuid,plataforma text,external_id text,reconocida boolean,normalized_data jsonb,created_at timestamptz default now());
 create table liquidation_incidents(id uuid primary key default gen_random_uuid(),liquidation_id uuid,operation_id uuid,tipo text,descripcion text,bloquea_aprobacion boolean default true,estado text default 'abierta',resolved_at timestamptz,resolved_by uuid,resolution text,unique(liquidation_id,operation_id,tipo));
 create table liquidation_calculations(operation_id uuid);create table liquidation_bonuses(operation_id uuid);create table payment_items(operation_id uuid);
 create table audit_log(accion text,tabla text,registro_id uuid,detalle jsonb);
 `);
 await db.exec(migration);
 const lot=async()=> (await db.query("insert into liquidations(plataforma) values('krediya') returning id")).rows[0].id;
 const first=await lot(),second=await lot();
 const op=async(l,c,p,ct='FIRMADO',platform='krediya')=>(await db.query('insert into liquidation_operations(liquidation_id,plataforma,external_id,reconocida,normalized_data) values($1,$2,$3,true,$4) returning *',[l,platform,c,source(ct,p)])).rows[0];
 const pending=await op(first,'C1','PENDIENTE','ANULADO');assert.equal(pending.reconocida,false);
 assert.equal(pending.normalized_data.seguimientoPagoKrediya,'krediya_pago_pendiente');
 const issues=(await db.query('select * from liquidation_incidents')).rows;
 assert.equal(issues.length,1);assert.equal(issues[0].bloquea_aprobacion,false);assert.match(issues[0].descripcion,/No genera pago/);
 // Older client sends a generic incident after the operation trigger: it is consolidated.
 await db.query("insert into liquidation_incidents(liquidation_id,operation_id,tipo) values($1,$2,'operacion_no_reconocida') on conflict do nothing",[first,pending.id]);
 assert.equal((await db.query('select count(*)::int n from liquidation_incidents')).rows[0].n,1);
 const paid=await op(second,'C1','PAGADO');assert.equal(paid.reconocida,true);
 assert.equal((await db.query('select estado from liquidation_incidents where operation_id=$1',[pending.id])).rows[0].estado,'resuelta');
 const again=await op(await lot(),' c1 ','PAGADO');assert.equal(again.reconocida,false);assert.equal(again.normalized_data.operacionAnteriorKrediya,paid.id);
 const cancel=await op(await lot(),'C1','PENDIENTE','ANULADO');
 assert.equal(cancel.normalized_data.seguimientoPagoKrediya,'krediya_anulacion_por_conciliar');
 assert.equal((await db.query('select reconocida from liquidation_operations where id=$1',[paid.id])).rows[0].reconocida,true,'Does not erase original sale or manufacture recovery');
 assert.equal((await op(first,'C2','PENDIENTE')).reconocida,false);
 assert.equal((await op(first,'C3','')).reconocida,false);
 assert.equal((await op(first,'C4','PAGADO','ANULADO')).reconocida,false);
 assert.equal((await op(first,'C5','PENDIENTE','FIRMADO','payjoy')).reconocida,true);
 // Reproduce the failing catalog UPDATE -> eligibility trigger -> SUM path.
 await db.exec(`create schema krediya_private;
 alter table liquidation_operations add column valor_comercial numeric default 100;
 alter table liquidations add column total_operaciones numeric not null default 0;
 create function kora_private.preparar_catalogo_liquidacion(p_id uuid) returns void language plpgsql as $$begin
 update liquidation_operations set normalized_data=normalized_data||'{"tipoEstablecimiento":"aliado"}'::jsonb where liquidation_id=p_id and reconocida;
 end$$;
 create function krediya_private.calcular_y_enviar_aprobacion(p_id uuid) returns void language plpgsql as $$begin
 perform kora_private.preparar_catalogo_liquidacion(p_id);
 update liquidations set total_operaciones=(select sum(valor_comercial) from liquidation_operations where liquidation_id=p_id and reconocida) where id=p_id;
 end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260910214553_krediya_firmados_a_tesoreria.sql','utf8'));
 const mixed=await lot();
 for(let i=0;i<21;i++){
  const data=source(i<19?'FIRMADO':'ANULADO','PENDIENTE');
  data.movimientos[0].original['estado de la solicitud']='Aprobado';
  await db.query('insert into liquidation_operations(liquidation_id,plataforma,external_id,reconocida,normalized_data) values($1,\'krediya\',$2,true,$3)',[mixed,`M${i}`,data]);
 }
 await db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[mixed]);
 assert.equal((await db.query('select total_operaciones from liquidations where id=$1',[mixed])).rows[0].total_operaciones,'1900');
 assert.equal((await db.query('select count(*)::int n from liquidation_operations where liquidation_id=$1 and reconocida',[mixed])).rows[0].n,19);
 assert.equal((await db.query('select count(*)::int n from liquidation_incidents where liquidation_id=$1 and bloquea_aprobacion',[mixed])).rows[0].n,0);
 const empty=await lot();await op(empty,'EMPTY','PENDIENTE','ANULADO');
 await assert.rejects(db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[empty]),/No hay créditos finalizados elegibles/);
 const repeated=source('FIRMADO','PENDIENTE');repeated.movimientos[0].original['estado de la solicitud']='Aprobado';
 assert.equal((await db.query('insert into liquidation_operations(liquidation_id,plataforma,external_id,reconocida,normalized_data) values($1,\'krediya\',\'M0\',true,$2) returning reconocida',[await lot(),repeated])).rows[0].reconocida,false);
 await db.exec('set role authenticated');
 await assert.rejects(db.query("select kora_private.krediya_estado_fuente('{}','Estado del Pago')"),/permission denied/);
 } finally {await db.close();}
});
