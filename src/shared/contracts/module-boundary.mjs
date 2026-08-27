export const AURA_MODULES=Object.freeze({SOFIA:'SOFIA',NOVA:'NOVA',CARTERA:'CARTERA',HUMANO:'HUMANO'});
export const createModuleMessage=({customer_id,source,target,type,payload={}})=>Object.freeze({customer_id,source,target,type,payload:Object.freeze({...payload})});
