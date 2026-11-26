const phone=s=>typeof s==='string'?s.replace(/\D/g,''):'';
const names=new Set(['Ya Bot Krediya','KrediYA Colombia']);
export function providerMetadata(metadata,providerPhone){
 if(typeof metadata!=='string')return null;
 const m=/^\[(\d{1,2}):(\d{2})\s*([ap])\.m\.,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*(.+):\s*$/i.exec(metadata);
 if(!m)return null;
 const h=Number(m[1]),minute=Number(m[2]);if(h<1||h>12||minute>59)return null;
 const author=m[7];if(!names.has(author)&&(!/^\+?[\d ]+$/.test(author)||phone(author)!==providerPhone))return null;
 const hour=h%12+(m[3].toLowerCase()==='p'?12:0);
 const at=Date.UTC(Number(m[6]),Number(m[5])-1,Number(m[4]),hour+5,minute);
 const local=new Date(at-5*3600000);
 if(local.getUTCFullYear()!==Number(m[6])||local.getUTCMonth()+1!==Number(m[5])||local.getUTCDate()!==Number(m[4]))return null;
 return at;
}
