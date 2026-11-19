import assert from'node:assert/strict';import{expectedSociosTriggers,stableSociosCatalog}from'./socios-revision-contract.mjs';
const key=t=>t.schema+'\0'+t.table+'\0'+t.name;
export function expectedFechaTriggers(before){
 const ledger=[['ventas_fechas_conciliadas_inmutables','8a373e3ae9c7767391008bee1b0451ef'],['ventas_fechas_conciliadas_no_truncate','20a5ed1961f7d3544cf40d592cac9830']].map(([name,definition_md5])=>({name,table:'ventas_fechas_conciliadas',schema:'inventario_control',enabled:'O',function_name:'socios_inmutable',definition_md5,function_schema:'inventario_control',function_identity:''}));
 return [...expectedSociosTriggers(before),...ledger].sort((a,b)=>(key(a)>key(b))-(key(a)<key(b)));
}
export function checkFechaTriggers(before,after){
 const expected=expectedFechaTriggers(before),actual=[...after.triggers].sort((a,b)=>(key(a)>key(b))-(key(a)<key(b)));
 assert.equal(stableSociosCatalog(actual),stableSociosCatalog(expected),'Unreviewed trigger delta');return expected;
}
