import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import D from '../../creditek/erp/b2b-listas-domain.js';
import W from '../../creditek/erp/b2b-whatsapp-domain.js';
import C from '../../creditek/erp/b2b-comparativo.js';
const migration=readFileSync(new URL('../../supabase/migrations/20260917174237_listas_precios_pedidos_kora.sql',import.meta.url),'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('utilidad por costo: límite de 150000, WhatsApp, Excel, memoria y comparativo',()=>{
 const products=[{id:'p',codigo:'ACC',nombre:'Accesorio'}],providers=[{id:'s',nombre:'Proveedor'}];
 for(const [cost,margin] of [[35000,4200],[60000,7200],[85000,10200],[120000,14400],[149999.99,18000],[150000,20000],[150000.01,20000]]){
  assert.equal(D.defaultMargin(cost),margin);
  const map={header:0,reference:0,provider:1,cost:2,price:-1,margin:-1};
  const [excel]=D.prepare([['r','p','c'],['ACC','Proveedor',cost]],map,products,providers);
  assert.equal(excel.precio_tienda,Math.round((cost+margin)*100)/100);assert.deepEqual(D.validate([excel]),[]);
  const rules=[{proveedor_id:'s',referencia_key:'ACC',producto_id:'p',margen:20000,motivo:''}];
  const [wa]=W.parse('ACC $'+cost,'s',products,rules);
  assert.equal(wa.precio_tienda,excel.precio_tienda,'La memoria de equivalencias no congela el margen estándar');
  const report=C.build({providers,products,offers:[],winners:[],drafts:[{id:'d',proveedor_id:'s',creado_at:'2026-09-18',filas:[wa]}]});
  assert.equal(report.drafts.length,1);
 }
 const row={row:1,producto_id:'p',proveedor_id:'s',costo:35000,precio_tienda:55000,motivo:'',included:true};
 assert.ok(D.validate([row]).some(x=>x.includes('margen especial')));
 assert.ok(D.validate([{...row,motivo:D.marginPolicy}]).length);
 assert.deepEqual(D.validate([{...row,motivo:'Excepción autorizada'}]),[]);
 const learned={proveedor_id:'s',referencia_key:'ACC',producto_id:'p',margen:10000,motivo:D.marginPolicy};
 assert.equal(W.parse('ACC $150000','s',products,[learned])[0].precio_tienda,170000);
 assert.equal(W.parse('ACC $35000','s',products,[{...learned,margen:15000,motivo:'Excepción autorizada'}])[0].precio_tienda,50000);
});

