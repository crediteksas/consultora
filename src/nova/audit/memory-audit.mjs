import {NOVA_AUDIT_EVENTS} from './events.mjs';
export class MemoryAudit{constructor({clock=()=>new Date()}={}){this.events=[];this.clock=clock;}record(event,customer_id){if(!NOVA_AUDIT_EVENTS.includes(event))throw new Error('unsupported_audit_event');this.events.push({event,customer_id,at:this.clock().toISOString(),metadata:{pii:false}});}}
