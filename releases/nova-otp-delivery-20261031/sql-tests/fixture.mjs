import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {PGlite}=await import('/Users/oscarm/Creditek/baseline/consultora/node_modules/@electric-sql/pglite/dist/index.js');
export const migration=await readFile(new URL('../sql/20261031164956_nova_otp_delivery_receipts.sql',import.meta.url),'utf8');
export const migrationSha=createHash('sha256').update(migration).digest('hex');
export const predecessorFunctions=JSON.parse(await readFile(new URL('../../nova-flow-repair-20261030/clientes/otp-predecessor-functions.json',import.meta.url),'utf8'));
export const activeGuard=await readFile(new URL('../../../supabase/migrations/20261030213906_nova_otp_active_challenge_guard.sql',import.meta.url),'utf8');
export const ids={link:'10000000-0000-4000-8000-000000000001',otherLink:'20000000-0000-4000-8000-000000000002',otp:'30000000-0000-4000-8000-000000000003',otherOtp:'40000000-0000-4000-8000-000000000004'};
export const mid='wamid.synthetic-alpha_12345';
export const schema=`
create role anon;create role authenticated;create role service_role bypassrls;
create table public.origenes(codigo text primary key,activo boolean default true);
create table public.enlaces_registro(id uuid primary key,origen_codigo text references public.origenes(codigo),activo boolean default true,revoked_at timestamptz);
create table public.otp_codigos(id uuid primary key default gen_random_uuid(),cedula text,celular text,enlace_registro_id uuid,codigo_hash text,expira_at timestamptz,created_at timestamptz default now(),
intentos int default 0,verificado boolean default false,registro_consumido_at timestamptz,envio_aceptado_at timestamptz,envio_fallido_at timestamptz);
create table public.nova_client_otp_dispatch(otp_id uuid,channel text);
insert into public.origenes(codigo) values('CK-01'),('CK-02');
insert into public.enlaces_registro(id,origen_codigo) values('${ids.link}','CK-01'),('${ids.otherLink}','CK-02');
grant usage on schema public to service_role,anon,authenticated;
grant select,insert,update on public.origenes,public.enlaces_registro,public.otp_codigos,public.nova_client_otp_dispatch to service_role;
`;
export async function fixture(){
 const db=new PGlite();await db.exec(schema);
 for(const f of predecessorFunctions){if(createHash('md5').update(f.definition).digest('hex')!==f.definition_md5)throw Error('PREDECESSOR_DRIFT');await db.exec(f.definition+';');}
 await db.exec('create trigger nova_client_otp_guard_sms before insert on public.otp_codigos for each row execute function public.nova_client_otp_guard_sms();');
 await db.exec(activeGuard);
 for(const f of predecessorFunctions)await db.exec('revoke all on function public.'+f.signature+' from public,anon,authenticated;grant execute on function public.'+f.signature+' to service_role;');
 const before=(await db.query("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
 await db.exec(migration);
 const query=async(sql,params=[])=>{await db.exec('set role service_role');try{return await db.query(sql,params);}finally{await db.exec('reset role');}};
 const seed=async({id=ids.otp,document='12345678',phone='3000000000',link=ids.link,hash='A'.repeat(43),created='-2 minutes',expires='2 minutes',accepted=null,verified=false,consumed=null,failed=null}={})=>{
  await db.query("insert into public.otp_codigos(id,cedula,celular,enlace_registro_id,codigo_hash,created_at,expira_at,envio_aceptado_at,verificado,registro_consumido_at,envio_fallido_at) values($1,$2,$3,$4,$5,now()+$6::interval,now()+$7::interval,case when $8::text is null then null else now()+$8::interval end,$9,case when $10::text is null then null else now()+$10::interval end,case when $11::text is null then null else now()+$11::interval end)",[id,document,phone,link,hash,created,expires,accepted,verified,consumed,failed]);
 };
 const register=async({id=ids.otp,document='12345678',phone='3000000000',link=ids.link,messageId=mid}={})=>(await query('select public.nova_otp_delivery_register($1,$2,$3,$4,$5) value',[id,document,phone,link,messageId])).rows[0].value;
 const read=async({document='12345678',phone='3000000000',link=ids.link,id=null}={})=>(id===null
  ?await query('select public.nova_otp_delivery_read($1,$2,$3) value',[document,phone,link])
  :await query('select public.nova_otp_delivery_read($1,$2,$3,$4) value',[document,phone,link,id])).rows[0].value;
 const apply=async({id=ids.otp,messageId=mid,state='failed',offset='-10 seconds',code='131026',eventAt=null}={})=>(await query("select public.nova_otp_delivery_apply($1,$2,$3,coalesce($6::timestamptz,now()+$4::interval),$5) value",[id,messageId,state,offset,code,eventAt])).rows[0].value;
 return {db,before,query,seed,register,read,apply,close:()=>db.close()};
}
