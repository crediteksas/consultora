import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {deliver,renderReport,buildRaw} from '../../supabase/functions/krediya-report-mail/core.mjs';
const id='00000000-0000-4000-8000-000000000001';
const report={liquidation_id:id,report_status:'preparado',operation_count:2,contexts:[1,2].map(()=>({referencia:'15 PRO <b>',pvp_guardado:1000000,pvp_recibido:719900}))};
test('correo separa diferencia individual y acumulada y fija destinatarios',()=>{
 const html=renderReport(report);assert.match(html,/280\.100/);assert.match(html,/560\.200/);assert.match(html,/&lt;b&gt;/);assert.match(html,/2 con diferencias/);
 const raw=Buffer.from(buildRaw({...report,recipients:['attacker@example.com']}),'base64url').toString();
 assert.match(raw,/To: gestion@crediteksas.com, comercial@crediteksas.com/);assert.ok(!raw.includes('attacker'));
 assert.match(renderReport({...report,contexts:[{pvp_guardado:null},{pvp_guardado:0,pvp_recibido:0}]}),/1 sin comparación completa/);
});
test('envío distingue éxito, fallo previo seguro y resultado ambiguo sin reenvío',async()=>{
 const token=()=>Response.json({access_token:'test'});
 let calls=0;
 assert.deepEqual(await deliver(report,{},async()=>++calls===1?token():Response.json({id:'abc123'})),{outcome:'sent',messageId:'abc123'});
 assert.deepEqual(await deliver(report,{},async()=>{throw Error('offline');}),{outcome:'retry'});
 calls=0;assert.deepEqual(await deliver(report,{},async()=>++calls===1?token():Promise.reject(Error('timeout'))),{outcome:'ambiguous'});
 calls=0;assert.deepEqual(await deliver(report,{},async()=>++calls===1?token():new Response('',{status:429})),{outcome:'retry'});
 calls=0;assert.deepEqual(await deliver({...report,operation_count:3},{},async()=>{calls++;}),{outcome:'failed'});assert.equal(calls,0);
});
test('cola: permisos, claim único, reintento, confirmación y caducidad sin repetir correo',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema kora_private;create schema net;create schema cron;
 create table public.krediya_import_reports(liquidation_id uuid primary key,report_status text default 'preparado',email_status text default 'sin_configurar',email_sent_at timestamptz,provider_message_id text,error_code text,contexts jsonb default '[]',operation_count int default 0);
 grant all on public.krediya_import_reports to service_role;
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as 'select 1::bigint';
 create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';`);
 const sql=fs.readFileSync('supabase/migrations/20260910034355_krediya_correo_cola.sql','utf8').replace(/^create extension.*;$/gm,'');await db.exec(sql);
 await db.exec(`insert into krediya_import_reports(liquidation_id) values('${id}');`);
 assert.equal((await db.query('select email_status from krediya_import_reports')).rows[0].email_status,'pendiente');
 const token=(await db.query('select token from kora_private.krediya_mail_jobs')).rows[0].token;
 await db.exec('set role authenticated');await assert.rejects(db.query('select public.kora_claim_krediya_mail($1,$2)',[id,token]));await db.exec('reset role;set role service_role');
 const claim=()=>db.query('select public.kora_claim_krediya_mail($1,$2) r',[id,token]);
 assert.ok((await claim()).rows[0].r);assert.equal((await claim()).rows[0].r,null);
 await db.query("select public.kora_finish_krediya_mail($1,$2,'sent','abc123')",[id,token]);
 assert.equal((await db.query('select email_status from krediya_import_reports')).rows[0].email_status,'enviado');assert.equal((await claim()).rows[0].r,null);
 await db.exec(`reset role;update kora_private.krediya_mail_jobs set status='sending',claimed_at=now()-interval '11 minutes';select kora_private.dispatch_krediya_mail();`);
 assert.equal((await db.query('select status from kora_private.krediya_mail_jobs')).rows[0].status,'ambiguous');
 }finally{await db.close();}
});
