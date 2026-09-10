import {deliver} from './core.mjs';
// Custom authentication: random per-job capability validated/claimed atomically by
// a service-only RPC BEFORE reading a report or calling Google.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const body=await req.text();if(body.length>500)return new Response('Invalid',{status:400});
  const {id,token}=JSON.parse(body);if(!uuid.test(id)||!uuid.test(token))return new Response('Invalid',{status:400});
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rpc=async(name:string,args:unknown)=>{
   const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('RPC failed');return await r.json();
  };
  const report=await rpc('kora_claim_krediya_mail',{p_id:id,p_token:token});
  if(!report)return new Response('Not authorized or already claimed',{status:403});
  const result=await deliver(report,{KORA_GMAIL_CLIENT_ID:Deno.env.get('KORA_GMAIL_CLIENT_ID'),KORA_GMAIL_CLIENT_SECRET:Deno.env.get('KORA_GMAIL_CLIENT_SECRET'),KORA_GMAIL_REFRESH_TOKEN:Deno.env.get('KORA_GMAIL_REFRESH_TOKEN')});
  const saved=await rpc('kora_finish_krediya_mail',{p_id:id,p_token:token,p_outcome:result.outcome,p_message_id:result.messageId||null});
  if(!saved)throw Error('Outcome not saved');
  return Response.json({status:result.outcome});
 }catch{return new Response('Delivery could not be completed',{status:500});}
});
