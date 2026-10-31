export const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const mid=v=>typeof v==='string'&&/^wamid\.[A-Za-z0-9+/=_-]{10,190}$/.test(v);
export const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export async function readDeliveryJson(response,max=16384){
 if(Number(response.headers.get('content-length'))>max||!response.body){void response.body?.cancel().catch(()=>{});throw Error('BODY_LIMIT');}
 const reader=response.body.getReader(),chunks=[];let n=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>max)throw Error('BODY_LIMIT');chunks.push(value);}}
 catch(e){void reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
