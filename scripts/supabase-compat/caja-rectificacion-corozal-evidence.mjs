import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {checkPermissionContract} from './check-permission-contract.mjs';

const folder='tests/fixtures/supabase-compat/caja-rectificacion-corozal';
const migration='supabase/migrations/20261109235216_caja_rectificacion_historica_ck02.sql';
const testPath='tests/security/supabase-compatibility-caja-rectificacion-corozal.test.mjs';
const read=file=>readFileSync(file,'utf8');
const hash=body=>createHash('sha256').update(body).digest('hex');
function pin(file,value){
  const body=JSON.stringify(value,null,2)+'\n';
  writeFileSync(file,body);
  return {path:file,sha256:hash(body)};
}

async function capture(scenario){
  const db=await PGlite.create();
  try{
    await db.exec(read(folder+'/fixture.sql'));
    if(scenario==='rebuild'){
      await db.exec('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;');
    }
    await db.exec(read('supabase/migrations/20260926221259_caja_primera_apertura_sin_doble_descuento.sql'));
    const catalog=async()=>{
      const snapshot=Object.values((await db.query(read('scripts/supabase-compat/catalog-query.sql'))).rows[0])[0];
      delete snapshot.captured_at;
      return snapshot;
    };
    const before=await catalog();
    await db.exec(read(migration));
    const after=await catalog();
    const rpc=new Set(['preparar_rectificacion_corozal','listar_rectificaciones_corozal','soporte_rectificacion_corozal','decidir_rectificacion_corozal']);
    const functions=after.functions.filter(f=>rpc.has(f.name)||['exigir_actor_rectificacion_corozal','verificar_cierre_corozal','caja_calcular_interno'].includes(f.name));
    const table=after.relations.find(r=>r.schema==='kora_private'&&r.name==='rectificacion_cierre_corozal');
    assert.equal(functions.length,7);
    const objects=[table,...functions.map(f=>({...f,kind:'function'}))].map(o=>{
      const grants=o.grants.filter(g=>g.grantee!==o.owner);
      assert.deepEqual(grants.map(g=>[g.grantee,g.privilege]),rpc.has(o.name)?[['authenticated','EXECUTE']]:[]);
      return {...o,grants,column_acls:{},isolation_test:testPath,
        justification:rpc.has(o.name)?'RPC restricted by identity and active profile in its body.':'Internal operation with no API grants.'};
    });
    const contract={schema_version:1,project:'kora',objects};
    const created=objects.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
    const result=checkPermissionContract({before,after,contract,created});
    assert.ok(result.ok,result.errors.join('\n'));
    return {before,after,contract,created};
  }finally{await db.close();}
}

const evidence={schema_version:1,project:'kora',scope:'Isolated historical cash correction fixture.',
  migration_sha256:{[migration]:hash(read(migration))},
  isolation_tests:[{path:testPath,sha256:hash(read(testPath))}],
  test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs'))};
for(const scenario of ['upgrade','rebuild']){
  evidence[scenario]={};
  for(const [key,data] of Object.entries(await capture(scenario))){
    evidence[scenario][key]=pin(folder+'/'+scenario+'-'+key+'.json',data);
  }
}
const ref=pin(folder+'/release.json',evidence);
const config='config/kora-permission-release.json';
const root=JSON.parse(read(config));
root.additional_releases=(root.additional_releases||[]).filter(item=>item.path!==ref.path);
root.additional_releases.push(ref);
pin(config,root);
