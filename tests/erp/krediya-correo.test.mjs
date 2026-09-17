import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {deliver,renderReport,buildRaw,profitSummary,reportRows} from '../../supabase/functions/krediya-report-mail/core.mjs';
const id='00000000-0000-4000-8000-000000000001';
const report={liquidation_id:id,report_status:'preparado',operation_count:2,contexts:[1,2].map(()=>({referencia:'15 PRO <b>',pvp_guardado:1000000,pvp_recibido:719900}))};
test('una sola tabla mantiene todas las columnas PVP y añade utilidad en la misma fila',()=>{
 const c={referencia:'Equipo A',pvp_guardado:100,pvp_recibido:90,automatica:{disponible:true,pvp:90,pagamos:70,utilidad_neta:12.34}};
 const contexts=[c,c,{...c,referencia:'Equipo B',pvp_guardado:90},{...c,referencia:'Equipo C',pvp_guardado:null,automatica:{disponible:false,motivo:'Falta: PAGAMOS'}}];
 const html=renderReport({...report,operation_count:4,contexts});
 assert.equal((html.match(/<table /g)||[]).length,1);
 assert.match(html,/<th>Equipo<\/th><th>Créditos<\/th><th>PVP KORA<\/th><th>PVP archivo<\/th><th>Diferencia por crédito<\/th><th>Diferencia total<\/th><th>Utilidad neta estimada \(total\)<\/th>/);
 const row=html.match(/<tr><td>Equipo A<\/td>[\s\S]*?<\/tr>/)[0];
 assert.equal((row.match(/<td>/g)||[]).length,7);assert.match(row,/24,68/);assert.match(row,/-\$\s*20/);
 assert.match(html,/Equipo B/);assert.match(html,/Equipo C/);assert.match(html,/Falta: PAGAMOS/);
 assert.equal(reportRows(contexts).reduce((n,r)=>n+r.n,0),4);
 assert.equal(profitSummary(contexts).total,37.02);
});
test('utilidad suma todos los créditos calculables, conserva pérdidas y no confunde faltantes con cero',()=>{
 const base={referencia:'Equipo <img>',pvp_guardado:100,pvp_recibido:100,automatica:{disponible:true,pvp:100,pagamos:80,utilidad_neta:12.34}};
 const contexts=[base,base,{...base,automatica:{...base.automatica,utilidad_neta:-2.01}},
  {...base,automatica:{disponible:false,motivo:'Falta: PAGAMOS'},credito:'C<1>'},
  {...base,reconocida:false,automatica:{disponible:false,motivo:'Operación excluida'}}];
 const s=profitSummary(contexts);assert.equal(s.total,22.67);assert.equal(s.calculated,3);assert.equal(s.pending.length,1);assert.equal(s.excluded,1);
 assert.equal(s.groups.length,1);assert.equal(s.groups[0].n,3);assert.equal(s.groups[0].totalCents,2267);
 const html=renderReport({...report,created_at:'2026-09-17T02:03:00Z',operation_count:5,contexts});
 assert.match(html,/Subtotal estimado \(parcial\)/);assert.match(html,/22,67/);assert.match(html,/Falta: PAGAMOS/);
 assert.match(html,/Consulta al 16/);assert.ok(!html.includes('<img>'));assert.match(html,/C&lt;1&gt;/);
 assert.match(html,/0 con diferencias/);assert.match(html,/3 créditos calculados/);
});
test('estimación ausente no inventa utilidad; cero conocido sí es calculable; no agrupa tarifas distintas',()=>{
 assert.match(renderReport(report),/Utilidad no disponible/);
 const c={referencia:'X',automatica:{disponible:true,pvp:100,pagamos:90,utilidad_neta:0}};
 const s=profitSummary([c,{...c,automatica:{...c.automatica,pagamos:80}},{automatica:{disponible:true,utilidad_neta:null}}]);
 assert.equal(s.calculated,2);assert.equal(s.total,0);assert.equal(s.groups.length,2);assert.equal(s.pending.length,1);
 assert.match(renderReport({...report,contexts:[c]}),/Total estimado:/);
});
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
