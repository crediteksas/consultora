// Server-only, bounded Auth read. No credential is logged, persisted or sent to a model.
import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';import{createClient}from'@supabase/supabase-js';
const ref='jfkmiyvcdfbsbwchyvol';
try{
 const expected=JSON.parse(readFileSync(process.argv[2],'utf8'));
 if(expected.project!==ref||expected.users.length!==3||new Set(expected.users.map(u=>u.id)).size!==3)throw Error('scope');
 const raw=execFileSync('supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:262144});
 const parsed=JSON.parse(raw),keys=Array.isArray(parsed)?parsed:(parsed.api_keys||parsed.keys||[]);
 const item=keys.find(k=>k.name==='service_role'&&!k.disabled)||keys.find(k=>k.type==='secret'&&!k.disabled);
 const key=item?.api_key||item?.key;if(typeof key!=='string'||key.includes('...')||key.length<20)throw Error('server credential unavailable');
 const sb=createClient('https://'+ref+'.supabase.co',key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
 const users=[];
 for(const target of expected.users){
  const {data,error}=await sb.auth.admin.getUserById(target.id);
  if(error||data.user?.id!==target.id||data.user.email?.toLowerCase()!==target.email.toLowerCase())throw Error('identity mismatch');
  users.push({id:target.id,email:target.email,role:data.user.role,banned_until:data.user.banned_until||null,last_sign_in_at:data.user.last_sign_in_at});
 }
 const meta=await fetch('https://'+ref+'.supabase.co/rest/v1/',{headers:{apikey:key,authorization:'Bearer '+key,accept:'application/openapi+json'},signal:AbortSignal.timeout(15000)});
 let info;try{info=await meta.json();}catch{}
 const receipt={read_only:true,api_metadata:{status:meta.status,version:info?.info?.version||null},users,identity_source_sha256:createHash('sha256').update(readFileSync(process.argv[2])).digest('hex'),account_changes:0,messages:0};
 writeFileSync(process.argv[3],JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({auth_admin_read_verified:true,identities_verified:users.length,api_metadata:receipt.api_metadata,account_changes:0,messages:0,credentials_logged:false}));
}catch{console.error('Bounded Auth audit failed; no credentials or user response logged.');process.exit(1);}
