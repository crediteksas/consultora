import {createHash} from 'node:crypto';
import {managedRelations} from './cartera-managed-inventory.mjs';
const expression='(NOT ( SELECT kora_cartera_policy.cartera_principal_restringido() AS cartera_principal_restringido))';
const expected=createHash('md5').update(expression).digest('hex');
const key=r=>r.schema+'.'+r.name;
// Mandatory upgrade/rebuild gate for every later permission release. Includes
// managed relations without adding all provider-owned objects to the contract.
export function checkCarteraCoverage(snapshot){
 const installed=snapshot.functions?.some(f=>(f.schema==='public'&&f.name.startsWith('cartera_operador_'))||(['kora_private','kora_cartera_policy'].includes(f.schema)&&f.name.startsWith('cartera_')))||snapshot.policies?.some(p=>p.name==='cartera_dedicated_deny')||snapshot.schema_grants?.some(s=>s.schema==='kora_cartera_policy')||snapshot.cartera_coverage?.session_role!=null;if(!installed)return [];
 if(!snapshot.functions?.some(f=>f.schema==='public'&&f.name==='cartera_operador_inicio'))return ['Cartera partial installation: bootstrap missing'];
 const c=snapshot.cartera_coverage,errors=[];
 if(!c||!Array.isArray(c.tables)||!Array.isArray(c.publications))return ['Cartera requires an independent complete deny-coverage catalog'];
 if(c.graphql_installed!==false)errors.push('Cartera GraphQL requires separate review');
 if(!c.session_role||Object.values(c.session_role).some(v=>v!==false)||c.session_schema_privilege!==false)errors.push('Cartera dedicated session attributes/schema changed');
 if(JSON.stringify([...(c.session_settings||[])].sort())!==JSON.stringify(['lock_timeout=2s','statement_timeout=8s']))errors.push('Cartera dedicated session settings changed');
 const memberships=c.session_memberships||[];
 if(memberships.length!==2||!memberships.some(m=>m.role==='kora_cartera_session'&&m.member==='postgres'&&m.bootstrap_grantor&&m.admin===true&&m.inherit===false&&m.set===false)||!memberships.some(m=>m.role==='kora_cartera_session'&&m.member==='authenticator'&&m.grantor==='postgres'&&m.admin===false&&m.inherit===false&&m.set===true))errors.push('Cartera dedicated session memberships changed');
 const names=['cartera_operador_inicio','cartera_operador_datos','cartera_operador_guardar_gestion','cartera_operador_solicitar_provision'];
 if(c.rpc_returns?.length!==4||names.some(name=>c.rpc_returns.filter(p=>p.name===name&&p.returns==='jsonb'&&p.set===false).length!==1))errors.push('Cartera dedicated RPC return/overload changed');
 for(const name of names){
  const f=snapshot.functions.find(f=>f.schema==='public'&&f.name===name);
  const want=['kora_cartera_session',...(name==='cartera_operador_inicio'?['authenticated']:[])].sort();
  const got=f?.grants?.filter(g=>g.grantee!==f.owner)||[];
  if(!f||f.owner!=='kora_cartera_operator'||!f.security_definer||JSON.stringify(got.map(g=>g.grantee).sort())!==JSON.stringify(want)||got.some(g=>g.privilege!=='EXECUTE'||g.grantable||g.grantor!=='kora_cartera_operator'))errors.push('Cartera dedicated RPC ACL changed: '+name);
 }

 const required=new Set(snapshot.relations.filter(r=>r.schema==='public'&&['r','p'].includes(r.kind)).map(key));
 const managed=new Map(managedRelations.map(r=>[key(r),r.kind]));for(const k of managed.keys())required.add(k);
 const seen=new Set();
 for(const r of c.tables){
  const k=key(r);if(r.safe_message_partition===true){if(required.has(k)||r.schema!=='realtime'||!['r','p'].includes(r.kind)||r.session_privileged!==false)errors.push('Cartera unsafe partition: '+k);continue;}if(!required.has(k)||seen.has(k))errors.push('Cartera unexpected/duplicate coverage: '+k);seen.add(k);
  if(managed.has(k)&&r.kind!==managed.get(k))errors.push('Cartera managed relation kind changed: '+k);
  if(managed.has(k)&&!['storage.objects','storage.buckets','realtime.messages'].includes(k)){
   if(r.session_privileged!==false)errors.push('Cartera managed surface not isolated: '+k);
   continue;
  }
  if(r.session_privileged!==false)errors.push('Cartera session data grant: '+k);
  const p=r.policy;
  if(r.rls!==true||!p||p.name!=='cartera_dedicated_deny'||p.permissive!==false||p.command!=='*'||JSON.stringify(p.roles)!=='["authenticated"]'||p.using_md5!==expected||p.check_md5!==expected)errors.push('Cartera restrictive deny missing or changed: '+k);
 }
 for(const k of required)if(!seen.has(k))errors.push('Cartera relation omitted: '+k);
 // The reviewed deployment has no publication membership. Do not silently
 // activate Realtime postgres_changes by accepting a later publication.
 if(c.publications.length)errors.push('Cartera publication changes require a separately reviewed interface');
 return errors;
}

// Exact additive restrictive overlay. It never exempts a grant, owner, shape,
// RLS flag, removed policy, function or permissive policy from the older gate.
export function carteraOverlayKeys(before,after,contract){
 const keys=new Set(),errors=[];const entries=contract.cartera_restrictive_overlay;
 if(entries===undefined)return{keys,errors};
 if(!Array.isArray(entries)||checkCarteraCoverage(after).length)return{keys,errors:['Invalid Cartera restrictive overlay coverage']};
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 for(const e of entries){
  const k=e.schema+'.'+e.name;
  const b=before.relations.find(r=>key(r)===k),a=after.relations.find(r=>key(r)===k);
  const old=before.policies.filter(p=>p.schema===e.schema&&p.table===e.name),next=after.policies.filter(p=>p.schema===e.schema&&p.table===e.name);
  const added=next.filter(p=>!old.some(o=>o.name===p.name));
  if(keys.has(k)||e.schema!=='public'||!b||!a||b.rls!==true||a.rls!==true||!['r','p'].includes(a.kind)||e.before_count!==b.policy_count||e.after_count!==a.policy_count||a.policy_count!==b.policy_count+1||next.length!==old.length+1||added.length!==1||old.some(o=>!next.some(n=>stable(n)===stable(o)))||added[0].name!=='cartera_dedicated_deny'||added[0].permissive!==false||added[0].command!=='*'||JSON.stringify(added[0].roles)!=='["authenticated"]'||added[0].using_md5!==expected||added[0].check_md5!==expected){errors.push('Cartera restrictive overlay differs: '+k);continue;}
  keys.add(k);
 }
 return{keys,errors};
}
