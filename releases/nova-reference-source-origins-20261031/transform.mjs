import {createHash} from 'node:crypto';
export const BASELINE_WORKER_SHA256='f3fd64f53e7e0d3049964a4f6fab384dd3941376ebae72fbe3324c654670665d';
export const BASELINE_FORM_SHA256='2a4948d8f71cde22baac7873cd9958f94b975d1c4cd9151871f3c7f4e84fe087';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function sourceProof(source){
 const start=source.indexOf('async function referenceSourceProof('),end=source.indexOf('\n__name(referenceSourceProof,',start);
 if(start<0||end<=start||source.indexOf('async function referenceSourceProof(',start+1)!==-1)throw Error('REFERENCE_SOURCE_FUNCTION_DRIFT');
 return {start,end,text:source.slice(start,end)};
}
const once=(text,before,after,label)=>{if(text.split(before).length!==2)throw Error('REFERENCE_SOURCE_ANCHOR_DRIFT:'+label);return text.replace(before,after);};
export function transformBundle(source,form){
 if(sha(source)!==BASELINE_WORKER_SHA256||sha(form)!==BASELINE_FORM_SHA256)throw Error('REFERENCE_SOURCE_BASELINE_DRIFT');
 const original=sourceProof(source);let next=original.text;
 next=once(next,'async (path) => {','async (path, body) => {','read-helper-signature');
 next=once(next,'{ headers: headers42, redirect: "manual", signal: AbortSignal.timeout(6e3) }','{ headers: body === void 0 ? headers42 : { ...headers42, "content-type": "application/json" }, ...body === void 0 ? {} : { method: "POST", body: JSON.stringify(body) }, redirect: "manual", signal: AbortSignal.timeout(6e3) }','read-only-rpc');
 next=once(next,'origin:registration->>p_origen_codigo,refs:registration->p_referencias,consent','origin:registration->>p_origen_codigo,consent','omit-stale-snapshot');
 next=once(next,'    if (!uuid2.test(s.cliente_id) || s.origin !== "CK-02") return reply32({ ok: true, rows: [] });',
`    const allowedOrigins = String(env22222.NOVA_REGISTRATION_PILOT_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!uuid2.test(s.cliente_id) || typeof s.origin !== "string" || !/^CK-0[1-9]$/.test(s.origin) || !allowedOrigins.includes(s.origin) || s.origin !== "CK-02" && env22222.NOVA_RETAIL_ENABLED !== "true") return reply32({ ok: true, rows: [] });`,'pilot-origin-scope');
 next=once(next,'const [clients, outbox, origins] = await Promise.all([','const [clients, outbox, origins, effectiveRefs] = await Promise.all([','effective-references-parallel');
 next=once(next,'read2("origenes?codigo=eq.CK-02&select=activo&limit=2")','read2("origenes?codigo=eq." + encodeURIComponent(s.origin) + "&select=codigo,activo&limit=2"), read2("rpc/kora_nova_effective_references", { p_source: b.sourceId })','origin-and-current-reference-read');
 next=once(next,'origins.length !== 1 || origins[0].activo !== true','origins.length !== 1 || origins[0].codigo !== s.origin || origins[0].activo !== true','exact-origin-binding');
 next=once(next,'    return reply32({ ok: true, rows: [{ cliente_id:',
`    if (!Array.isArray(effectiveRefs) || effectiveRefs.length < 1 || effectiveRefs.length > 2 || new Set(effectiveRefs.map((r) => r?.type)).size !== effectiveRefs.length || effectiveRefs.some((r) => !r || !["family", "personal"].includes(r.type) || typeof r.telefono !== "string" || !/^3\\d{9}$/.test(r.telefono) || typeof r.contact_authorized !== "boolean")) return reply32({ ok: false }, 503);
    return reply32({ ok: true, rows: [{ cliente_id:`,'validate-effective-reference-contract');
 next=once(next,'source_refs: (s.refs || []).map(','source_refs: effectiveRefs.map(','use-current-references-only');
 const worker=source.slice(0,original.start)+next+source.slice(original.end);
 if(sourceProof(worker).text!==next)throw Error('REFERENCE_SOURCE_RESULT_DRIFT');
 return {worker,form};
}
