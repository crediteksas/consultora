import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {summarizeReferences,renderClosure} from '../../supabase/functions/b2b-pedido-mail/core.mjs';
test('suma referencias de tiendas por ciudad sin cambiar costos distintos ni perder detalle',()=>{
 const items=[{producto_id:'a',referencia:'Celular',tienda:'Tienda 1',ciudad:'Corozal',proveedor:'MPS',cantidad:2,costo:100,precio:120},{producto_id:'a',referencia:'Celular',tienda:'Tienda 2',ciudad:'Corozal',proveedor:'MPS',cantidad:3,costo:110,precio:130}];
 assert.deepEqual(summarizeReferences(items),[{referencia:'Celular',cantidad:5,total:530,costos:[{costo:100,cantidad:2},{costo:110,cantidad:3}]}]);
 const html=renderClosure({numero:'CIE-1',fecha:'2026-09-21',items:[...items,{...items[0],ciudad:'Chinú',cantidad:1}]});
 assert.match(html,/Corozal · Un solo pedido/);assert.match(html,/Chinú · Un solo pedido/);
 assert.match(html,/<td>Celular<\/td><td>5<\/td>/);assert.match(html,/Tienda 1/);assert.match(html,/Tienda 2/);
 assert.match(html,/Distribución interna por tienda/);assert.match(html,/Tienda 1 · Chinú/);assert.match(html,/Tienda 2 · Corozal/);
 assert.match(html,/Costo estimado/);assert.match(html,/Preparar compra/);assert.match(html,/No se asigna una tienda receptora/);
});
test('retira disparador y cron individual, bloquea trabajos en tránsito y conserva cierre e historia',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema cron;create table cron.job(jobid bigint,jobname text);
 insert into cron.job values(1,'kora-b2b-pedido-mail'),(2,'kora-b2b-cierre-mail');
 create function cron.unschedule(bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=$1;return true;end$$;
 create table pedidos_b2b(id uuid);create table preserved_history(id int);insert into preserved_history values(1);
 create function old_trigger() returns trigger language plpgsql as $$begin raise exception 'mail was enqueued';end$$;
 create trigger enqueue_b2b_pedido_mail after insert on pedidos_b2b for each row execute function old_trigger();`);
 await db.exec(readFileSync('supabase/migrations/20260921191909_b2b_correo_solo_al_cierre.sql','utf8'));
 await db.exec('insert into pedidos_b2b values(gen_random_uuid())');
 assert.equal((await db.query('select count(*)::int n from preserved_history')).rows[0].n,1);
 assert.deepEqual((await db.query('select jobname from cron.job')).rows,[{jobname:'kora-b2b-cierre-mail'}]);
 await db.exec('set role service_role');
 assert.equal((await db.query('select kora_claim_b2b_pedido_mail(null,null) r')).rows[0].r,null);
 await db.exec('reset role;set role authenticated');
 await assert.rejects(db.query('select kora_claim_b2b_pedido_mail(null,null)'),/permission denied/);
 }finally{await db.close();}
});
