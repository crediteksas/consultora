import {createHash} from 'node:crypto';
import {managedRelations} from './cartera-managed-inventory.mjs';
const expression='(NOT ( SELECT kora_cartera_policy.cartera_principal_restringido() AS cartera_principal_restringido))';
const expected=createHash('md5').update(expression).digest('hex');
const key=r=>r.schema+'.'+r.name;
// Mandatory upgrade/rebuild gate for every later permission release. Includes
// managed relations without adding all provider-owned objects to the contract.
export function checkCarteraCoverage(snapshot){
 if(!snapshot.functions?.some(f=>f.schema==='public'&&f.name==='cartera_operador_inicio'))return [];
 const c=snapshot.cartera_coverage,errors=[];
 if(!c||!Array.isArray(c.tables)||!Array.isArray(c.publications))return ['Cartera requires an independent complete deny-coverage catalog'];
 const required=new Set(snapshot.relations.filter(r=>r.schema==='public'&&['r','p'].includes(r.kind)).map(key));
 const managed=new Map(managedRelations.map(r=>[key(r),r.kind]));for(const k of managed.keys())required.add(k);
 const seen=new Set();
 for(const r of c.tables){
  const k=key(r);if(!required.has(k)||seen.has(k))errors.push('Cartera unexpected/duplicate coverage: '+k);seen.add(k);
  if(managed.has(k)&&r.kind!==managed.get(k))errors.push('Cartera managed relation kind changed: '+k);
  if(managed.has(k)&&!['storage.objects','storage.buckets','realtime.messages'].includes(k)){
   if(r.rls!==true||!['r','p'].includes(r.kind)||r.authenticated_permissive!==false)errors.push('Cartera managed surface not isolated: '+k);
   continue;
  }
  const p=r.policy;
  if(r.rls!==true||!p||p.name!=='cartera_dedicated_deny'||p.permissive!==false||p.command!=='*'||JSON.stringify(p.roles)!=='["authenticated"]'||p.using_md5!==expected||p.check_md5!==expected)errors.push('Cartera restrictive deny missing or changed: '+k);
 }
 for(const k of required)if(!seen.has(k))errors.push('Cartera relation omitted: '+k);
 // The reviewed deployment has no publication membership. Do not silently
 // activate Realtime postgres_changes by accepting a later publication.
 if(c.publications.length)errors.push('Cartera publication changes require a separately reviewed interface');
 return errors;
}
