import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import W from '../../creditek/erp/b2b-whatsapp-domain.js';
import {renderReport,buildRaw,deliver,RECIPIENTS} from '../../supabase/functions/b2b-pedido-mail/core.mjs';
const products=[{id:'p',codigo:'X1',nombre:'REDMI 17 4+128GB'},{id:'q',codigo:'X2',nombre:'REDMI 17 6+256GB'}];
test('WhatsApp: texto íntegro, pesos colombianos, IVA sin sumarlo otra vez, duplicados y dudas',()=>{
 const raw='REDMI 17 4+128GB PRECIO 482.000\nNOTE 17 5G 6+128 PRECIO 710.000\nXIAOMI 17T 12+512 PRECIO 2.430.000 INCLUIDO IVA';
 const rows=W.parse(raw,'s',products);assert.equal(rows.length,3);assert.equal(rows[0].producto_id,'p');assert.equal(rows[0].precio_tienda,502000);assert.equal(rows[2].costo,2430000);assert.equal(rows[1].producto_id,'');assert.equal(rows.map(r=>r.original).join('\n'),raw);assert.ok(W.validate(rows).length);
 assert.equal(W.parse('REDMI 17 4+128GB\n$482,000','s',products).length,1);
 const low=W.parse('REDMI 17 4+128GB $482','s',products);assert.ok(W.validate(low).some(s=>s.includes('precio bajo')));low[0].priceConfirmed=true;assert.equal(W.validate(low).length,0);
 const unknown=W.parse('Encabezado\nREDMI 17 4+128GB $482.000🇨🇴','s',products);assert.equal(unknown.length,2);assert.equal(unknown[1].costo,482000);
 const duplicate=W.parse('REDMI 17 4+128GB $482.000\nREDMI 17 4+128GB $483.000','s',products);assert.ok(W.validate(duplicate).some(s=>s.includes('duplicados')));
 const used=W.parse('REDMI 17 USADO $482.000','s',products);assert.equal(used[0].included,false);
 assert.ok(!W.validate(rows).some(s=>s.includes('duplicados')),'Las referencias sin vincular no son duplicados entre sí');
});
test('memoria por proveedor y variante, Aura conservada, comparativo global',()=>{
 const rule={proveedor_id:'s',referencia_key:'17 4+128',producto_id:'p',margen:15000,motivo:'Excepción aprobada'};
 const rows=W.parse('17 4+128 $480.000','s',products,[rule]);assert.equal(rows[0].producto_id,'p');assert.equal(rows[0].precio_tienda,495000);
 assert.equal(W.parse('17 4+128 $480.000','other',products,[rule])[0].producto_id,'');
 assert.equal(W.parse('17 6+256 $480.000','s',products,[rule])[0].producto_id,'');
 const legacy=[{referencia:'redmi 17 4+128 precio',canonica:'Redmi 17 4+128GB',activa:'SI'}];
 assert.equal(W.parse('REDMI 17 4+128 PRECIO 482.000','s',products,[],legacy)[0].producto_id,'p');
 const winner=W.compare(rows,[{producto_id:'p',proveedor_id:'s',costo:1,precio_tienda:2},{producto_id:'p',proveedor_id:'b',costo:470000,precio_tienda:490000}],'s');assert.equal(winner[0].proveedor_id,'b');
 assert.throws(()=>W.parse('x'.repeat(200001),'s',products),/200.000/);
});
test('MPS: regla guardada, número de parte exacto y nombre sin metadatos conservan el origen y los precios',()=>{
 const catalog=[
  {id:'silver',codigo:'BHR09CXGL',nombre:'REDMI Watch 6 Active Matte Silver',activo:true},
  {id:'black',codigo:'BHR08UFGL',nombre:'REDMI Buds 8 Black',activo:true},
  {id:'neo',codigo:'KORA-NEO',sku:'BHR08W2GL',nombre:'REDMI Headphones Neo White',activo:true}
 ];
 const reference='REDMI Watch 6 Active Matte Silver ; Número de parte BHR09CXGL ; IVA INCLUIDO ; DISPONIBLES ; Garantía 1 año';
 const original=reference+' $170.000';
 const [row]=W.parse(original,'mps',catalog);
 assert.equal(row.producto_id,'silver');assert.equal(row.reference,reference);assert.equal(row.original,original);
 assert.equal(row.costo,170000);assert.equal(row.precio_tienda,190000);assert.equal(row.remember,false);
 assert.equal(W.parse('Nombre de proveedor diferente ; Número de parte:BHR08W2GL $85.000','mps',catalog)[0].producto_id,'neo');
 assert.equal(W.parse('REDMI Buds 8 Black ; IVA INCLUIDO ; Garantía 1 año $100.000','mps',catalog)[0].producto_id,'black');
 const rule={proveedor_id:'mps',referencia_key:reference.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),producto_id:'black',margen:25000,motivo:'Equivalencia confirmada'};
 const [saved]=W.parse(original,'mps',catalog,[rule]);
 assert.equal(saved.producto_id,'black','La equivalencia confirmada prevalece sobre la inferencia por SKU');
 assert.equal(saved.precio_tienda,195000);assert.equal(saved.learned,true);
});
test('MPS: nombres exactos no mezclan RAM, color, conectividad ni números de parte ambiguos o inactivos',()=>{
 const catalog=[
  {id:'4g',codigo:'A4',nombre:'REDMI 17 4G 4+128GB Black',activo:true},
  {id:'5g',codigo:'A5',nombre:'REDMI 17 5G 4+128GB Black',activo:true},
  {id:'ram',codigo:'A6',nombre:'REDMI 17 4G 6+128GB Black',activo:true},
  {id:'white',codigo:'AW',nombre:'REDMI 17 4G 4+128GB White',activo:true},
  {id:'off',codigo:'INACTIVE',nombre:'Referencia inactiva',activo:false}
 ];
 for(const p of catalog.slice(0,4))assert.equal(W.parse(p.nombre+' ; IVA INCLUIDO $482.000','mps',catalog)[0].producto_id,p.id);
 assert.equal(W.parse('REDMI 17 4+128GB ; IVA INCLUIDO $482.000','mps',catalog)[0].producto_id,'');
 assert.equal(W.parse('Referencia inactiva ; Garantía 1 año $482.000','mps',catalog)[0].producto_id,'');
 assert.equal(W.parse(catalog[0].nombre+' ; SKU INACTIVE $482.000','mps',catalog)[0].producto_id,'','No sustituye un SKU inactivo por otro producto de nombre parecido');
 const duplicate=[...catalog,{id:'duplicate',codigo:'A4',nombre:'Otro producto',activo:true}];
 assert.equal(W.parse(catalog[0].nombre+' ; Número de parte A4 $482.000','mps',duplicate)[0].producto_id,'','Un SKU duplicado no cae al nombre para elegir');
 assert.equal(W.parse(catalog[0].nombre+' ; SKU A4 ; Número de parte A5 $482.000','mps',catalog)[0].producto_id,'');
 assert.equal(W.parse(catalog[0].nombre+' ; IVA INCLUIDO $482.000','mps',[...catalog,{id:'duplicate-name',codigo:'OTHER',nombre:catalog[0].nombre}])[0].producto_id,'');
 const ref=catalog[0].nombre+' ; IVA INCLUIDO',key=ref.toUpperCase();
 const rule={proveedor_id:'mps',referencia_key:key,producto_id:'off',margen:20000,motivo:''};
 assert.equal(W.parse(ref+' $482.000','mps',catalog,[rule])[0].producto_id,'');
 assert.equal(W.parse(ref+' $482.000','mps',catalog,[{...rule,producto_id:'4g'},{...rule,producto_id:'5g'}])[0].producto_id,'');
});
test('correo: destinatarios fijos, nombres, valores del pedido, escape y envío incierto sin reintento ciego',async()=>{
 const r={id:'test',numero:'PED-000001',tienda:'Chinucell',ciudad:'Chinú',fecha:'2026-09-17T15:00:00Z',nota:'<script>alert(1)</script>',items:[{referencia:'REDMI 17',cantidad:2,precio:502000,costo:482000,proveedor:'MPS'}]};
 const html=renderReport(r);assert.match(html,/Chinucell/);assert.match(html,/1.004.000/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
 assert.deepEqual(RECIPIENTS,['gestion@crediteksas.com','comercial@crediteksas.com']);assert.ok(buildRaw(r));
 let calls=0;const result=await deliver(r,{},async()=>{calls++;return calls===1?new Response(JSON.stringify({access_token:'mock'})):new Response('',{status:503});});assert.equal(result.outcome,'ambiguous');assert.equal(calls,2);
});
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('base: memoria e historia privadas, publicación idempotente y avisos exactamente una vez por pedido',async()=>{
 const db=new PGlite();try{
 // Reuse the canonical fixture, not any production data.
 const source=readFileSync(new URL('./b2b-listas.test.mjs',import.meta.url),'utf8');
 const fixture=source.slice(source.indexOf('await db.exec(`')+15,source.indexOf('`);',source.indexOf('await db.exec(`'))).replace(/\$\{uid\((\d+)\)\}/g,(_,n)=>uid(n));
 await db.exec(fixture);
 await db.exec(`create role service_role bypassrls;create schema kora_private;create schema cron;create function cron.schedule(text,text,text) returns int language sql as $$select 1$$;alter table origenes add column ciudad text;alter table pedidos_b2b add column solicitado_at timestamptz default now();`);
 for(const file of ['20260917174237_listas_precios_pedidos_kora.sql','20260917220853_b2b_catalogo_whatsapp_memoria.sql','20260917220854_b2b_pedidos_correo.sql'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec('grant usage on schema public,kora_private to service_role;grant select on all tables in schema public to service_role;');
 const as=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false);set role authenticated;`);
 const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await as(2);
 await query('select guardar_regla_catalogo_b2b($1,$2,$3,20000,\'\')',[uid(20),'SM17',uid(10)]);
 assert.equal((await query('select * from b2b_catalogo_reglas')).length,1);
 assert.equal((await query("select * from b2b_aura_memoria where tipo='regla'")).length,83);
 const rows=[{row:1,reference:'SM17',original:'SM17 $430.000',producto_id:uid(10),proveedor_id:uid(20),costo:430000,precio_tienda:450000,motivo:'',included:true}];
 const [{id}]=await query('select guardar_borrador_catalogo_b2b($1,$2,$3::jsonb) id',[uid(20),'SM17 $430.000',JSON.stringify(rows)]);
 const [p]=await query('select publicar_borrador_catalogo_b2b($1) r',[id]);assert.ok(p.r.id);assert.equal((await query('select publicar_borrador_catalogo_b2b($1) r',[id]))[0].r.repetida,true);
 await as(3);assert.equal((await query('select * from b2b_catalogo_reglas')).length,0);assert.equal((await query('select * from b2b_aura_memoria')).length,0);assert.equal((await query('select * from b2b_catalogo_borradores')).length,0);
 await assert.rejects(()=>query('select guardar_regla_catalogo_b2b($1,$2,$3)',[uid(20),'SM17',uid(10)]),/administración/);
 await assert.rejects(()=>query('select publicar_borrador_catalogo_b2b($1)',[id]),/administración/);
 const [offer]=await query('select * from catalogo_pedidos_b2b()');
 const orderArgs=[JSON.stringify([{producto_id:offer.id,cantidad:2,precio_catalogo:Number(offer.precio_guia),version_precio:offer.version_precio}]),'Destino propio',uid(99)];
 const [{r:order}]=await query('select crear_pedido_catalogo_b2b($1::jsonb,$2,$3) r',orderArgs);await query('select crear_pedido_catalogo_b2b($1::jsonb,$2,$3) r',orderArgs);
 assert.equal((await query('select * from b2b_pedido_avisos')).length,1);
 await as(4);assert.equal((await query('select * from b2b_pedido_avisos')).length,0);
 await db.exec('reset role');const [job]=await query('select * from kora_private.b2b_pedido_mail_jobs');assert.equal(job.pedido_id,order.pedido_id);
 await db.exec('set role service_role');assert.equal((await query('select kora_claim_b2b_pedido_mail($1,$2) r',[job.pedido_id,uid(999)]))[0].r,null);
 const [claimed]=await query('select kora_claim_b2b_pedido_mail($1,$2) r',[job.pedido_id,job.token]);assert.equal(claimed.r.items.length,1);assert.equal(claimed.r.items[0].cantidad,2);
 assert.equal((await query('select kora_claim_b2b_pedido_mail($1,$2) r',[job.pedido_id,job.token]))[0].r,null);
 await query("select kora_finish_b2b_pedido_mail($1,$2,'sent','mockMessage')",[job.pedido_id,job.token]);assert.equal((await query('select estado from b2b_pedido_avisos'))[0].estado,'enviado');
 await db.exec('reset role;set role anon');await assert.rejects(()=>query('select * from b2b_aura_memoria'),/permission denied/);
 }finally{await db.close();}
});