test('importación conserva costo real, margen variable, precio final y errores de origen',()=>{
 const products=[{id:'p',codigo:'SM17',nombre:'SM17 4/128GB'}],providers=[{id:'s',nombre:'Proveedor A'}];
 const map={header:0,reference:0,provider:1,cost:2,price:3,margin:4};
 const rows=D.prepare([['ref','prov','costo','precio','margen'],['SM17','Proveedor A','430.000','',''],['SM17','Proveedor A',430000,445000,''],['SM17','Proveedor A',430000,'',0],['SM17','Proveedor A','',450000,'']],map,products,providers);
 assert.equal(rows[0].precio_tienda,450000);assert.equal(rows[1].precio_tienda,445000);assert.equal(rows[1].costo,430000);assert.equal(rows[2].precio_tienda,430000);assert.equal(rows[3].costo,null);assert.ok(D.validate(rows).length>0);
 assert.equal(D.amount('$ 430.000,50'),430000.5);assert.equal(D.amount('#VALUE!'),null);assert.equal(D.amount(''),null);
 const missing=D.prepare([['ref','prov','costo'],['SM17 8/256GB','Proveedor A',430000]],{...map,price:-1,margin:-1},products,providers);assert.equal(missing[0].producto_id,'');
 assert.match(D.csv([['=HYPERLINK("evil")']]),/"'=HYPERLINK/);
});
test('servidor: costo privado, ganador real, precios congelados, idempotencia y aislamiento por tienda',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table perfiles(id uuid primary key,nombre text,rol text,tienda_codigo text,activo boolean);
 create table origenes(codigo text primary key,nombre text,tipo text,activo boolean);
 create table productos(id uuid primary key,codigo text,nombre text,categoria text,foto_url text,activo boolean);
 create table proveedores(id uuid primary key,nombre text,activo boolean);
 create table pedidos_b2b(id uuid primary key default gen_random_uuid(),consecutivo bigint generated always as identity,tienda_codigo text,nota text,creado_por uuid default auth.uid(),estado text default 'solicitado',updated_at timestamptz default now());
 create table pedido_b2b_items(id uuid primary key default gen_random_uuid(),pedido_id uuid,producto_id uuid,cantidad_solicitada int,precio_catalogo numeric,cantidad_ordenada int default 0);
 create table ordenes_compra(id uuid primary key default gen_random_uuid(),consecutivo bigint generated always as identity,proveedor_id uuid,nota text);
 create table orden_compra_items(orden_id uuid,pedido_item_id uuid,producto_id uuid,tienda_destino text,cantidad_ordenada int,costo_cotizado numeric,precio_tienda_cotizado numeric);
 insert into perfiles values('${uid(1)}','Gerencia','gerencia',null,true),('${uid(2)}','Maite','auditoria',null,true),('${uid(3)}','Tienda A','admin_tienda','A',true),('${uid(4)}','Tienda B','asesor','B',true),('${uid(5)}','Inactivo','admin_tienda','A',false);
 insert into origenes values('A','Tienda A','propia',true),('B','Tienda B','propia',true);
 insert into productos values('${uid(10)}','SM17','SM17 4/128','CELULAR',null,true),('${uid(11)}','ACC1','Cable','ACC_CELULAR',null,true);
 insert into proveedores values('${uid(20)}','Proveedor A',true),('${uid(21)}','Proveedor B',true);
 alter table pedidos_b2b enable row level security;alter table pedido_b2b_items enable row level security;
 create policy own_order on pedidos_b2b for select to authenticated using(tienda_codigo=(select tienda_codigo from perfiles where id=auth.uid() and activo));
 create policy own_lines on pedido_b2b_items for select to authenticated using(exists(select 1 from pedidos_b2b where id=pedido_id));
 grant usage on schema public,auth to authenticated;grant select on perfiles,pedidos_b2b,pedido_b2b_items,productos,proveedores to authenticated;`);
 await db.exec(migration);
 const as=async n=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false);set role authenticated;`);};
 const sql=async(q,args=[])=>(await db.query(q,args)).rows;
 const publish=async(rows,hash='a',scope='catalogo')=>sql('select publicar_lista_b2b($1,$2,$3,$4::jsonb) r',['lista.xlsx',hash.repeat(64),scope,JSON.stringify(rows)]);
 const row=(p,s,c,v)=>({producto_id:uid(p),proveedor_id:uid(s),costo:c,precio_tienda:v,motivo:v-c===20000?'':'Precio final del comparativo'});
 await as(2);
 const publication=await publish([row(10,20,430000,450000),row(10,21,420000,445000),row(11,20,5000,12000)]);
 assert.ok(publication[0].r.id);
 assert.equal((await publish([row(10,20,430000,450000)]))[0].r.repetida,true);
 await assert.rejects(()=>publish([{...row(10,20,430000,445000),motivo:''}],'b'),/motivo/);
 await assert.rejects(()=>publish([{...row(10,20,430000,450000),costo:null}],'b'),/Costo/);
 await as(3);
 const catalogue=await sql('select * from catalogo_pedidos_b2b()');assert.equal(catalogue.length,2);
 const phone=catalogue.find(r=>r.id===uid(10));assert.equal(Number(phone.precio_guia),445000);
 assert.deepEqual(Object.keys(phone).sort(),['id','codigo','nombre','categoria','foto_url','precio_guia','version_precio'].sort());
 assert.equal((await sql('select * from b2b_ofertas')).length,0);assert.equal((await sql('select * from b2b_listas_precios')).length,0);assert.equal((await sql('select * from b2b_mejor_oferta')).length,0);
 await assert.rejects(()=>publish([row(10,20,1,20001)],'b'),/Solo/);
 const item={producto_id:phone.id,cantidad:3,precio_catalogo:Number(phone.precio_guia),version_precio:phone.version_precio};
 const order=async(items,key=uid(40))=>sql('select crear_pedido_catalogo_b2b($1::jsonb,$2,$3::uuid) r',[JSON.stringify(items),'Pedido prueba',key]);
 await assert.rejects(()=>order([{...item,precio_catalogo:1}]),/lista cambió/);
 await assert.rejects(()=>order([{...item,cantidad:1.5}]),/Cantidad/);
 await assert.rejects(()=>order([item,item]),/duplicada/);
 const result=(await order([item]))[0].r;assert.ok(result.pedido_id);assert.equal((await order([item]))[0].r.pedido_id,result.pedido_id);
 assert.equal((await sql('select * from pedidos_b2b')).length,1);assert.equal((await sql('select * from b2b_pedido_fuente')).length,0);
 await as(4);assert.equal((await sql('select * from pedidos_b2b')).length,0);assert.equal((await sql('select * from pedido_b2b_items')).length,0);
 await as(5);await assert.rejects(()=>sql('select * from catalogo_pedidos_b2b()'),/autorizado/);
 await as(1);await publish([row(10,20,400000,420000)],'c');
 const frozen=await sql('select o.costo,o.precio_tienda from b2b_pedido_fuente f join b2b_ofertas o on o.id=f.oferta_id');assert.equal(Number(frozen[0].costo),420000);assert.equal(Number(frozen[0].precio_tienda),445000);
 await db.exec('reset role');const line=(await sql('select id from pedido_b2b_items'))[0].id;
 await as(2);const purchase=async(qty)=>sql('select crear_orden_compra_b2b($1::uuid,$2::jsonb,null) r',[uid(21),JSON.stringify([{pedido_item_id:line,cantidad:qty,costo_unitario:420000,precio_tienda:445000}])]);
 await purchase(1);await purchase(2);await assert.rejects(()=>purchase(1),/pendiente/);
 await as(3);await assert.rejects(()=>order([item],uid(41)),/lista cambió/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>sql('select * from catalogo_pedidos_b2b()'),/permission denied/);
 }finally{await db.close();}
});
test('pantalla consulta solo catálogo publicado para tiendas y no manda pedidos al enlace heredado',()=>{
 const page=readFileSync(new URL('../../creditek/erp/pedidos-b2b.html',import.meta.url),'utf8');
 const store=page.slice(page.indexOf('async function loadStore'),page.indexOf('function renderCatalog'));
 assert.match(store,/catalogo_pedidos_b2b/);assert.doesNotMatch(store,/from\('productos'\)/);assert.doesNotMatch(page,/LEGACY_NOTICE_URL|guardar_pedido|script.google.com/);
 assert.match(page,/Descargar pedidos pendientes/);assert.match(page,/crear_pedido_catalogo_b2b/);
 assert.match(page,/id="loadIssue".*role="alert"/);assert.match(page,/catch\(showLoadError\)/);
 assert.match(page,/catch\(e\)\{showLoadError\(e\);\}/);assert.match(page,/Creditek aún no ha publicado referencias/);
});

