import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const path='supabase/migrations/20260917105136_krediya_informe_utilidad_estimada.sql';
test('informe captura consulta existente sin liquidar, tolera error de utilidad y no reescribe históricos',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema kora_private;create schema krediya_private;
 create table liquidations(id uuid primary key,plataforma text);
 create table liquidation_operations(id uuid primary key,liquidation_id uuid,plataforma text,external_id text,operation_at timestamptz,reconocida boolean);
 create table liquidation_domain_events(event_type text,aggregate_id uuid);
 create table krediya_import_reports(liquidation_id uuid primary key,contexts jsonb,operation_count int,report_status text default 'preparado',error_code text);
 create function aliados_contexto_precio_krediya(uuid) returns jsonb language sql as $$select jsonb_build_object('operation_id',$1,'pvp_recibido',100,'pagamos_guardado',80)$$;
 create function krediya_private.utilidad_consulta(uuid) returns jsonb language plpgsql stable as $$begin
 if current_setting('test.fail',true)='yes' then raise exception 'simulated';end if;
 return jsonb_build_object('disponible',true,'utilidad_neta',12.34);end$$;`);
 await db.exec(fs.readFileSync(path,'utf8'));
 await db.exec(`create trigger capture after insert on liquidation_domain_events for each row execute function kora_private.capture_krediya_import_report();
 insert into liquidations values('00000000-0000-4000-8000-000000000001','krediya'),('00000000-0000-4000-8000-000000000002','krediya'),('00000000-0000-4000-8000-000000000003','payjoy');
 insert into liquidation_operations select id,id,plataforma,'C1',now(),true from liquidations;
 insert into liquidation_domain_events select 'liquidation.imported',id from liquidations where plataforma='payjoy' or id='00000000-0000-4000-8000-000000000001';`);
 let rows=(await db.query('select * from krediya_import_reports')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].contexts[0].automatica.utilidad_neta,12.34);assert.equal(rows[0].operation_count,1);
 assert.equal(rows[0].contexts[0].credito,'C1');assert.equal(rows[0].contexts[0].reconocida,true);
 await db.exec(`set test.fail='yes';insert into liquidation_domain_events select 'liquidation.imported',id from liquidations where plataforma='krediya';`);
 rows=(await db.query('select * from krediya_import_reports order by liquidation_id')).rows;
 assert.equal(rows.length,2);assert.equal(rows[0].contexts[0].automatica.utilidad_neta,12.34);
 assert.equal(rows[1].report_status,'preparado');assert.equal(rows[1].contexts[0].pvp_recibido,100);
 assert.equal(rows[1].contexts[0].automatica.disponible,false);assert.match(rows[1].contexts[0].automatica.motivo,/no disponible/);
 await db.exec('set role authenticated');await assert.rejects(db.query('select kora_private.capture_krediya_import_report()'));
 const sql=fs.readFileSync(path,'utf8');assert.doesNotMatch(sql,/calcular_y_enviar_aprobacion|update public\.liquidation|insert into public\.payment|create.*function krediya_private\.utilidad_consulta/i);
 }finally{await db.close();}
});
