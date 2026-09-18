import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import C from '../../creditek/erp/b2b-cierres.js';
import {renderReport,deliver,RECIPIENTS} from '../../supabase/functions/b2b-pedido-mail/core.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const file='20260918152850_b2b_cierre_periodo_consolidado.sql';
test('Cierre: copia inmutable, corte exacto, idempotencia, doble cierre, RLS y correo sin duplicar',async()=>{
 const db=new PGlite();try{
 const source=readFileSync(new URL('./b2b-listas.test.mjs',import.meta.url),'utf8');
 const fixture=source.slice(source.indexOf('await db.exec(`')+15,source.indexOf('`);',source.indexOf('await db.exec(`'))).replace(/\$\{uid\((\d+)\)\}/g,(_,n)=>uid(n));
 await db.exec(fixture);
 await db.exec(`create role service_role bypassrls;create schema kora_private;grant usage on schema kora_private to authenticated,service_role;create schema cron;create function cron.schedule(text,text,text) returns int language sql as $$select 1$$;alter table origenes add column ciudad text;alter table pedidos_b2b add column solicitado_at timestamptz default now();create policy admin_orders on pedidos_b2b for select to authenticated using(exists(select 1 from perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')));`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20260917174237_listas_precios_pedidos_kora.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec('grant select on origenes,ordenes_compra to authenticated;');
 const query=async(q,args=[])=>(await db.query(q,args)).rows;
 const as=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false);set role authenticated;`);
 await as(1);
 await query('select publicar_lista_b2b($1,$2,$3,$4::jsonb)',['Lista','c'.repeat(64),'catalogo',JSON.stringify([{producto_id:uid(10),proveedor_id:uid(20),costo:400000,precio_tienda:420000,motivo:''}])]);
 await as(3);
 const [p]=await query('select * from catalogo_pedidos_b2b()');
 const create=async key=>(await query('select crear_pedido_catalogo_b2b($1::jsonb,null,$2) r',[JSON.stringify([{producto_id:p.id,cantidad:2,precio_catalogo:Number(p.precio_guia),version_precio:p.version_precio}]),uid(key)]))[0].r;
 const o1=await create(100);
 await assert.rejects(()=>query('select vista_previa_cierre_b2b()'),/Administración/);
 assert.equal((await query('select * from b2b_cierres')).length,0);
 await as(2);
 const preview=async ids=>(await query('select vista_previa_cierre_b2b($1) r',[ids||null]))[0].r;
 const first=await preview();assert.equal(first.pedidos,1);assert.equal(first.items[0].costo,400000);
 const close=async(s,key=200)=>(await query('select cerrar_periodo_pedidos_b2b($1,$2,$3) r',[s.pedido_ids,s.huella,uid(key)]))[0].r;
 await assert.rejects(()=>close({...first,huella:'wrong'}),/cambiaron/);
 await assert.rejects(()=>close({...first,pedido_ids:[]}),/Selecciona/);
 // A later request is not silently included in the already reviewed snapshot.
 await as(3);const o2=await create(101);await as(2);
 const closed=await close(first);assert.ok(closed.id);
 const again=await close(first);assert.equal(again.id,closed.id);assert.equal(again.repetido,true);
 await assert.rejects(()=>close(first,201),/cambiaron/);
 const remaining=await preview();assert.deepEqual(remaining.pedido_ids,[o2.pedido_id]);
 assert.equal((await query('select estado from pedidos_b2b where id=$1',[o1.pedido_id]))[0].estado,'solicitado');
 assert.equal((await query('select * from b2b_cierres')).length,1);
 assert.equal((await query('select count(*)::int n from ordenes_compra'))[0].n,0);
 await assert.rejects(()=>query('delete from b2b_cierres'),/permission denied/);
 await as(1);await assert.rejects(()=>close(first,202),/cambiaron/);
 await as(3);assert.equal((await query('select * from b2b_cierres')).length,0);assert.equal((await query('select * from b2b_cierre_pedidos')).length,0);await assert.rejects(()=>close(first,203),/Administración/);
 await db.exec('reset role');
 const [job]=await query('select * from kora_private.b2b_cierre_mail_jobs');
 await db.exec('set role service_role');
 assert.equal((await query('select kora_claim_b2b_cierre_mail($1,$2) r',[closed.id,uid(999)]))[0].r,null);
 const claimed=(await query('select kora_claim_b2b_cierre_mail($1,$2) r',[closed.id,job.token]))[0].r;assert.equal(claimed.tipo,'cierre');assert.equal(claimed.items.length,1);assert.equal(claimed.items[0].costo,400000);
 assert.equal((await query('select kora_claim_b2b_cierre_mail($1,$2) r',[closed.id,job.token]))[0].r,null);
 await query("select kora_finish_b2b_cierre_mail($1,$2,'ambiguous',null)",[closed.id,job.token]);
 assert.equal((await query('select correo_estado from b2b_cierres'))[0].correo_estado,'incierto');
 assert.equal((await query('select kora_claim_b2b_cierre_mail($1,$2) r',[closed.id,job.token]))[0].r,null);
 await db.exec('reset role');await query('update b2b_ofertas set costo=999 where producto_id=$1',[uid(10)]);
 await as(2);assert.equal((await query('select reporte from b2b_cierres'))[0].reporte.items[0].costo,400000);
 // Missing source costs remain missing, not zero; closure must fail atomically.
 await db.exec('reset role');await query('delete from b2b_pedido_fuente where pedido_item_id in(select id from pedido_b2b_items where pedido_id=$1)',[o2.pedido_id]);
 await as(2);const missing=await preview();assert.equal(missing.items[0].costo,null);await assert.rejects(()=>close(missing,204),/sin proveedor/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>query('select vista_previa_cierre_b2b()'),/permission denied/);await assert.rejects(()=>query('select * from b2b_cierres'),/permission denied/);
 }finally{await db.close();}
});
test('Consolidado conserva nombres, ciudad, proveedor, totales y costo faltante',()=>{
 const items=[{pedido_id:'a',cantidad:2,costo:400000,precio:420000,tienda:'Chinucell',ciudad:'Chinú',proveedor:'MPS'},{pedido_id:'a',cantidad:1,costo:300000,precio:320000,tienda:'Chinucell',ciudad:'Chinú',proveedor:'INITY'}];
 assert.deepEqual(C.totals(items),{pedidos:1,unidades:3,costo:1100000,retail:1160000});assert.equal(C.groups(items,'ciudad').length,1);assert.equal(C.groups(items,'proveedor').length,2);
 assert.equal(C.totals([{...items[0],costo:null}]).costo,null);assert.match(C.grouped(items,'tienda'),/Chinucell/);assert.equal(C.exportRows(items).length,3);
 assert.equal(C.brand('Redmi 17 4/128'),'XIAOMI');assert.equal(C.brand('Moto G06'),'MOTOROLA');assert.equal(C.brand('Cable sin marca'),'OTRAS');
});
test('Correo consolidado agrupa proveedor y ciudad; no confunde cierre con entrega',async()=>{
 const r={tipo:'cierre',id:'test',numero:'CIE-000001',tienda:'Consolidado',fecha:'2026-09-18T15:00:00Z',items:[{pedido_id:'a',numero:'PED-000001',tienda:'Chinucell',ciudad:'Chinú',referencia:'<b>Equipo</b>',cantidad:2,costo:400000,precio:420000,proveedor:'MPS'}]};
 const html=renderReport(r);assert.match(html,/Cierre de período/);assert.match(html,/MPS/);assert.match(html,/Chinú/);assert.match(html,/800.000/);assert.match(html,/no confirma recepción/);assert.doesNotMatch(html,/<b>Equipo/);assert.match(html,/&lt;b&gt;Equipo/);
 assert.deepEqual(RECIPIENTS,['gestion@crediteksas.com','comercial@crediteksas.com']);
 let calls=0;const result=await deliver(r,{},async()=>++calls===1?new Response(JSON.stringify({access_token:'test'})):new Response(JSON.stringify({id:'mockMessage'})));assert.equal(result.outcome,'sent');assert.equal(calls,2);
});
test('Cierre visible, confirmación explícita e historial sin borrar datos',()=>{
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');assert.match(page,/Pedidos y cierre/);assert.match(page,/id="cierrePedidos"/);assert.match(page,/id="brand"/);
 const ui=readFileSync(new URL('../../creditek/erp/b2b-cierres.js',import.meta.url),'utf8');assert.match(ui,/dialog.showModal/);assert.match(ui,/p_huella:preview.huella/);assert.doesNotMatch(ui,/\.delete\(|\.update\(/);
 // Parse every inline script as JavaScript, catching regressions in the static page.
 for(const [,script] of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script);
});
