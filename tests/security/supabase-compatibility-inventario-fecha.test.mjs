import test from'node:test';import assert from'node:assert/strict';import{readFile,mkdtemp,writeFile,mkdir,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{createHash}from'node:crypto';import{verifyPriorNativeEvidence}from'../../scripts/supabase-compat/release-gate.mjs';import{checkFechaTriggers}from'../../scripts/supabase-compat/inventario-fecha-contract.mjs';import{combinedDb,applyCombined}from'../erp/fixtures/inventario-fecha-permisos.mjs';
for(const scenario of['upgrade','rebuild'])test('fecha inventario: permisos combinados '+scenario,async()=>{
 const db=await combinedDb(scenario);try{
  const query=await readFile('scripts/supabase-compat/catalog-query.sql','utf8');const before=Object.values((await db.query(query)).rows[0])[0];
  await applyCombined(db);const after=Object.values((await db.query(query)).rows[0])[0];checkFechaTriggers(before,after);
  const changed=structuredClone(after);changed.triggers.push({...changed.triggers[0],name:'unexpected_trigger'});assert.throws(()=>checkFechaTriggers(before,changed),/Unreviewed trigger delta/);
  const f=(await db.query("select prosecdef,proacl::text from pg_proc where oid='inventario_control.cierre_utilidad_api(text,uuid,text)'::regprocedure")).rows[0];assert.equal(f.prosecdef,true);assert.match(f.proacl,/authenticated=X/);assert.doesNotMatch(f.proacl,/anon=X|service_role=X/);assert.doesNotMatch(f.proacl,/(^|[{,])=X/);
  const r=(await db.query("select relrowsecurity from pg_class where oid='inventario_control.ventas_fechas_conciliadas'::regclass")).rows[0];assert.equal(r.relrowsecurity,true);
  for(const role of['anon','authenticated','service_role']){await db.exec('reset role;set role '+role);for(const op of['select * from inventario_control.ventas_fechas_conciliadas','delete from inventario_control.ventas_fechas_conciliadas','truncate inventario_control.ventas_fechas_conciliadas',"insert into inventario_control.ventas_fechas_conciliadas default values","update inventario_control.ventas_fechas_conciliadas set motivo='No autorizado'"])await assert.rejects(db.query(op),e=>e.code==='42501');}
  await db.exec('reset role');await assert.rejects(db.exec('truncate inventario_control.ventas_fechas_conciliadas'),/inmutable/i);
 }finally{await db.close();}
});

test('evidencia nativa anterior sigue exigida y rechaza omisión o hashes alterados',async t=>{
 const release=JSON.parse(await readFile('config/kora-permission-release.json','utf8'));
 assert.equal((await verifyPriorNativeEvidence({root:process.cwd(),ref:release.prior_native_release,release})).ok,true);
 await assert.rejects(verifyPriorNativeEvidence({root:process.cwd(),ref:{...release.prior_native_release,sha256:'0'.repeat(64)},release}),/Evidence changed/);
 await assert.rejects(verifyPriorNativeEvidence({root:process.cwd(),ref:release.prior_native_release,release:{...release,isolation_tests:[]}}),/isolation test omitted/);
 const dir=await mkdtemp(path.join(tmpdir(),'kora-native-preservation-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const prior=JSON.parse(await readFile(release.prior_native_release.path,'utf8'));
 const body=JSON.stringify({complete:false,checks:[]}),hash=b=>createHash('sha256').update(b).digest('hex');
 await writeFile(path.join(dir,'native.json'),body);prior.native_result={path:'native.json',sha256:hash(body)};
 const raw=JSON.stringify(prior);await writeFile(path.join(dir,'prior.json'),raw);
 await assert.rejects(verifyPriorNativeEvidence({root:dir,ref:{path:'prior.json',sha256:hash(raw)},release}),/Prior native run/);
});