test('migración de utilidad: respalda borradores, preserva costos/publicados y valida en servidor',async()=>{
 const db=new PGlite();try{
  const source=readFileSync(new URL('./b2b-listas.test.mjs',import.meta.url),'utf8');
  const start=source.indexOf('await db.'+'exec(`create role anon');
  const fixture=source.slice(start+15,source.indexOf('`);',start)).replace(/\$\{uid\((\d+)\)\}/g,(_,n)=>uid(n));
  await db.exec(fixture);await db.exec('create schema kora_private;');
  await db.exec(migration);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260917220853_b2b_catalogo_whatsapp_memoria.sql',import.meta.url),'utf8'));
  await db.exec(`select set_config('request.jwt.claim.sub','${uid(1)}',false);`);
  const line=(cost,margin=20000,motivo='')=>({row:1,reference:'ACC1',producto_id:uid(11),proveedor_id:uid(20),costo:cost,precio_tienda:cost+margin,motivo,included:true});
  const original=[line(35000),line(60000),line(85000),line(150000),line(35000,15000,'Excepción autorizada'),{...line(0),costo:null}];
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const [{id}]=await q('select guardar_borrador_catalogo_b2b($1,$2,$3::jsonb) id',[uid(20),'Lista original',JSON.stringify(original)]);
  const [{r:published}]=await q('select publicar_lista_b2b($1,$2,$3,$4::jsonb) r',['viejo','a'.repeat(64),'proveedores',JSON.stringify([line(35000)])]);
  const [{id:oldId}]=await q('select guardar_borrador_catalogo_b2b($1,$2,$3::jsonb) id',[uid(20),'Ya publicada',JSON.stringify([line(35000)])]);
  await q('update b2b_catalogo_borradores set lista_id=$1 where id=$2',[published.id,oldId]);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260918163447_b2b_margen_12pct_menor_150mil.sql',import.meta.url),'utf8'));
  const [{filas}]=await q('select filas from b2b_catalogo_borradores where id=$1',[id]);
  assert.deepEqual(filas.map(r=>r.precio_tienda),[39200,67200,95200,170000,50000,20000]);
  assert.deepEqual(filas.map(r=>r.costo),original.map(r=>r.costo));
  assert.deepEqual((await q('select filas_antes from kora_private.b2b_margen_20260918_respaldo'))[0].filas_antes,original);
  assert.equal((await q('select filas from b2b_catalogo_borradores where id=$1',[oldId]))[0].filas[0].precio_tienda,55000);
  assert.equal(Number((await q('select precio_tienda from b2b_ofertas'))[0].precio_tienda),55000);
  await db.exec('set role authenticated');
  await assert.rejects(()=>q('select * from kora_private.b2b_margen_20260918_respaldo'),/permission denied/);
  const publish=rows=>q('select publicar_lista_b2b($1,$2,$3,$4::jsonb) r',['actual','b'.repeat(64),'proveedores',JSON.stringify(rows)]);
  await assert.rejects(()=>publish([line(35000)]),/margen especial/);
  await assert.rejects(()=>publish([line(35000,20000,D.marginPolicy)]),/margen especial/);
  assert.ok((await publish([line(35000,4200)]))[0].r.id);
  await q('select guardar_regla_catalogo_b2b($1,$2,$3,$4,$5)',[uid(20),'ACC1',uid(11),4200,D.marginPolicy]);
 }finally{await db.close();}
});
