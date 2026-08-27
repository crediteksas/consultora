import {mapPayJoyLookup} from './mapper.mjs';
import {PAYJOY_ERROR,PayJoyError} from './errors.mjs';
export class PayJoyAdapter{constructor({client,clock=()=>new Date()}={}){this.client=client;this.clock=clock;}async check(locator){if(!locator?.value)throw new PayJoyError(PAYJOY_ERROR.NOT_FOUND);const payload=await this.client.lookupCustomer(locator.value);return mapPayJoyLookup(payload,{checkedAt:this.clock().toISOString()});}}
