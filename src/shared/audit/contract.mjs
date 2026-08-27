export const createAuditRecord=({event,customer_id,at,metadata={}})=>Object.freeze({event,customer_id,at,metadata:Object.freeze({...metadata})});
