import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {pvpSummary,compactPvpHtml}=require('../../creditek/erp/krediya-tarifario.js');
const migration=fs.readFileSync('supabase/migrations/20260910014305_krediya_informe_importacion_no_bloqueante.sql','utf8');
test('dos créditos: diferencia individual y total, sin promediar tarifas distintas',()=>{
 const c={referencia:'15 PRO',pvp_guardado:1000000,pvp_recibido:719900};
 const result=pvpSummary([c,c,{...c,pvp_recibido:900000}]);
 assert.equal(result.groups[0].delta,-280100);assert.equal(result.groups[0].total,-560200);
 assert.equal(result.groups.length,2);assert.equal(result.affected,3);
 assert.equal(result.total,-660200);
});
test('comparación incompleta no se convierte en cero, HTML escapa referencias',()=>{
 const contexts=[{referencia:'<img onerror=alert(1)>',pvp_guardado:null,pvp_recibido:10},{referencia:'X',pvp_guardado:10,pvp_recibido:10}];
 const result=pvpSummary(contexts);assert.equal(result.missing,1);assert.equal(result.compared,1);assert.equal(result.affected,0);
 const html=compactPvpHtml(contexts,String);assert.ok(!html.includes('<img'));assert.match(html,/1 sin datos/);
});
test('evento de importación guarda snapshot único, no bloquea ante error, no afecta otras plataformas',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema kora_private;
 create table liquidations(id uuid primary key,plataforma text);
 create table liquidation_operations(id uuid primary key,liquidation_id uuid,plataforma text,external_id text,operation_at timestamptz);
 create table liquidation_domain_events(event_type text,aggregate_id uuid);
 create table liquidation_incidents(liquidation_id uuid,tipo text,bloquea_aprobacion boolean);
 create function tiene_capacidad_aliados(text) returns boolean language sql as 'select false';
 create function aliados_contexto_precio_krediya(uuid) returns jsonb language sql as 'select jsonb_build_object(''operation_id'',$1,''pvp_guardado'',100,''pvp_recibido'',90,''pagamos_guardado'',80)';`);
 await db.exec(migration);
 const id='00000000-0000-4000-8000-000000000001';
 const second='00000000-0000-4000-8000-000000000002';
 await db.exec(`insert into liquidations values('${id}','krediya'),('${second}','payjoy');
 insert into liquidation_operations values('${id}','${id}','krediya','C1',now());
 insert into liquidation_domain_events values('liquidation.imported','${id}'),('liquidation.imported','${id}'),('liquidation.imported','${second}');`);
 const rows=(await db.query('select * from krediya_import_reports')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].contexts[0].pagamos_guardado,80);assert.equal(rows[0].operation_count,1);
 assert.equal(rows[0].email_status,'sin_configurar');assert.equal(rows[0].email_sent_at,null);
 assert.deepEqual(rows[0].recipients,['gestion@crediteksas.com','comercial@crediteksas.com']);
 await db.exec(`insert into liquidation_incidents values('${id}','krediya_precio_venta_diferente',true),('${second}','krediya_precio_venta_diferente',true),('${id}','otro_error',true);`);
 assert.deepEqual((await db.query('select bloquea_aprobacion from liquidation_incidents')).rows.map(r=>r.bloquea_aprobacion),[false,true,true]);
 await db.exec(`set role authenticated;`);
 assert.equal((await db.query('select * from krediya_import_reports')).rows.length,0);
 await assert.rejects(db.exec(`update krediya_import_reports set email_status='enviado'`));
 await db.exec('reset role');
 // Failed context lookup preserves the import event and marks the report, not the lot.
 await db.exec(`create or replace function aliados_contexto_precio_krediya(uuid) returns jsonb language plpgsql as $$begin raise exception 'simulated unavailable context';end$$;
 update liquidations set plataforma='krediya' where id='${second}';
 insert into liquidation_operations values('${second}','${second}','krediya','C2',now());
 insert into liquidation_domain_events values('liquidation.imported','${second}');`);
 assert.equal((await db.query(`select report_status from krediya_import_reports where liquidation_id='${second}'`)).rows[0].report_status,'error');
 assert.equal((await db.query('select count(*)::int n from liquidation_domain_events')).rows[0].n,4);
 }finally{await db.close();}
});
