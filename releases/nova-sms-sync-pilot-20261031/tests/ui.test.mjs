import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './form-harness.mjs';
const reply=body=>({data:{ok:true,state:'accepted',request_id:body.request_id,channel:body.channel,otp_id:'10000000-0000-4000-8000-000000000001',retry_after:288}});
const smsCalls=f=>f.calls.filter(x=>x.path==='/api/otp/enviar');
for(const [label,base,channel,timeout]of[['published SMS',true,'sms',20000],['candidate SMS',false,'sms',90000],['candidate managed WhatsApp',false,'whatsapp',20000]])test(label+' uses exact scoped browser timeout and preserves selected Files',async()=>{
 const f=fixture(async(path,body)=>{if(path==='/api/otp/opciones')return {data:{smsEnabled:true}};if(path==='/api/otp/enviar')return reply(body);throw Error('Closed mock route '+path);},{base});await f.enable();await f.click(channel==='sms'?'btnEnviarOtpSms':'btnEnviarOtp');assert.equal(smsCalls(f).length,1);assert.equal(smsCalls(f)[0].timeoutMs,timeout);assert.equal(f.calls.find(c=>c.path==='/api/otp/opciones').timeoutMs,10000);assert.equal(smsCalls(f)[0].body.channel,channel);assert.equal(f.run('otpManagedAttempt.state'),'accepted');f.assertFiles();
});
test('browser uncertainty requires status-only consultation and never repeats send automatically',async()=>{
 let sentBody;const f=fixture(async(path,body)=>{if(path==='/api/otp/opciones')return {data:{smsEnabled:true}};if(path==='/api/otp/enviar'){sentBody=body;const e=Error('Synthetic browser deadline');e.name='TimeoutError';throw e;}if(path==='/api/otp/estado')return reply({...body,channel:sentBody.channel});throw Error('Closed mock route '+path);});await f.enable();await f.click('btnEnviarOtpSms');assert.equal(f.run('otpManagedAttempt.state'),'uncertain');await f.advance(90000);assert.equal(smsCalls(f).length,1);await f.click('btnConsultarOtp');assert.equal(smsCalls(f).length,1);assert.equal(f.calls.find(c=>c.path==='/api/otp/estado').timeoutMs,15000);assert.equal(f.run('otpManagedAttempt.requestId'),sentBody.request_id);assert.equal(f.run('otpManagedAttempt.state'),'accepted');f.assertFiles();
});
test('double click while provider response pending cannot create a second request UUID/send',async()=>{
 let release;const f=fixture(async(path,body)=>{if(path==='/api/otp/opciones')return {data:{smsEnabled:true}};if(path==='/api/otp/enviar')return new Promise(done=>{release=()=>done(reply(body));});throw Error('Closed mock route '+path);});await f.enable();const first=f.click('btnEnviarOtpSms');await Promise.resolve();await f.click('btnEnviarOtpSms');assert.equal(smsCalls(f).length,1);release();await first;assert.equal(f.run('otpManagedAttempt.state'),'accepted');assert.equal(smsCalls(f).length,1);f.assertFiles();
});
