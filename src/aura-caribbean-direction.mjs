export const CARIBBEAN_WARDROBE_CONTRACT = "CARIBBEAN EVERYDAY WARDROBE — APPLIES WHEN PEOPLE ARE REQUESTED:\n- Express the Colombian Caribbean setting through hot-weather everyday clothing, warm natural light and the local commercial environment, never through a presumed regional face, ethnicity or skin tone.\n- Default to breathable cotton or linen, fresh short-sleeved or sleeveless blouses/shirts, lightweight trousers or skirts, sandals or light everyday sneakers. Adults may dress fashionably without cold-weather styling.\n- Unless the operator explicitly requests otherwise, avoid boots, coats, scarves, heavy jackets, thick layers and winter fashion. Do not substitute carnival costumes, beachwear or tourist props.\n- Preserve the operator's requested number of people, adult ages, roles, actions and specific appearance or clothing instructions. Do not add a salesperson or replace two requested friends with a different cast. These are contextual defaults, not a new scene or extra people.";
export function patchCaribbeanDirection(html){
 if(html.includes('const CARIBBEAN_WARDROBE_CONTRACT ='))return html;
 const patches=[
  ["const RECRAFT_ART_DIRECTION =",'const CARIBBEAN_WARDROBE_CONTRACT = '+JSON.stringify(CARIBBEAN_WARDROBE_CONTRACT)+';\nconst RECRAFT_ART_DIRECTION ='],
  ['    AD_CREATIVE_QUALITY_CONTRACT,','    CARIBBEAN_WARDROBE_CONTRACT,\n    AD_CREATIVE_QUALITY_CONTRACT,'],
  ['    RECRAFT_ART_DIRECTION,','    CARIBBEAN_WARDROBE_CONTRACT,\n    RECRAFT_ART_DIRECTION,']
 ];
 if(patches.some(([from])=>html.split(from).length!==2))throw Error('PUBLISHER_SOURCE_CHANGED');
 for(const[from,to]of patches)html=html.replace(from,to);
 return html;
}
export async function patchPublisherResponse(response){
 const original=await response.text();let body;
 try{body=patchCaribbeanDirection(original);}catch{body=original;}
 const headers=new Headers(response.headers);
 for(const key of ['content-length','content-encoding','etag','last-modified'])headers.delete(key);
 headers.set('cache-control','no-store');
 if(body!==original||original.includes('const CARIBBEAN_WARDROBE_CONTRACT ='))headers.set('x-aura-visual-direction','caribe-20261011');
 return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
