import {createHash} from 'node:crypto';
export const BASELINE_WORKER_SHA256='9c78d1e88609bd57caaf3b1ecaad3707379ae85cb77adca82fc4ab2b2efb47fa';
export const BASELINE_FORM_SHA256='99ba019425732ba8ad5a4778e38d71f96d4cb87c19b308f53d91a4732e927b2a';
export const PROVIDER_TIMEOUT_BEFORE='AbortSignal.timeout(8e3)';
export const PROVIDER_TIMEOUT_AFTER='AbortSignal.timeout(3e4)';
export const UI_TIMEOUT_BEFORE='signal: AbortSignal.timeout(20000)';
export const UI_TIMEOUT_AFTER="signal: AbortSignal.timeout(channel === 'sms' ? 90000 : 20000)";
export const sha=value=>createHash('sha256').update(value).digest('hex');
const once=(source,before,after,label)=>{if(source.split(before).length!==2)throw Error('SMS_SYNC_ANCHOR_DRIFT:'+label);return source.replace(before,after);};
export function providerFunction(source){const start=source.indexOf('async function sendPreparedExpressSms('),end=source.indexOf('\n\n// releases/nova-client-sms-20261030/managed-otp.mjs',start);if(start<0||end<=start)throw Error('SMS_SYNC_PROVIDER_FUNCTION_DRIFT');return {start,end,text:source.slice(start,end)};}
export function managedUiFunction(form){const start=form.indexOf('async function solicitarOtpGestionado(channel) {'),end=form.indexOf('\nasync function consultarOtpGestionado()',start);if(start<0||end<=start)throw Error('SMS_SYNC_UI_FUNCTION_DRIFT');return {start,end,text:form.slice(start,end)};}
export function embeddedForm(source){const prefix='var pilot_form_default = ';if(source.split(prefix).length!==2)throw Error('SMS_SYNC_EMBEDDED_FORM_DRIFT');const start=source.indexOf(prefix)+prefix.length,end=source.indexOf(';\n',start);if(end<=start)throw Error('SMS_SYNC_EMBEDDED_LITERAL_DRIFT');return {start,end,literal:source.slice(start,end),form:JSON.parse(source.slice(start,end))};}
export function transformProvider(source){const f=providerFunction(source);return source.slice(0,f.start)+once(f.text,PROVIDER_TIMEOUT_BEFORE,PROVIDER_TIMEOUT_AFTER,'provider-timeout')+source.slice(f.end);}
export function transformForm(form){if(sha(form)!==BASELINE_FORM_SHA256)throw Error('SMS_SYNC_FORM_BASELINE_DRIFT');const f=managedUiFunction(form);return form.slice(0,f.start)+once(f.text,UI_TIMEOUT_BEFORE,UI_TIMEOUT_AFTER,'managed-sms-timeout')+form.slice(f.end);}
export function transformBundle(source,form){
 if(typeof source!=='string'||sha(source)!==BASELINE_WORKER_SHA256)throw Error('SMS_SYNC_WORKER_BASELINE_DRIFT');
 const current=embeddedForm(source);if(current.form!==form||sha(form)!==BASELINE_FORM_SHA256)throw Error('SMS_SYNC_EMBEDDED_BASELINE_MISMATCH');
 const nextForm=transformForm(form),providerOnly=transformProvider(source),embed=embeddedForm(providerOnly);
 const worker=providerOnly.slice(0,embed.start)+JSON.stringify(nextForm)+providerOnly.slice(embed.end);
 if(embeddedForm(worker).form!==nextForm)throw Error('SMS_SYNC_EMBEDDED_RESULT_MISMATCH');
 return {worker,form:nextForm};
}
