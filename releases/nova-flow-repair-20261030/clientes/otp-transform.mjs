import assert from 'node:assert/strict';

// A failed/unknown legacy transport result is not evidence that the code was
// never sent. SQL serializes all bound, hashed challenges for the same phone.
export async function novaActiveOtp2(input,enlaceId,env,fetcher,now){
  let response;
  try{
    response=await fetcher(otpUrl2({cedula:'eq.'+input.cedula,celular:'eq.'+input.celular,
      enlace_registro_id:'eq.'+enlaceId,codigo_hash:'not.is.null',verificado:'eq.false',
      registro_consumido_at:'is.null',expira_at:'gt.'+new Date(now).toISOString(),
      select:'id,expira_at,intentos,envio_aceptado_at,envio_fallido_at',order:'created_at.desc',limit:'1'}),
      {headers:supabaseHeaders2(env),redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok||!response.body||Number(response.headers.get('content-length'))>4096){
      void response.body?.cancel().catch(()=>{});return {ok:false};
    }
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw Error('OTP_METADATA_SIZE');chunks.push(value);}}
    catch{void reader.cancel().catch(()=>{});return {ok:false};}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!Array.isArray(rows)||rows.length>1)return {ok:false};
    if(rows.length===0)return {ok:true,row:null};
    const row=rows[0],stamp=v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
    if(!row||typeof row.id!=='string'||!/^[0-9a-f-]{36}$/i.test(row.id)||
      typeof row.expira_at!=='string'||!Number.isFinite(Date.parse(row.expira_at))||Date.parse(row.expira_at)<=now||
      !Number.isInteger(row.intentos)||row.intentos<0||!stamp(row.envio_aceptado_at)||!stamp(row.envio_fallido_at)||
      row.envio_aceptado_at!==null&&row.envio_fallido_at!==null)return {ok:false};
    return {ok:true,row};
  }catch{return {ok:false};}
}

export function novaActiveOtpReply2(row,now){
  const seconds=Math.min(300,Math.max(1,Math.ceil((Date.parse(row.expira_at)-now)/1000)));
  const accepted=row.envio_aceptado_at!==null&&row.envio_fallido_at===null&&row.intentos<3;
  return {status:202,body:{ok:false,pending:true,reason:'active_challenge',state:accepted?'accepted':'uncertain',
    retry_after:seconds,error:accepted?'Ya hay un código solicitado. Si lo recibiste, ingrésalo.':'El envío aún no está confirmado. Espera a que venza este intento antes de solicitar otro. Tus datos y fotos se conservan.'}};
}

function one(source,from,to,name){
  assert.equal(source.split(from).length-1,1,'OTP anchor drift: '+name);
  return source.replace(from,to);
}

export function transformClientesOtp(source){
  const extract=name=>{const start=source.indexOf('async function '+name+'('),end=source.indexOf('\n}\n__name('+name+',',start);assert.ok(start>=0&&end>start,'OTP function drift: '+name);return source.slice(start,end+2);};
  const reserve=extract('reserveOtp2');
  const nextReserve=one(reserve,'quota: responseText.includes("otp_limite_celular") || responseText.includes("otp_limite_enlace")',
    'quota: responseText.includes("otp_limite_celular") || responseText.includes("otp_limite_enlace"),\n      active: responseText.includes("OTP_ACTIVE")','reservation conflict');
  source=one(source,reserve,nextReserve,'active reserve function');
  const send=extract('sendSecureOtp2');
  let nextSend=one(send,'  const now = (dependencies.now ?? Date.now)();\n  const codigo = (dependencies.generateCode ?? generateOtp2)();',
    '  const now = (dependencies.now ?? Date.now)();\n  const active = await novaActiveOtp2(input, resolved.enlaceId, env22222, dependencies.fetcher, now);\n  if (!active.ok) return result4(503, "No se pudo comprobar el intento anterior. Tus datos y fotos se conservan.");\n  if (active.row) return novaActiveOtpReply2(active.row, now);\n  const codigo = (dependencies.generateCode ?? generateOtp2)();','recover before reserve');
  nextSend=one(nextSend,'  if (!reservation.ok) {\n    return reservation.quota ? result4(429, "L\\xEDmite de c\\xF3digos alcanzado") : result4(503, "No se pudo reservar el c\\xF3digo");\n  }',
    '  if (!reservation.ok) {\n    if (reservation.active) {\n      const current = await novaActiveOtp2(input, resolved.enlaceId, env22222, dependencies.fetcher, (dependencies.now ?? Date.now)());\n      if (!current.ok) return result4(503, "No se pudo comprobar el intento anterior. Tus datos y fotos se conservan.");\n      if (current.row) return novaActiveOtpReply2(current.row, (dependencies.now ?? Date.now)());\n      return {status:409,body:{ok:false,reason:"active_challenge",retry_after:300,error:"Ya hay un código vigente para este celular. Espera a que venza antes de solicitar otro."}};\n    }\n    return reservation.quota ? result4(429, "L\\xEDmite de c\\xF3digos alcanzado") : result4(503, "No se pudo reservar el c\\xF3digo");\n  }','recover concurrent reservation');
  return one(source,send,novaActiveOtp2.toString()+'\n'+novaActiveOtpReply2.toString()+'\n'+nextSend,'helpers and active sender');
}
