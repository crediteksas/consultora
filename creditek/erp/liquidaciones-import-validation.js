(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KoraImportValidation=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const expired=()=>Object.assign(new Error('La sesión venció o dejó de ser válida. Vuelve a iniciar sesión y valida nuevamente el archivo antes de guardarlo.'),{code:'IMPORT_SESSION_INVALID'});
  function message(error){
    if(error?.code==='IMPORT_SESSION_INVALID'||error?.status===401||/claim timestamp|jwt.*expired|expired.*jwt|refresh.token.*(invalid|not found)/i.test(error?.message||''))return expired().message;
    return error?.message||'No se pudo completar la validación. Vuelve a intentarlo.';
  }
  async function session(sb,expectedUserId,now=Date.now()){
    const result=await sb.auth.getSession();
    if(result.error)throw new Error(message(result.error));
    const current=result.data?.session;
    if(!current?.user?.id||!Number.isFinite(current.expires_at)||current.expires_at*1000<=now||
      (expectedUserId&&current.user.id!==expectedUserId))throw expired();
    // Comprueba también la sesión con Auth; no basta un token local todavía vigente.
    const verified=await sb.auth.getUser();
    if(verified.error)throw new Error(message(verified.error));
    if(!verified.data?.user||verified.data.user.id!==current.user.id)throw expired();
  }
  async function all(sb,table,columns,key){
    const rows=[];
    for(let offset=0;;offset+=500){
      const result=await sb.from(table).select(columns).eq('activo',true).order(key).range(offset,offset+499);
      if(result.error)throw new Error(message(result.error));
      if(!Array.isArray(result.data))throw new Error('No se pudo consultar el catálogo de comercios y ejecutivos. No se validó el archivo.');
      rows.push(...result.data);
      if(result.data.length<500)return rows;
    }
  }
  async function establishments(sb){
    const [origins,executives]=await Promise.all([
      all(sb,'origenes','codigo,nombre,tipo,ejecutivo_id,aliases','codigo'),
      all(sb,'ejecutivos','id,nombre','id'),
    ]);
    if(!origins.length)throw new Error('La consulta no devolvió comercios activos. Revisa el acceso al catálogo antes de validar; esto no significa que los comercios del archivo sean desconocidos.');
    const byId=new Map(executives.map(e=>[e.id,e]));
    return origins.map(o=>({...o,aliases:[...(o.aliases||[]),o.codigo],ejecutivo:byId.get(o.ejecutivo_id)||null}));
  }
  function issuesHTML(preview,translate){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const ops=new Map((preview.operaciones||[]).map(o=>[o.sourceKey,o]));
    return (preview.incidencias||[]).map(issue=>{
      const op=ops.get(issue.sourceKey);
      const detail=op?`${op.establecimientoNombre||'Comercio sin nombre en el archivo'} · Crédito/operación ${op.externalId||issue.sourceKey}`:issue.sourceKey;
      return `<tr><td>${esc(translate(issue.tipo))}</td><td>${esc(detail)}</td></tr>`;
    }).join('')||'<tr><td colspan="2">Sin novedades estructurales.</td></tr>';
  }
  return {session,establishments,message,issuesHTML};
});
