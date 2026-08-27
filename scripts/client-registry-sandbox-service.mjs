import {createClientRegistry,PayJoyCustomerCheck,sandboxFixtures} from '../lib/client-registry/index.mjs';
const fixtures=sandboxFixtures();
export const clientRegistry=createClientRegistry({...fixtures,payjoyService:new PayJoyCustomerCheck({gateway:fixtures.gateway})});
export const safeSearch=query=>{const found=clientRegistry.search(query);return found?clientRegistry.profile(found.id):null;};
export const safeCreate=input=>clientRegistry.profile(clientRegistry.create(input).id);
export const safePayJoyCheck=id=>clientRegistry.payjoyCheck(id,{force:true});
