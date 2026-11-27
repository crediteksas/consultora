import{fullSetup as baseSetup}from'./full-fixture.mjs';
import{read}from'./core-fixture.mjs';
export async function fullSetup({activeDebt=false}={}){
 const {db,cut}=await baseSetup({install:false});
 await db.exec('create role fictional_installer createrole bypassrls;grant create on database postgres to fictional_installer;grant usage on schema auth to fictional_installer;');
 for(const n of ['public','kora_private','storage','realtime'])await db.exec('alter schema '+n+' owner to fictional_installer;');
 for(const r of(await db.query("select n.nspname,c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','kora_private','storage','realtime') and c.relkind in('r','p','v','S') order by case when c.relkind='S' then 1 else 0 end")).rows)await db.exec(`alter ${r.relkind==='v'?'view':r.relkind==='S'?'sequence':'table'} "${r.nspname}"."${r.relname}" owner to fictional_installer;`);
 for(const r of(await db.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','kora_private') and p.prokind='f'")).rows)await db.exec('alter function '+r.signature+' owner to fictional_installer;');
 await db.exec('set session authorization fictional_installer;');
 const sql=read('candidate/scope-full.sql').replace(/\bpostgres\b/g,'fictional_installer');
 try{await db.exec(sql);}catch(e){console.error(JSON.stringify({code:e.code,message:e.message,where:e.where,position:e.position,context:e.position?sql.slice(Math.max(0,Number(e.position)-150),Number(e.position)+100):null}));await db.close();throw e;}
 await db.exec('set session authorization postgres;reset role;');
 if(activeDebt){const body=await valueForClock(db);await db.exec(body.replace("clock_timestamp() at time zone 'America/Bogota'","timestamp '2026-11-26 12:00:00'"));await db.exec("update kora_private.confirmacion_deuda_config set inicio='2000-01-01'");}
 return{db,cut};
}

export{operator,manager,operation,other,quote,value,asActor,enableFictional}from'./full-fixture.mjs';

async function valueForClock(db){return(await db.query("select pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure) body")).rows[0].body;}
