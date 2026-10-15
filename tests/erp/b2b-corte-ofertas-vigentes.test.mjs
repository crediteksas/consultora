import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import C from '../../creditek/erp/b2b-cierres.js';

const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration=read('../../supabase/migrations/20261015151937_b2b_corte_ofertas_vigentes.sql');
async function fixture(){
 const db=new PGlite();
 const source=read('./b2b-listas.test.mjs'),start=source.indexOf('await db.'+'exec(`create role anon');
 await db.exec(source.slice(start+15,source.indexOf('`);',start)).replace(/\$\{uid\((\d+)\)\}/g,(_,n)=>uid(n)));
 await db.exec(`create role service_role bypassrls;create schema kora_private;
 grant usage on schema kora_private to authenticated,service_role;
 create schema cron;create function cron.schedule(text,text,text) returns int language sql as $$select 1$$;
 alter table origenes add column ciudad text;alter table pedidos_b2b add column solicitado_at timestamptz default now();
 create policy admin_orders on pedidos_b2b for select to authenticated using(exists(select 1 from perfiles where id=auth.uid() and activo and rol in('gerencia','auditoria')));
 grant select on origenes,ordenes_compra to authenticated;`);
 await db.exec(read('../../supabase/migrations/20260917174237_listas_precios_pedidos_kora.sql'));
 await db.exec(read('../../supabase/migrations/20260918152850_b2b_cierre_periodo_consolidado.sql'));
 await db.exec(`create table b2b_referencias_catalogo(producto_id uuid primary key,referencia_id uuid,nombre_pedido text);
 grant select on b2b_referencias_catalogo to authenticated;
 create function public.nombre_referencia_pedido_b2b(uuid,text) returns text language sql as $$select $2$$;
 insert into productos values('${uid(12)}','SM17-B','SM17 azul 4/128','CELULAR',null,true);
 insert into b2b_referencias_catalogo values('${uid(10)}','${uid(10)}','SM17 4/128'),('${uid(12)}','${uid(10)}','SM17 4/128');
 create or replace view b2b_mejor_oferta with(security_invoker=true) as
 select distinct on(coalesce(m.referencia_id,o.producto_id)) o.id,o.lista_id,coalesce(m.referencia_id,o.producto_id) as producto_id,o.proveedor_id,o.costo,o.precio_tienda,o.motivo,o.vigente
 from b2b_ofertas o join productos p on p.id=o.producto_id and p.activo join proveedores v on v.id=o.proveedor_id and v.activo
 left join b2b_referencias_catalogo m on m.producto_id=o.producto_id
 join productos canon on canon.id=coalesce(m.referencia_id,o.producto_id) and canon.activo
 where o.vigente order by coalesce(m.referencia_id,o.producto_id),o.costo,o.precio_tienda,o.proveedor_id,o.id;`);
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const as=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false);set role authenticated;`);
 const publish=async(supplier,cost,hash,product=10)=>(await q('select publicar_lista_b2b($1,$2,$3,$4::jsonb) r',[
  'lista',hash.repeat(64),'proveedores',JSON.stringify([{producto_id:uid(product),proveedor_id:uid(supplier),costo:cost,precio_tienda:cost+20000}])]))[0].r;
 const request=async key=>{await as(3);const [p]=await q('select * from catalogo_pedidos_b2b() where id=$1',[uid(10)]);
  const [{r}]=await q('select crear_pedido_catalogo_b2b($1::jsonb,null,$2) r',[JSON.stringify([{producto_id:p.id,cantidad:2,precio_catalogo:Number(p.precio_guia),version_precio:p.version_precio}]),uid(key)]);await as(2);return r;};
 const preview=async ids=>(await q('select vista_previa_cierre_b2b($1) r',[ids||null]))[0].r;
 const close=async(p,key)=>(await q('select cerrar_periodo_pedidos_b2b($1,$2,$3) r',[p.pedido_ids,p.huella,uid(key)]))[0].r;
 const buy=async(line,supplier,cost,price,quantity=1,note=null)=>(await q('select crear_orden_compra_b2b($1,$2::jsonb,$3) r',[
  uid(supplier),JSON.stringify([{pedido_item_id:line,cantidad:quantity,costo_unitario:cost,precio_tienda:price}]),note]))[0].r;
 return {db,q,as,publish,request,preview,close,buy};
}

test('corte vigente: recalcula proveedor/costo/retail, rechaza huella antigua y mantiene pedido e historial',async()=>{
 const {db,q,as,publish,request,preview,close,buy}=await fixture();
 try{
  await as(1);await publish(20,400000,'a');
  const first=await request(100),before=await preview();
  const originalItems=await q('select * from pedido_b2b_items order by id');
  const originalSources=await q('select * from b2b_pedido_fuente order by pedido_item_id');
  const originalClosure=(await close(before,199)); // Un cierre anterior a la migración.
  await db.exec('reset role');await db.exec(migration);await as(2);
  assert.equal((await q('select reporte from b2b_cierres where id=$1',[originalClosure.id]))[0].reporte.items[0].costo,400000);
  const second=await request(101),old=await preview();
  await as(1);await publish(21,350000,'b',12);await as(2);
  const fresh=await preview();assert.equal(fresh.items[0].proveedor_id,uid(21));
  assert.equal(fresh.items[0].costo,350000);assert.equal(fresh.items[0].precio,370000);
  assert.equal(fresh.items[0].origen.proveedor_id,uid(20));assert.equal(fresh.items[0].origen.precio,420000);
  assert.equal(fresh.items[0].producto_id,uid(10));assert.ok(fresh.items[0].oferta_id);
  assert.equal(fresh.politica,'ofertas_vigentes_al_cierre');assert.notEqual(fresh.huella,old.huella);
  await assert.rejects(()=>close(old,200),/precios o proveedores cambiaron/);
  assert.deepEqual((await q('select id from b2b_cierres')).map(x=>x.id),[originalClosure.id]);
  // Borradores y proveedores inactivos no sustituyen ofertas vigentes.
  await db.exec('reset role;create table b2b_catalogo_borradores(filas jsonb);');
  await q('insert into b2b_catalogo_borradores values($1::jsonb)',[JSON.stringify([{producto_id:uid(10),costo:1}])]);
  await q('update proveedores set activo=false where id=$1',[uid(21)]);await as(2);
  assert.equal((await preview()).items[0].proveedor_id,uid(20));
  await db.exec('reset role');await q('update proveedores set activo=true where id=$1',[uid(21)]);await as(2);
  const reviewed=await preview(),closed=await close(reviewed,201);
  assert.equal((await close(reviewed,201)).id,closed.id);assert.equal((await close(reviewed,201)).repetido,true);
  assert.deepEqual((await preview()).pedido_ids,[]);
  assert.equal((await q('select count(*)::int n from ordenes_compra'))[0].n,0);
  assert.equal((await q('select estado from pedidos_b2b where id=$1',[second.pedido_id]))[0].estado,'solicitado');
  assert.deepEqual(await q('select * from pedido_b2b_items where pedido_id=$1 order by id',[first.pedido_id]),originalItems);
  assert.deepEqual(await q('select * from b2b_pedido_fuente where pedido_item_id=$1',[originalItems[0].id]),originalSources);
  const line=reviewed.items[0].item_id;
  const [source]=await q('select * from fuentes_compra_pendientes_b2b() where pedido_item_id=$1',[line]);
  assert.equal(source.proveedor_id,uid(21));assert.equal(Number(source.precio_tienda),370000);
  assert.deepEqual(await q('select * from fuentes_compra_pendientes_b2b($1)',[[line]]),[source]);
  assert.deepEqual(await q('select * from fuentes_compra_pendientes_b2b($1)',[[]]),[]);
  // Una publicación posterior no modifica ni el cierre ni las compras preparadas.
  await as(1);await publish(20,300000,'c');await as(2);
  const [locked]=await q('select * from fuentes_compra_pendientes_b2b() where pedido_item_id=$1',[line]);
  assert.deepEqual(locked,source);
  assert.equal((await q('select reporte from b2b_cierres where id=$1',[closed.id]))[0].reporte.items[0].costo,350000);
  await assert.rejects(()=>buy(line,20,300000,320000),/otro proveedor/);
  await assert.rejects(()=>buy(line,21,340000,360000),/Explica/);
  await buy(line,21,350000,370000);
  await buy(line,21,350000,370000);
  await assert.rejects(()=>buy(line,21,350000,370000),/pendiente/);
  assert.equal(Number((await q('select precio_catalogo from pedido_b2b_items where id=$1',[line]))[0].precio_catalogo),420000);
  // Un corte histórico sin campos nuevos sigue preparando el proveedor original.
  const legacy=(await q('select * from fuentes_compra_pendientes_b2b() where pedido_item_id=$1',[originalItems[0].id]))[0];
  assert.equal(legacy.proveedor_id,uid(20));assert.equal(Number(legacy.costo),400000);
  await buy(originalItems[0].id,20,400000,420000);
  await as(3);await assert.rejects(()=>q('select * from fuentes_compra_pendientes_b2b()'),/Administración/);
  await assert.rejects(()=>preview(),/Administración/);
  await assert.rejects(()=>close(reviewed,202),/Administración/);
  await db.exec('reset role;set role anon');
  await assert.rejects(()=>q('select * from fuentes_compra_pendientes_b2b()'),/permission denied/);
  await assert.rejects(()=>preview(),/permission denied/);
 }finally{await db.close();}
});

test('sin oferta vigente no usa el precio antiguo y una compra existente no se recalcula',async()=>{
 const {db,q,as,publish,request,preview,close,buy}=await fixture();
 try{
  await as(1);await publish(20,400000,'a');await request(100);await db.exec('reset role');await db.exec(migration);await as(2);
  const valid=await preview(),line=valid.items[0].item_id;
  await db.exec('reset role;update b2b_ofertas set vigente=false');await as(2);
  const missing=await preview();assert.equal(missing.items[0].costo,null);assert.equal(missing.items[0].precio,null);
  assert.equal(C.totals(missing.items).retail,null);assert.match(C.closureIssue(missing),/oferta publicada vigente/);
  await assert.rejects(()=>close(missing,200),/oferta publicada vigente/);
  await db.exec('reset role;update b2b_ofertas set vigente=true');await as(2);
  await buy(line,20,400000,420000); // Flujo anterior sin corte sigue siendo compatible.
  const ordered=await preview();assert.match(C.closureIssue(ordered),/compras ya creadas/);
  await assert.rejects(()=>close(ordered,201),/compras ya creadas/);
  assert.equal((await q('select count(*)::int n from b2b_cierres'))[0].n,0);
 }finally{await db.close();}
});

test('UI: actualización explícita antes de confirmar, fuente del cierre en compras y CSV coherente',()=>{
 const page=read('../../creditek/erp/pedidos-b2b.html'),ui=read('../../creditek/erp/b2b-cierres.js');
 for(const [,script] of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(script);
 assert.match(page,/rpc\('fuentes_compra_pendientes_b2b'\)/);
 assert.match(page,/source\?\.precio_tienda\?\?''/);assert.match(page,/s\?\.precio_tienda\?\?''/);
 assert.match(page,/onClosed:loadManagement/);
 assert.match(ui,/onclick=async\(\)=>\{await refresh\(\);if\(closureIssue\(preview\)\)return/);
 assert.match(ui,/Los borradores no participan/);assert.match(ui,/Antes:/);
 assert.match(ui,/p_huella:preview.huella/);assert.match(migration,/pg_advisory_xact_lock\(726041701\)/);
 const purchase=migration.slice(migration.indexOf('create or replace function public.crear_orden_compra_b2b'));
 assert.equal((purchase.match(/public\.fuentes_compra_pendientes_b2b\(/g)||[]).length,1);
 assert.ok(purchase.indexOf('public.fuentes_compra_pendientes_b2b(')<purchase.indexOf('for v_item in'));
 assert.match(migration,/p_item_ids is null or i.id=any\(p_item_ids\)/);
 assert.equal(C.changed({proveedor_id:'a',costo:10,precio:20}),false);
 assert.equal(C.changed({proveedor_id:'b',costo:10,precio:20,origen:{proveedor_id:'a',costo:10,precio:20}}),true);
 assert.equal(C.changed({proveedor_id:'a',costo:10,precio:20,origen:{proveedor_id:'a',costo:'10',precio:'20'}}),false);
});
