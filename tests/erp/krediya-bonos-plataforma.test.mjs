import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
import vm from 'node:vm';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('reporte filtra la fecha de cada crédito y distingue créditos de bonos sin ocultar el histórico',async()=>{
 const src=await read('../../creditek/erp/aliados-v1-1-app.js');
 const nodes={'#bonusToolbar':{},'#bonusFrom':{value:'2026-08-25'},'#bonusTo':{value:'2026-08-25'},'#bonusPlatform':{value:'krediya'},'#bonusExecutive':{value:''},'#bonusState':{value:''},'#content':{}};
 let cards;
 const ctx={$:x=>nodes[x],db:{liquidations:[{id:'k',plataforma:'krediya'},{id:'p',plataforma:'payjoy'}],beneficiaries:[{id:'a',nombre:'Ejecutivo'},{id:'b',nombre:'Gestión'}],operations:[{id:'o1',liquidation_id:'k',day:'2026-08-24'},{id:'o2',liquidation_id:'k',day:'2026-08-25'},{id:'o3',liquidation_id:'p',day:'2026-08-25'}],bonuses:[{operation_id:'o1',liquidation_id:'k',beneficiary_id:'a',valor:30000},{operation_id:'o2',liquidation_id:'k',beneficiary_id:'a',valor:30000},{operation_id:'o2',liquidation_id:'k',beneficiary_id:'b',valor:5000},{operation_id:'o3',liquidation_id:'p',beneficiary_id:'a',valor:20000}]},operationIsCurrent:()=>true,operationSaleDay:o=>o.day,metrics:x=>cards=x,cop:String,sum:(a,k)=>a.reduce((n,x)=>n+Number(x[k]||0),0),esc:String,table:()=>'',rows:()=>[],badge:String,platformName:String};
 vm.runInNewContext(src.slice(src.indexOf('  function renderBonuses()'),src.indexOf('  function populateExpenseForm()')),ctx);
 ctx.renderBonuses();
 assert.equal(cards.find(x=>x[0]==='Créditos con bono')[1],1);
 assert.equal(cards.find(x=>x[0]==='Bonos por beneficiario')[1],2);
 assert.equal(cards[0][1],'35000');
});
test('Krediya: 22 aliados + 7 propias = 66 bonos por 1.100.000, sin override; conserva otras plataformas y pagos',async()=>{
 const db=await PGlite.create({extensions:{unaccent}});
 try{
 await db.exec(`create role anon;create role authenticated;create extension unaccent;create schema auth;create schema kora_private;create schema krediya_private;
 create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
 create function tiene_capacidad_aliados(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'true')='true'$$;`);
 await db.exec(await read('./fixtures/calculo-antes-tesoreria.sql'));
 await db.exec(`create function kora_private.preparar_catalogo_liquidacion(uuid) returns void language sql as $$select$$;
 create function aliados_cambiar_estado(uuid,text,text) returns liquidations language sql as $$update public.liquidations set estado=$2 where id=$1 returning *$$;
 alter table payment_orders add unique(liquidation_id,beneficiary_id);
 alter table krediya_diferencias add unique(operation_id);
 insert into ejecutivos(nombre,esquema_comision) values('Alexander','{"tipo":"fijo","valor":30000}'),('Luis','{"tipo":"fijo_mas_override","valor_propio":20000,"valor_override_otros_ejecutivos":10000}'),('Mayte','{"tipo":"fijo_universal","valor":5000}');
 insert into liquidation_beneficiaries(nombre,tipo,ejecutivo_id) select nombre,'ejecutivo',id from ejecutivos;
 insert into liquidation_beneficiaries(nombre,tipo) values('Oscar','ejecutivo');
 insert into krediya_bonus_rules(tipo_establecimiento,valor,vigente_desde,concepto,beneficiary_id)
 select t,case when nombre='Oscar' then 15000 else 5000 end,'2026-08-01',case when nombre='Oscar' then 'operacion' else 'gestion_krediya' end,id from liquidation_beneficiaries cross join (values('aliado'),('propia')) x(t) where nombre in('Oscar','Mayte');
 insert into krediya_price_rules(referencia_clave,precio_venta,pagamos,vigente_desde) values('ref:test',1000000,750000,'2026-08-01');
 insert into origenes(codigo,nombre,tipo,ejecutivo_id) select 'A','Local','aliado',id from ejecutivos where nombre='Alexander';`);
 const migration=await read('../../supabase/migrations/20260908035826_krediya_bonos_solo_aliados_sin_override.sql');
 await db.exec(migration);
 const batch=(await db.query("insert into liquidations(plataforma) values('krediya') returning id")).rows[0].id;
 await db.query(`insert into liquidation_operations(liquidation_id,plataforma,tipo_establecimiento,origen_codigo,ejecutivo_id,operation_at,referencia,monto_credito,monto_base,inicial,reconocida,normalized_data)
 select $1,'krediya',case when n<=22 then 'aliado' else 'propia' end,'A',case when n<=22 then e.id end,'2026-08-25T17:00:00Z','test',900000,900000,100000,true,'{}' from generate_series(1,29) n cross join ejecutivos e where e.nombre='Alexander'`,[batch]);
 await db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[batch]);
 const totals=async()=>(await db.query(`select lb.nombre,count(*)::int n,sum(b.valor)::text total from liquidation_bonuses b join liquidation_beneficiaries lb on lb.id=b.beneficiary_id where b.liquidation_id=$1 group by 1 order by 1`,[batch])).rows;
 assert.deepEqual(await totals(),[{nombre:'Alexander',n:22,total:'660000.00'},{nombre:'Mayte',n:22,total:'110000.00'},{nombre:'Oscar',n:22,total:'330000.00'}]);
 assert.equal((await db.query('select total_bonos::text from liquidations where id=$1',[batch])).rows[0].total_bonos,'1100000.00');
 assert.equal((await db.query("select count(*)::int n from liquidation_operations where liquidation_id=$1 and tipo_establecimiento='propia' and bonos_aplicados<>0",[batch])).rows[0].n,0);
 const before=await totals(); await db.exec(migration); assert.deepEqual(await totals(),before);
 await db.query("update liquidations set frozen_at=now() where id=$1",[batch]);
 await assert.rejects(db.query('select krediya_private.calcular_y_enviar_aprobacion($1)',[batch]),/no editable/);
 await assert.rejects(db.query('select aliados_calcular_bonos_ejecutivos($1)',[batch]),/inmutable/);
 for(const platform of ['payjoy','alo','krediya']){
 const id=(await db.query('insert into liquidations(plataforma) values($1) returning id',[platform])).rows[0].id;
 await db.query(`insert into liquidation_operations(liquidation_id,plataforma,tipo_establecimiento,origen_codigo,ejecutivo_id,reconocida,operation_at) select $1,$2,'aliado','A',id,true,now() from ejecutivos where nombre='Alexander'`,[id,platform]);
 await db.query('select aliados_calcular_bonos_ejecutivos($1)',[id]);
 assert.equal((await db.query("select count(*)::int n from liquidation_bonuses where liquidation_id=$1 and tipo_bono='automatico_override'",[id])).rows[0].n,platform==='krediya'?0:1);
 if(platform==='krediya'){
 await db.query("update liquidation_operations set ejecutivo_id=(select id from ejecutivos where nombre='Luis') where liquidation_id=$1",[id]);
 await db.query('select aliados_calcular_bonos_ejecutivos($1)',[id]);
 assert.equal((await db.query("select valor::text from liquidation_bonuses where liquidation_id=$1 and tipo_bono='automatico_ejecutivo'",[id])).rows[0].valor,'20000.00');
 }
 }
 await db.exec("select set_config('test.allowed','false',false)");
 await assert.rejects(db.query('select aliados_calcular_bonos_ejecutivos($1)',[batch]),/No autorizado/);
 }finally{await db.close();}
});
