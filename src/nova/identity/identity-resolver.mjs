export const NOVA_INTERNAL_ROLES=Object.freeze(['RETAIL_AGENT','ALLY_AGENT','AUTHORIZATION_MANAGER','ADMIN']);

export class NovaIdentityResolver{
  constructor(entries=[]){this.entries=new Map(entries.flatMap(entry=>[entry.phone,entry.internal_user_id].filter(Boolean).map(key=>[String(key),Object.freeze({...entry})])));}
  resolve(input={}){
    const identity=this.entries.get(String(input.internal_user_id||input.phone||''));
    if(!identity||identity.status!=='ACTIVE'||!NOVA_INTERNAL_ROLES.includes(identity.role))return Object.freeze({authorized:false,role:'UNKNOWN',status:identity?.status||'NOT_FOUND'});
    return Object.freeze({authorized:true,role:identity.role,store_id:identity.store_id||null,ally_id:identity.ally_id||null,name:identity.name||null,status:identity.status});
  }
}

export const createNovaSandboxIdentityResolver=()=>new NovaIdentityResolver([
  {phone:'SANDBOX_RETAIL_01',internal_user_id:'U_RETAIL_01',role:'RETAIL_AGENT',store_id:'STORE_01',name:'Asesor Retail',status:'ACTIVE'},
  {phone:'SANDBOX_ALLY_01',internal_user_id:'U_ALLY_01',role:'ALLY_AGENT',ally_id:'ALLY_01',name:'Asesor Aliado',status:'ACTIVE'},
  {phone:'SANDBOX_AUTH_MANAGER_01',internal_user_id:'U_MANAGER_01',role:'AUTHORIZATION_MANAGER',name:'Gestor',status:'ACTIVE'},
  {phone:'SANDBOX_ADMIN_01',internal_user_id:'U_ADMIN_01',role:'ADMIN',name:'Administrador',status:'ACTIVE'}
]);
