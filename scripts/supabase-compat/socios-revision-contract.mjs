// Independent source contract for reviewed per-inventory retirement classification.
// Pins come from reviewed source + independent live code metadata, not from
// the catalog being authorized. No SQL/network/business writes occur here.
const functions = [
 ['inventario_control','cierre_utilidad_api','p_accion text, p_corte_id uuid, p_huella text',true,'d656424eddf406e1b8f46946d5131ac2',['authenticated']],
 ['inventario_control','socios_retiro_fuente','p_retiro financial_entries, p_tienda text',false,'cdd2ba89e5db6e4f829916b9ffafeda1',[]],
 ['inventario_control','socios_revision_api','p_accion text, p_datos jsonb, p_request_id uuid',true,'a5654cdcecef8d643344d4cb1fc715c8',['authenticated']],
 ['inventario_control','socios_api','p_accion text, p_datos jsonb, p_request_id uuid',true,'d1630bc74d0b9f7d04c0110aceee9d94',['authenticated']],
 ['inventario_control','socios_finanzas_guardar','',true,'0cfb67a8227caef113ee62f3ab862392',[]],
 ['inventario_control','socios_inmutable','',false,'85d902e9c29d269755beae98a0cc6287',[]],
 ['inventario_control','socios_resultado','p_corte uuid',false,'7a5694b6b1f3167bb3c4185e03b54c48',[]],
 ['public','socios_inventario','p_accion text, p_datos jsonb, p_request_id uuid',false,'d2c59377593c0e6d9114c2876995068a',['authenticated','service_role']],
];
const tables = {
 socios_retiros_revisiones:[['id','uuid'],['corte_id','uuid'],['retiro_id','uuid'],['huella_fuente','text'],['fuente','jsonb'],['decision','text'],['motivo','text'],['solicitud','jsonb'],['validado_por','uuid'],['validado_at','timestamp with time zone']],
 socios_grupos_tienda:[['tienda_codigo','text'],['grupo','text'],['configurado_at','timestamp with time zone']],
 socios_resultados:[['corte_id','uuid'],['grupo','text'],['detalle','jsonb'],['utilidad','numeric'],['fijado_por','uuid'],['fijado_at','timestamp with time zone']],
 socios_operaciones:[['id','uuid'],['corte_id','uuid'],['fecha','date'],['monto','numeric(16,2)'],['motivo','text'],['solicitud','jsonb'],['financial_entry_id','uuid'],['movimiento_caja_id','uuid'],['registrado_por','uuid'],['registrado_at','timestamp with time zone']],
 socios_destinos:[['id','uuid'],['operacion_id','uuid'],['orden','integer'],['tipo','text'],['beneficiario','text'],['monto','numeric(16,2)'],['soporte_path','text'],['corte_destino_id','uuid'],['factura_id','uuid'],['pago_id','uuid'],['cuenta_corriente_id','bigint']],
};
export const SOCIOS_TRIGGERS = [
 ['inventario_control','socios_retiros_revisiones','socios_retiros_revisiones_inmutable','socios_inmutable','a4491bbb4758b0ded2793dfc3486c8bb'],
 ['inventario_control','socios_destinos','socios_destinos_inmutable','socios_inmutable','037b55b858d29de373184fe0261150d2'],
 ['inventario_control','socios_operaciones','socios_operaciones_inmutable','socios_inmutable','b8aabed08f01e11fdf2870fb4a2d9b9b'],
 ['inventario_control','socios_resultados','socios_resultados_inmutable','socios_inmutable','a92a6bfe8abaf2b834f29ad02216421d'],
 ['public','financial_entries','socios_inventario_finanzas_guard','socios_finanzas_guardar','fcb77e075f3e0a4e4f4e87952da7a2e2'],
].map(([schema,table,name,function_name,definition_md5])=>({schema,table,name,function_name,definition_md5,enabled:'O',function_schema:'inventario_control',function_identity:''}));
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>stable(a)===stable(b);
const nonOwner=x=>x.grants.filter(g=>g.grantee!==x.owner);
const one=(xs,predicate)=>{const found=xs.filter(predicate);if(found.length!==1)throw Error('Exactly one reviewed Socios object required');return found[0];};
export function sociosPermissionObjects(snapshot,{isolationTest}={}) {
 if(!Array.isArray(snapshot?.relations)||!Array.isArray(snapshot?.functions)||!Array.isArray(snapshot?.triggers)||!isolationTest)throw Error('Complete native catalog and isolation test required');
 const objects=[];
 for(const[name,shape]of Object.entries(tables)){
  const r=one(snapshot.relations,r=>r.schema==='inventario_control'&&r.name===name);
  if(r.kind!=='r'||r.owner!=='postgres'||r.rls!==true||r.force_rls!==false||r.policy_count!==0||nonOwner(r).length||r.columns.some(c=>c.acl!==null||c.identity!==''||c.generated!=='')||!same(r.columns.map(c=>[c.name,c.type]),shape))throw Error('Socios private table exceeds source contract: '+name);
  objects.push({...r,grants:[],column_acls:{},justification:'Private RLS storage; unchanged controller RPC owns writes; direct browser/backend table access deliberately absent',isolation_test:isolationTest});
 }
 for(const[schema,name,identity,definer,md5,roles]of functions){
  const f=one(snapshot.functions,f=>f.schema===schema&&f.name===name&&f.identity===identity);
  const expected=roles.map(grantee=>({grantee,grantor:'postgres',privilege:'EXECUTE',grantable:false}));
  const grants=nonOwner(f).map(g=>({grantee:g.grantee,grantor:g.grantor,privilege:g.privilege,grantable:g.grantable})).sort((a,b)=>a.grantee.localeCompare(b.grantee));
  if(f.owner!=='postgres'||f.security_definer!==definer||f.definition_md5!==md5||!same(f.config,['search_path=""'])||!same(grants,expected))throw Error('Socios function code/rights differs from reviewed source: '+schema+'.'+name);
  objects.push({...f,kind:'function',grants:expected,justification:roles.length?'Finite EXECUTE only; existing native active named-controller guard remains unchanged':'Owner-only internal function; no API execution grant required',isolation_test:isolationTest});
 }
 const actual=snapshot.triggers.filter(t=>t.name.startsWith('socios_'));
 if(actual.length!==5||SOCIOS_TRIGGERS.some(t=>!actual.some(a=>same(a,t))))throw Error('Socios trigger definition/attachment differs from source');
 return objects;
}
export function sociosCreatedInventory(){return [...Object.keys(tables).map(name=>({schema:'inventario_control',name,kind:'table'})),...functions.map(([schema,name,identity])=>({schema,name,identity,kind:'function'}))];}
export function expectedSociosTriggers(before){
 if(!Array.isArray(before?.triggers)||before.triggers.some(t=>t.name.startsWith('socios_')))throw Error('Source-batch BEFORE must precede Socios creation');
 const key=t=>t.schema+'\0'+t.table+'\0'+t.name;
 return [...before.triggers,...SOCIOS_TRIGGERS].sort((a,b)=>(key(a)>key(b))-(key(a)<key(b)));
}
export const stableSociosCatalog=stable;
