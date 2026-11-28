import test from'node:test';import assert from'node:assert/strict';import{createOperationalEngine}from'./candidate/operational/node/engine.mjs';
const time=Date.parse('2026-11-27T18:00:00Z'),iso=n=>new Date(n).toISOString(),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture({late=false,skew=0}={}){
 let clock=time,seq=0,finished=0,released=0,clockSample=null;
 const job={id:id(1),lease_id:id(2),application_id:id(3),source_application_id:id(4),payload_hash:'a'.repeat(64),platform:'KREDIYA',status:'running',attempts:1,lease_until:iso(time+300000),created_at:iso(time),inputs:{document:'10000001',phone:'3000000001'},consent:{granted:true,revoked:false,text_version:'nova-platform-query-v2',platforms:['ALO','KREDIYA','PAYJOY'],accepted_at:iso(time-1000),expires_at:iso(time+86400000)}};
 const states=[],texts=[],events=[],pending=[];let prompted=false,named=false;
 const sample=()=>clockSample={serverAt:clock+skew,requestAt:clock,receivedAt:clock};
 const ack=text=>({confirmed:true,messageId:'out'+(++seq),text,accountPhone:'573118657153',providerPhone:'573155000105'});
 const client={clock:()=>clockSample,status:async()=>{sample();return{operationalEnabled:true};},peek:async()=>{sample();return{eligible:true};},claim:async()=>{sample();return job;},read:async()=>{sample();return job;},check:async()=>{sample();return true;},name:async()=> 'Persona Ficticia',finish:async a=>{finished++;job.observation=a.p_observation;job.status='unavailable';job.completion_lease_id=job.lease_id;return{saved:true};},release:async()=>{released++;return{released:true};}};
 const incoming=text=>({text,messageId:'in'+(++seq),direction:'incoming',accountPhone:'573118657153',senderPhone:'573155000105',receivedAt:iso(clock)});
 const browser=async(op,arg)=>{if(op==='verifyView')return true;if(op==='baseline')return[];if(op==='sendText'){texts.push(arg);if(arg==='1')pending.push('¡Gracias por contactarnos! 😊 Ha sido un placer atenderte y estamos aquí para ti. ¡Que tengas un excelente día!');return ack(arg);}if(op==='readIncoming'){
  if(pending.length)return pending.splice(0).map(incoming);
  if(!prompted&&clock>=time+206000){prompted=true;return[incoming('Compárteme tu número de cédula, por favor.')];}
  if(prompted&&!named&&clock>=time+216000){named=true;return[incoming('Me brinda por favor su nombre y apellido')];}
  if(named&&clock>=time+(late?290000:230000)&&!finished)return[incoming('Gracias, Persona Ficticia. selecciona la opción que mejor describa tu solicitud para que podamos asistirte.'),incoming('1️⃣ Información producto\n2️⃣ Interesado en financiamiento\n3️⃣ Puntos aliados')];return[];
 }throw Error(op);};
 const journal={record:async x=>events.push(x),close:async()=>{}};
 const engine=createOperationalEngine({client,browser,record:async x=>states.push(x),openJournal:async()=>journal,now:()=>clock,sleep:async ms=>clock+=ms});return{engine,job,states,texts,events,finished:()=>finished,released:()=>released,clock:()=>clock};
}
test('slow greeting + recent document/name finishes same first lease, saves and releases automatically',async()=>{const f=fixture(),r=await f.engine.tick();assert.equal(r.saved,true,JSON.stringify(r));assert.equal(f.finished(),1);assert.equal(f.released(),1);assert.equal(f.job.attempts,1);assert.deepEqual(f.texts,['Hola KrediYa','10000001','Persona Ficticia','1']);assert.equal(f.states.at(-1).phase,'idle');assert.ok(f.clock()-time<240000);});
test('reply after fixed loop cutoff keeps journal/context without extra attempts, sends or fabricated result',async()=>{const f=fixture({late:true}),r=await f.engine.tick();assert.equal(r.state,'review');assert.equal(r.reason,'SESSION_EXPIRED');assert.equal(f.finished(),0);assert.equal(f.released(),0);assert.equal(f.job.attempts,1);assert.deepEqual(f.texts,['Hola KrediYa','10000001','Persona Ficticia']);assert.equal(f.states.at(-1).context.id,f.job.id);assert.ok(f.events.some(x=>x.phase==='send_confirmed'&&x.kind==='authorized_document'));assert.ok(f.clock()<time+300000);});
test('excessive server clock skew refuses before any outgoing customer data or greeting',async()=>{const f=fixture({skew:6000});assert.equal((await f.engine.tick()).state,'awaiting_connection');assert.equal(f.states.at(-1).context,null);assert.deepEqual(f.texts,[]);assert.equal(f.finished(),0);});
