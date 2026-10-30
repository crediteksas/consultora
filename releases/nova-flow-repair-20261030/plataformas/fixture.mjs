import {readFile} from 'node:fs/promises';
const here=new URL('./',import.meta.url);
export const originals=JSON.parse(await readFile(new URL('predecessor-definitions.json',here),'utf8'));
export const predecessors=JSON.parse(await readFile(new URL('predecessor-functions.json',here),'utf8'));
export const migration=await readFile(process.env.CONSENT_MIGRATION||new URL('../sql/kora-consent-repair.sql',here),'utf8');
export const rollback=await readFile(new URL('../sql/kora-consent-repair-rollback.sql',here),'utf8');
export const id={source:'11111111-1111-4111-8111-111111111111',actor:'22222222-2222-4222-8222-222222222222',client:'33333333-3333-4333-8333-333333333333'};
export const ddl=`
DO $roles$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END; $roles$;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.clientes(id uuid PRIMARY KEY,autorizacion_datos boolean);
CREATE TABLE public.perfiles(id uuid PRIMARY KEY,nombre text,activo boolean,rol text,tienda_codigo text);
CREATE TABLE public.nova_retail_reviewers(actor_id uuid PRIMARY KEY,can_review boolean);
CREATE TABLE public.kora_nova_sources(solicitud_id uuid PRIMARY KEY,cliente_id uuid,revoked_at timestamptz,registration jsonb,consent jsonb,submitted_at timestamptz DEFAULT now());
CREATE TABLE public.nova_retail_cases(source_id uuid PRIMARY KEY,cliente_id uuid,store_code text,state text,revision int,decision jsonb,summary jsonb,rejected_at timestamptz,valid_until timestamptz,manual_actor uuid,manual_note text,updated_at timestamptz,fingerprint text,renewed_at timestamptz,query_requested_at timestamptz,query_request_id uuid,delivery_requested boolean,delivered_at timestamptz);
CREATE TABLE public.nova_retail_case_events(source_id uuid,revision int,actor_id uuid,actor_name text,action text,payload jsonb);
CREATE TABLE public.nova_retail_notifications(source_id uuid,revision int,audience text,UNIQUE(source_id,revision,audience));
`;
export async function prepareDatabase(db,{enabled=false,revoked=false,install=true}={}){
 await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
 await db.exec(ddl);
 await db.exec('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;');
 for(const row of originals)await db.exec(row.definition);
 for(const row of predecessors){
  const fn=row.proname+'('+row.args.replace(/p_[a-z_]+ /g,'')+')';
  await db.exec('REVOKE ALL ON FUNCTION public.'+fn+' FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.'+fn+' TO service_role;');
 }
 if(install)await db.exec(migration);
 await db.query('INSERT INTO public.clientes VALUES($1,$2)',[id.client,enabled]);
 await db.query("INSERT INTO public.perfiles VALUES($1,'Persona sintética',true,'admin_tienda','CK-05')",[id.actor]);
 await db.query('INSERT INTO public.nova_retail_reviewers VALUES($1,true)',[id.actor]);
 await db.query("INSERT INTO public.kora_nova_sources(solicitud_id,cliente_id,revoked_at,registration,consent) VALUES($1,$2,CASE WHEN $3 THEN now() END,$4,$5)",[id.source,id.client,revoked,{p_origen_codigo:'CK-05'},{granted:true,revoked:false,platform_queries:{expires_at:'2000-01-01T00:00:00Z'}}]);
 const summary={name:'Histórico sintético',references:[{status:'approved',responded:true},{status:'approved',responded:true}],photos:['frente','reverso','selfie'].map(type=>({type,status:'auto_approved',hash:'a'.repeat(64)}))};
 await db.query("INSERT INTO public.nova_retail_cases(source_id,cliente_id,store_code,state,revision,decision,summary,fingerprint) VALUES($1,$2,'CK-05','review',1,$3,$4,$5)",[id.source,id.client,{state:'review',canProcess:false,reasons:['fewer_than_two_platforms']},summary,'b'.repeat(64)]);
 return {db,summary};
}
