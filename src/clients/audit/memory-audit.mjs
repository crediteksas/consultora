import {AUDIT_EVENTS} from '../../shared/audit/events.mjs';
export class MemoryAudit{constructor({clock=()=>new Date()}={}){this.events=[];}record(event,customer_id){if(!AUDIT_EVENTS.includes(event))throw new Error('unsupported_audit_event');this.events.push({event,customer_id,metadata:{pii:false}});}}
