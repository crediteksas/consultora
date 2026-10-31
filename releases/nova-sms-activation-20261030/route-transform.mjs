import {createHash} from 'node:crypto';
export const BASELINE_SHA256='6a5d0d76296d91c44f22398823c54749b4a2ae30ec5923c27e47da254eac0c7d';
export const FORM_SHA256='ef6c89485e34b4b80f7df3e68f962c0ac66232d4a0e7ec8e3a06073554810b07';
export const BEFORE='  if (env22222.NOVA_SMS_ENABLED === "true" && isSecureOtpSendRequest2(body22) || body22?.channel !== void 0 || body22?.request_id !== void 0 || body22?.sms_reason !== void 0) {';
export const AFTER='  if (body22?.channel !== void 0 || body22?.request_id !== void 0 || body22?.sms_reason !== void 0) {';
export const sha=text=>createHash('sha256').update(text).digest('hex');
export function transformRoute(source){
 if(typeof source!=='string'||sha(source)!==BASELINE_SHA256)throw Error('SMS_ACTIVATION_BASELINE_DRIFT');
 if(source.split(BEFORE).length!==2)throw Error('SMS_ACTIVATION_GATE_DRIFT');
 const start=source.indexOf('async function handleOtpEnviarRoute2('),end=source.indexOf('\n__name(handleOtpEnviarRoute2,',start);
 const at=source.indexOf(BEFORE);
 if(start<0||end<=start||at<start||at>end)throw Error('SMS_ACTIVATION_FUNCTION_DRIFT');
 return source.replace(BEFORE,AFTER);
}

