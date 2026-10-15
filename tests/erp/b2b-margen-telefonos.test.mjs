import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import D from '../../creditek/erp/b2b-listas-domain.js';
import W from '../../creditek/erp/b2b-whatsapp-domain.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('tramos estrictos de teléfonos, decimales y accesorios costosos',()=>{
 for(const [cost,expected] of [[90000,10800],[149999.99,18000],[150000,20000],[800000,20000],[800000.01,30000],[1300000,30000],[1300000.01,50000],[4940000,50000]])assert.equal(D.defaultMargin(cost,'CELULAR'),expected);
 for(const categoria of ['ACC_CELULAR','VARIEDADES','PARLANTES','',undefined]){
  assert.equal(D.defaultMargin(900000,categoria),20000);
  assert.equal(D.defaultMargin(4940000,categoria),20000);
 }
 assert.equal(D.defaultMargin(900000,' Celular '),30000);
 assert.equal(D.defaultMargin(1400000,'celular'),50000);
});
test('WhatsApp, Excel y memoria recalculan el estándar sin congelarlo',()=>{
 const products=[{id:'p',codigo:'PHONE',nombre:'Teléfono',categoria:'CELULAR'}],providers=[{id:'s',nombre:'Proveedor'}];
 const rules=[{proveedor_id:'s',referencia_key:'PHONE',producto_id:'p',margen:20000,motivo:'Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000'}];
 for(const cost of [800000,800000.01,1300000,1300000.01]){
  const [wa]=W.parse(`PHONE $${cost}`,'s',products,rules);
  const [excel]=D.prepare([['ref','costo'],['PHONE',cost]],{header:0,reference:0,cost:1,provider:-1,price:-1,margin:-1},products,providers,'s');
  assert.equal(wa.categoria,'CELULAR');assert.equal(wa.precio_tienda,cost+D.defaultMargin(cost,'CELULAR'));
  assert.equal(excel.precio_tienda,wa.precio_tienda);assert.deepEqual(D.validate([wa]),[]);assert.deepEqual(D.validate([excel]),[]);
 }
 const exception=W.parse('PHONE $900000','s',products,[{...rules[0],margen:40000,motivo:'Excepción autorizada'}])[0];
 assert.equal(exception.precio_tienda,940000);
});
test('recalcular borrador o vincular referencia conserva costos, bajo pedido y excepciones',()=>{
 const row={producto_id:'p',costo:900000,precio_tienda:920000,motivo:'',included:true};
 const result=D.repriceStandard(row,{categoria:'CELULAR'});
 assert.equal(result.precio_tienda,930000);assert.equal(result.costo,row.costo);assert.equal(row.precio_tienda,920000);
 assert.equal(D.repriceStandard({...row,motivo:'[BAJO PEDIDO] Confirmar entrega.'},{categoria:'CELULAR'}).precio_tienda,930000);
 assert.equal(D.repriceStandard({...row,motivo:'Precio final del archivo'},{categoria:'CELULAR'}).precio_tienda,920000);
 assert.equal(D.repriceStandard({...row,precio_tienda:940000},{categoria:'CELULAR'}).precio_tienda,940000);
 assert.equal(D.repriceStandard({...result,categoria:'CELULAR'},{categoria:'ACC_CELULAR'}).precio_tienda,920000);
 assert.ok(D.validate([{...row,categoria:'CELULAR',row:1,proveedor_id:'s'}]).some(x=>x.includes('margen especial')));
});
test('servidor usa categoría real, conserva publicaciones y permisos; no modifica pedidos',async()=>{
 const db=new PGlite();try{
  // Reutiliza el mismo escenario de roles, catálogo y pedidos de la suite B2B.
  const source=read('./b2b-listas.test.mjs'),start=source.indexOf('await db.'+'exec(`create role anon');
  const end=source.indexOf('`);',start);assert.ok(start>=0&&end>start,'El escenario compartido de B2B debe existir');
  const fixture=source.slice(start+15,end).replace(/\$\{uid\((\d+)\)\}/g,(_,n)=>uid(n));
  await db.exec(fixture);await db.exec('create schema kora_private;');
  for(const name of ['20260917174237_listas_precios_pedidos_kora','20260917220853_b2b_catalogo_whatsapp_memoria','20260918163447_b2b_margen_12pct_menor_150mil'])await db.exec(read(`../../supabase/migrations/${name}.sql`));
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  await db.exec(`select set_config('request.jwt.claim.sub','${uid(1)}',false);set role authenticated;`);
  let seq=0;
  const publish=rows=>q('select publicar_lista_b2b($1,$2,$3,$4::jsonb) r',['Regla teléfonos',(String(++seq).padStart(64,'0')),'proveedores',JSON.stringify(rows)]);
  const row=(cost,margin,product=10,motivo='')=>({producto_id:uid(product),proveedor_id:uid(20),costo:cost,precio_tienda:cost+margin,motivo});
  await publish([row(900000,20000)]);
  await db.exec('reset role');
  const before=await q('select id,costo,precio_tienda,vigente from b2b_ofertas order by id');
  await db.exec(read('../../supabase/migrations/20261015140353_b2b_margen_telefonos_por_tramos.sql'));
  assert.deepEqual(await q('select id,costo,precio_tienda,vigente from b2b_ofertas order by id'),before);
  await db.exec('set role authenticated');
  for(const [cost,margin] of [[800000,20000],[800000.01,30000],[1300000,30000],[1300000.01,50000]])assert.ok((await publish([row(cost,margin)]))[0].r.id);
  for(const motivo of ['',D.marginPolicy,'Política retail: costo menor de $150.000 + 12%; desde $150.000 + $20.000'])await assert.rejects(()=>publish([row(900000,20000,10,motivo)]),/margen especial/);
  assert.ok((await publish([row(1400000,20000,11)]))[0].r.id);
  await assert.rejects(()=>publish([{...row(1400000,50000,11),categoria:'CELULAR'}]),/margen especial/);
  assert.ok((await publish([row(900000,40000,10,'Excepción autorizada')]))[0].r.id);
  await db.exec(`reset role;update productos set categoria=' Celular ' where id='${uid(10)}';set role authenticated;`);
  assert.ok((await publish([row(900000,30000)]))[0].r.id);
  assert.equal((await q('select count(*)::int n from pedidos_b2b'))[0].n,0);
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(3)}',false);set role authenticated;`);
  await assert.rejects(()=>publish([row(900000,30000)]),/Solo Maite/);
 }finally{await db.close();}
});
