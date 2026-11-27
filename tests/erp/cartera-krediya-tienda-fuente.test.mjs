import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261127203138_cobra_corte_tienda_fuente.sql');
const base=read('releases/cobra-krediya-20261125/db-tests/fixture.sql')+read('tests/fixtures/supabase-compat/cobra-krediya/setup.sql');
const user='11111111-1111-4111-8111-111111111111';
const row={contract:'fiction001',document:'111001',customer:'Ana Ejemplo',store:'Tienda Ficticia B',created:'2026-10-01',financed_cents:40000000,fee_cents:5000000,total_installments:12,frequency:15,cycled:3,paid:1,overdue:2,contract_status:'signed_approved'};
const save=(r,id,hash='a')=>`select public.cobra_krediya_save_cut('${id}',repeat('${hash}',64),'2026-10-01','2026-11-25','ficcion.xlsx','${JSON.stringify([r])}');`;
test('el corte usa tienda del archivo sin modificar liquidación, deuda ni pagos',async t=>{
 const db=await PGlite.create();try{
  await db.exec(base);await db.exec(read('supabase/migrations/20261126012515_cobra_krediya_cut_history.sql'));await db.exec(read('supabase/migrations/20261126013403_cobra_krediya_collection_operation_link.sql'));
  const before=(await db.query("select md5(pg_get_functiondef('public.cobra_krediya_prepare_cut()'::regprocedure)) as digest,proacl::text acl,prosecdef,proowner from pg_proc where oid='public.cobra_krediya_prepare_cut()'::regprocedure")).rows[0];
  const local=migration.replace('068b76530485172733853b40bf54df43',before.digest);await db.exec(local);
  const after=(await db.query("select proacl::text acl,prosecdef,proowner from pg_proc where oid='public.cobra_krediya_prepare_cut()'::regprocedure")).rows[0];assert.deepEqual(after,{acl:before.acl,prosecdef:before.prosecdef,proowner:before.proowner});
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
  await t.test('acepta distinta tienda, conserva fuente y vincula el mismo crédito',async()=>{
   const out=(await db.query(save(row,'22222222-2222-4222-8222-222222222221'))).rows[0].cobra_krediya_save_cut;assert.equal(out.row_count,1);
   const cut=(await db.query('select observations from public.cobra_krediya_cuts')).rows[0].observations[0];assert.equal(cut.store,'Tienda Ficticia B');assert.equal(cut.operation_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
   const source=(await db.query("select establishment_name,origen_codigo from public.liquidation_operations where external_id='fiction001'")).rows[0];assert.equal(source.establishment_name,'Tienda Ficticia A');assert.equal(source.origen_codigo,'FX-01');
  });
  await t.test('no acepta cliente, monto o fecha distintos',async()=>{
   for(const [idx,patch] of [{document:'999999'},{customer:'Otra Persona'},{financed_cents:1},{created:'2026-10-02'}].entries())await assert.rejects(db.exec(save({...row,...patch},`33333333-3333-4333-8333-33333333333${idx}`,String.fromCharCode(98+idx))),/cobra_identity_or_terms_mismatch/);
  });
  await db.exec('reset role;set role anon');await assert.rejects(db.exec(save(row,'44444444-4444-4444-8444-444444444444','f')),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query('select count(*) as n from public.credit_repayments')).rows[0].n,0);assert.equal((await db.query('select outstanding_amount from public.credit_portfolio_obligations')).rows[0].outstanding_amount,'350000');
 }finally{await db.close();}
});
