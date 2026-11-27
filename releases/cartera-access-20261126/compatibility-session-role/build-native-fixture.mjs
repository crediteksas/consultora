// Record the existing, fictional scoped fixture; no production exports/records.
import{PGlite}from'@electric-sql/pglite';import{writeFileSync}from'node:fs';
import{fullSetup}from'./full-fixture.mjs';
const calls=[];const old=PGlite.create.bind(PGlite);
PGlite.create=async(...args)=>{const db=await old(...args),exec=db.exec.bind(db),query=db.query.bind(db);
 db.exec=async(sql,...rest)=>{calls.push({kind:'exec',sql});return exec(sql,...rest);};
 db.query=async(sql,...rest)=>{if(/^select public\.cobra_krediya_save_cut\(/.test(sql))calls.push({kind:'query',sql});return query(sql,...rest);};
 return db;};
try{
 const{db}=await fullSetup({install:false});await db.close();
 const sql=[];let fund=0;
 for(const c of calls){let s=c.sql;
  if(s.includes('create table public.cobra_provision_authority(')){fund++;continue;}
  if(/^create table public\."cobra_provision_/.test(s)||/^alter table "public"\."cobra_provision_/.test(s)||/^drop table public\.cobra_provision_/.test(s))continue;
  s=s.replace(/create role anon;create role authenticated;create role service_role bypassrls;create role authenticator noinherit;/,'');
  s=s.replace(/create schema auth;/,'').replace(/create schema (kora_private|storage|realtime);/g,'create schema if not exists $1 authorization postgres;');
  s=s.replace(/create function auth\.uid\(\)[\s\S]*?\$\$;/,'');
  if(s.includes('create table public.perfiles('))s=s.replace('create table public.perfiles(', 'set role postgres;create table public.perfiles(');
  s=s.replace(/set session authorization ([a-z_]+);/g,'reset role;set role $1;');
  // A subsequent RESET ROLE in the JS fixture means its postgres root. Preserve
  // that owner during setup while the physical preparation login is superuser.
  s=s.replace(/reset role;set role postgres;reset role;/g,'reset role;set role postgres;');
  sql.push(s.trim().replace(/;?$/,';'));
 }
 if(fund!==1)throw Error('Fund phase not uniquely separated');
 writeFileSync(process.argv[2],['-- Fictional 197-table dependency model, not a production clone.','set check_function_bodies=false;',...sql,'reset role;'].join('\n')+'\n');
 console.log(JSON.stringify({recorded_calls:calls.length,fund_migration_delayed:fund,production_exports:0}));
}catch(e){console.error(e.message);process.exit(1);}
