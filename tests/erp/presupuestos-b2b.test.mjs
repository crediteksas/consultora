import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../../supabase/migrations/20261002143613_presupuestos_b2b_administracion.sql',import.meta.url),'utf8');
const gerente='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',maite='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',tienda='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(){
  const db=await PGlite.create();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table perfiles(id uuid primary key,rol text,activo boolean);
    insert into perfiles values('${gerente}','gerencia',true),('${maite}','auditoria',true),('${tienda}','admin_tienda',true);
    grant select on perfiles to authenticated;
    create table audit_log(usuario text,accion text,tabla text,registro_id text,detalle jsonb);
    create table presupuestos(meta_utilidad numeric);insert into presupuestos values(321);
    create table aliados_metas_plataforma(meta_creditos int);insert into aliados_metas_plataforma values(25);
    create table banco_movimientos(monto numeric);insert into banco_movimientos values(1000);`);
  await db.exec(sql);
  const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const guardar=(patch={})=>{const p={mes:'2026-10-01',ventas:1000000,utilidad:120000,unidades:null,notas:'Plan octubre',revision:0,...patch};
    return db.query('select guardar_presupuesto_b2b($1,$2,$3,$4,$5,$6) r',[p.mes,p.ventas,p.utilidad,p.unidades,p.notas,p.revision]);};
  return {db,login,guardar};
}
test('B2B: Gerencia guarda con rol authenticated, revisiones y reintento idempotente; no mueve otros negocios',async()=>{
 const {db,login,guardar}=await fixture();try{
  await login(gerente);await db.exec('set role authenticated');
  assert.equal((await guardar()).rows[0].r.revision,1);
  assert.equal((await guardar()).rows[0].r.revision,1);
  await assert.rejects(guardar({ventas:2}),/cambió/);
  assert.equal((await guardar({ventas:2,revision:1,unidades:0})).rows[0].r.revision,2);
  assert.equal((await guardar({mes:'2026-11-01',ventas:300})).rows[0].r.revision,1);
  assert.equal((await db.query('select count(*)::int n from b2b_presupuestos')).rows[0].n,2);
  await assert.rejects(db.exec('update b2b_presupuestos set meta_ventas=0'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,3);
  assert.equal(Number((await db.query('select meta_utilidad from presupuestos')).rows[0].meta_utilidad),321);
  assert.equal((await db.query('select meta_creditos from aliados_metas_plataforma')).rows[0].meta_creditos,25);
  assert.equal(Number((await db.query('select sum(monto) total from banco_movimientos')).rows[0].total),1000);
 }finally{await db.close();}
});
test('B2B: Auditoría consulta, tiendas y anónimos no acceden; inactivos no guardan',async()=>{
 const {db,login,guardar}=await fixture();try{
  await login(gerente);await guardar();
  await db.exec('set role authenticated');await login(maite);
  assert.equal((await db.query('select count(*)::int n from b2b_presupuestos')).rows[0].n,1);
  await assert.rejects(guardar({revision:1,ventas:2}),/Solo Gerencia/);
  await login(tienda);assert.equal((await db.query('select count(*)::int n from b2b_presupuestos')).rows[0].n,0);
  await assert.rejects(guardar(),/Solo Gerencia/);
  await db.exec('reset role');await db.exec(`update perfiles set activo=false where id='${gerente}'`);
  await login(gerente);await assert.rejects(guardar(),/Solo Gerencia/);
  await login('');await assert.rejects(guardar(),/Solo Gerencia/);
  assert.equal((await db.query("select has_function_privilege('anon','guardar_presupuesto_b2b(date,numeric,numeric,numeric,text,integer)','execute') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('anon','b2b_presupuestos','select') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
test('B2B: datos inválidos no dejan metas parciales ni auditorías',async()=>{
 const {db,login,guardar}=await fixture();try{
  await login(gerente);
  for(const patch of [{mes:null},{mes:'2026-10-02'},{mes:'infinity'},{ventas:null},{ventas:-1},{ventas:1.5},{ventas:'NaN'},
    {utilidad:'Infinity'},{utilidad:0.5},{unidades:1.5},{unidades:-1},{revision:null},{notas:'x'.repeat(1001)}])await assert.rejects(guardar(patch));
  assert.equal((await db.query('select count(*)::int n from b2b_presupuestos')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,0);
  assert.equal((await guardar({ventas:0,utilidad:-50,unidades:0})).rows[0].r.meta_utilidad_neta,-50);
 }finally{await db.close();}
});
