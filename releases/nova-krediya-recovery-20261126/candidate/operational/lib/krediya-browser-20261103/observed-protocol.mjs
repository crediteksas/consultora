// Classifies only the observed service menus; never infers a zero balance.
export const normalizeReply=s=>typeof s==='string'?s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[*_]/g,'').trim().toLowerCase():'';
export function classifyReply(value){
 const text=normalizeReply(value),flat=text.replace(/\s+/g,' ');
 if(['¿me indica su numero de cedula?','me indica su numero de cedula?','comparteme tu numero de cedula, por favor.'].includes(text))return 'document_prompt';
 if(flat==='me brinda por favor su nombre y apellido')return 'name_prompt';
 if(/^gracias, [^\n.!?]{2,120}\. selecciona la opcion que mejor describa tu solicitud para que podamos asistirte\.$/.test(flat))return 'menu_intro';
 const option=(n,label)=>new RegExp('(?:^|\\n)'+n+'[\\ufe0f\\u20e3\\s.]*'+label+'(?:\\s|$)').test(text);
 if(option(1,'estado de cuenta')&&(option(2,'cronograma de pagos')||option(2,'medios de pago')&&option(3,'calendario de pagos')&&option(4,'visualizar el historial de pagos')))return 'account_menu';
 if(option(1,'informacion producto')&&option(2,'interesado en financiamiento')&&option(3,'puntos aliados'))return 'commercial_menu';
 return 'unknown';
}
export function unavailableReplyReason(text){
 const type=classifyReply(text);
 return type==='name_prompt'?'YABOT_ADDITIONAL_IDENTITY_REQUIRED':type==='commercial_menu'?'YABOT_COMMERCIAL_MENU_NO_ACCOUNT_STATEMENT':null;
}
