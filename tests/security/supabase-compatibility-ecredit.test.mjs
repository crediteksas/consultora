import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {checkPermissionContract} from '../../scripts/supabase-compat/check-permission-contract.mjs';

const migration='supabase/migrations/20261113010715_ecredit_liquidacion_venta.sql';
const fixture='tests/fixtures/supabase-compat/ecredit';
const isolationTest='tests/security/supabase-compatibility-ecredit.test.mjs';
const read=file=>readFileSync(file,'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const pin=(path,value)=>{
  const bytes=JSON.stringify(value,null,2)+'\n';
  writeFileSync(path,bytes);
  return {path,sha256:hash(bytes)};
};

async function verify(rebuild){
  const db=await PGlite.create();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
    create table perfiles(id uuid primary key,activo boolean,rol text);
    create table origenes(codigo text,nombre text);
    create table ventas(id uuid primary key,consecutivo bigint,fecha date,tienda_codigo text,total numeric,anulada boolean);
    create table creditos(venta_id uuid,financiera text constraint creditos_financiera_check check(financiera in ('payjoy','krediya','alocredit','addi')),cuota_inicial numeric,valor_esperado_financiera numeric,medio_pago_complementario text);
    create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    insert into perfiles values ('d1782db6-bacc-4caf-af6f-ce1b8d1c0391',true,'auditoria'),('00000000-0000-0000-0000-000000000001',true,'admin_tienda');
    insert into ventas values ('00000000-0000-0000-0000-000000000002',1,'2026-11-12','TEST',2000000,false);`);
    if(rebuild) await db.exec('alter default privileges revoke execute on functions from public');
    const catalog=async()=>{
      const row=(await db.query(read('scripts/supabase-compat/catalog-query.sql'))).rows[0];
      const snapshot=Object.values(row)[0];
      delete snapshot.captured_at;
      return snapshot;
    };
    const before=await catalog();
    await db.exec(read(migration));
    const after=await catalog();
    const functions=after.functions.filter(fn=>fn.name.startsWith('ecredit_'));
    const table=after.relations.find(row=>row.schema==='ecredit_private'&&row.name==='ecredit_liquidaciones');
    assert.equal(functions.length,6);
    assert.ok(table?.rls);
    const objects=[table,...functions.map(fn=>({...fn,kind:'function'}))].map(object=>{
      const grants=object.grants.filter(grant=>grant.grantee!==object.owner);
      const rpc=['ecredit_listar','ecredit_confirmar'].includes(object.name);
      assert.deepEqual(grants.map(grant=>[grant.grantee,grant.privilege]),rpc?[['authenticated','EXECUTE']]:[]);
      return {...object,grants,column_acls:{},isolation_test:isolationTest,justification:rpc?'RPC verifies the active operator and role.':'Private settlement or trigger inaccessible to API roles.'};
    });
    const created=objects.map(({schema,name,kind,identity})=>({schema,name,kind,identity}));
    const contract={schema_version:1,project:'kora',objects,allow_catalog_changes:{
      schema_grants:JSON.stringify(after.schema_grants,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort()):value),
      triggers:JSON.stringify(after.triggers,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort()):value),
    }};
    const result=checkPermissionContract({before,after,contract,created});
    assert.ok(result.ok,result.errors.join('\n'));
    const sale='00000000-0000-0000-0000-000000000002';
    await assert.rejects(db.query("insert into creditos values ($1,'ecredit',300000,1800000,null)",[sale]),/deben sumar/);
    await db.query("insert into creditos values ($1,'ecredit',300000,1700000,null)",[sale]);
    await db.exec('set role anon');
    await assert.rejects(db.query('select public.ecredit_listar()'),/permission denied/);
    await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
    const confirm=utility=>db.query("select public.ecredit_confirmar($1,1650000,1550000,$2,'ficticia')",[sale,utility]);
    await assert.rejects(db.query('select public.ecredit_listar()'),/no autorizado/);
    await assert.rejects(db.query('select * from ecredit_private.ecredit_liquidaciones'),/permission denied/);
    await assert.rejects(confirm(100000),/Solo Mayte/);
    await db.exec("set request.jwt.claim.sub='d1782db6-bacc-4caf-af6f-ce1b8d1c0391'");
    await assert.rejects(confirm(50000),/debe coincidir/);
    await confirm(100000);
    await confirm(100000);
    const {rows}=await db.query('select public.ecredit_listar() data');
    assert.equal(rows[0].data[0].saldo_financiado,1700000);
    assert.equal(rows[0].data[0].pagamos,1550000);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,1);
    await assert.rejects(db.query('update ventas set anulada=true where id=$1',[sale]),/ya fue liquidada/);
    return {before,after,contract,created};
  } finally { await db.close(); }
}

test('eCredit valida caja, permisos y reparto en actualización y reconstrucción aisladas',async()=>{
  const release={schema_version:1,project:'kora',migration_sha256:{[migration]:hash(read(migration))},
    isolation_tests:[{path:isolationTest,sha256:hash(read(isolationTest))}],
    test_runner_sha256:hash(read('scripts/run-kora-local-tests.mjs'))};
  for(const scenario of ['upgrade','rebuild']){
    const snapshots=await verify(scenario==='rebuild');
    if(process.env.EMIT_ECREDIT_PERMISSION_EVIDENCE==='1'){
      release[scenario]=Object.fromEntries(Object.entries(snapshots)
        .map(([kind,snapshot])=>[kind,pin(fixture+'/'+scenario+'-'+kind+'.json',snapshot)]));
    }
  }
  if(process.env.EMIT_ECREDIT_PERMISSION_EVIDENCE==='1'){
    const ref=pin(fixture+'/release.json',release);
    const config='config/kora-permission-release.json';
    const current=JSON.parse(read(config));
    current.additional_releases=(current.additional_releases||[]).filter(item=>item.path!==ref.path);
    current.additional_releases.push(ref);
    pin(config,current);
  }
});
