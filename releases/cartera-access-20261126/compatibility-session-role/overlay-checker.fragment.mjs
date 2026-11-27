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
