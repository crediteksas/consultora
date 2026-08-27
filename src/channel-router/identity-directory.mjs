export const INTERNAL_NOVA_ROLES=Object.freeze(['retail_agent','ally_agent','authorization_manager']);
export class SandboxIdentityDirectory{
  constructor(entries=[]){this.entries=new Map(entries.map(entry=>[entry.sender,Object.freeze({...entry})]));}
  resolve(message){const identified=this.entries.get(message.sender);if(identified)return identified;if(message.sender_type==='external_customer')return Object.freeze({sender_type:'external_customer',role:'external_customer',authorized:true});return Object.freeze({sender_type:'unknown',role:'unknown',authorized:false});}
}
export const createSandboxIdentityDirectory=()=>new SandboxIdentityDirectory([{sender:'SANDBOX_RETAIL_01',sender_type:'internal',role:'retail_agent',authorized:true},{sender:'SANDBOX_ALLY_01',sender_type:'internal',role:'ally_agent',authorized:true},{sender:'SANDBOX_AUTH_MANAGER_01',sender_type:'internal',role:'authorization_manager',authorized:true}]);
