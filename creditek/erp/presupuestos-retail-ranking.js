(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./presupuestos-retail-cierre.js'));
  else root.KoraPresupuestoRanking=factory(root.KoraPresupuestoCierre);
})(typeof globalThis!=='undefined'?globalThis:this,function(cierre){
  'use strict';
  function ordenar(informes,indicador){
    if(!cierre.METRICAS.some(m=>m.id===indicador))throw Error('Indicador no válido.');
    const seen=new Set();
    const rows=informes.map(report=>{
      if(seen.has(report.tienda.codigo))throw Error('Tienda duplicada en el ranking.');
      seen.add(report.tienda.codigo);
      const m=report.categorias.find(m=>m.id===indicador);
      if(!m)throw Error('Falta una categoría del informe.');
      const valido=m.presupuesto>0&&Number.isFinite(m.presupuesto)&&Number.isFinite(m.realizado)&&Number.isFinite(m.cumplimiento);
      // La posición comparte la precisión del porcentaje visible (dos decimales).
      return {tienda:report.tienda,...m,puntos:valido?Math.round(m.cumplimiento*10000):null,posicion:null};
    });
    rows.sort((a,b)=>a.puntos===null&&b.puntos!==null?1:b.puntos===null&&a.puntos!==null?-1:(b.puntos??0)-(a.puntos??0)||a.tienda.nombre.localeCompare(b.tienda.nombre,'es')||a.tienda.codigo.localeCompare(b.tienda.codigo,'es'));
    let last=null,position=0;
    rows.forEach((row,index)=>{if(row.puntos!==null){if(row.puntos!==last)position=index+1;row.posicion=position;last=row.puntos;}});
    return rows;
  }
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function montar({panel,sb,perfil,tiendas,now=()=>new Date()}){
    if(!panel||!perfil?.activo||!['gerencia','auditoria'].includes(perfil.rol))return;
    panel.hidden=false;
    panel.innerHTML='<div class="dashboard-section-heading"><div><p class="dashboard-section-heading__eyebrow">Retail · todas las tiendas</p><h2>Ranking de cumplimiento del presupuesto</h2></div></div><p>Cuatro categorías del mismo mes. Orden por porcentaje de cumplimiento; los empates comparten posición. Las tiendas sin meta completa o resultado verificable quedan sin posición.</p><div class="ranking-controles"><label>Mes del ranking <input type="month" data-ranking-mes></label><button type="button" data-ranking-consultar>Ver ranking</button></div><div class="ranking-tabs" role="tablist" aria-label="Indicador del ranking">'+cierre.METRICAS.map((m,i)=>`<button type="button" role="tab" id="ranking-tab-${m.id}" aria-controls="ranking-panel" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-ranking-indicador="${m.id}">${esc(m.nombre)}</button>`).join('')+'</div><p data-ranking-estado role="status" aria-live="polite"></p><div id="ranking-panel" role="tabpanel" aria-labelledby="ranking-tab-ventas" data-ranking-resultados></div>';
    const month=panel.querySelector('[data-ranking-mes]'),button=panel.querySelector('[data-ranking-consultar]'),status=panel.querySelector('[data-ranking-estado]'),result=panel.querySelector('[data-ranking-resultados]'),tabs=[...panel.querySelectorAll('[role=tab]')];
    month.value=cierre.diaColombia(now()).slice(0,7);month.max=month.value;
    let request=0,reports=null,metric='ventas',loadedMonth='';
    function clear(){request++;reports=null;result.innerHTML='';status.textContent='Pulsa «Ver ranking» para consultar el mes seleccionado.';}
    function render(){
      if(!reports)return;
      const rows=ordenar(reports,metric),money=metric==='ventas';
      const fmt=n=>n==null?'—':new Intl.NumberFormat('es-CO',money?{style:'currency',currency:'COP',minimumFractionDigits:2,maximumFractionDigits:2}:{maximumFractionDigits:2}).format(n);
      const pct=n=>n==null?'—':new Intl.NumberFormat('es-CO',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
      result.setAttribute('aria-labelledby','ranking-tab-'+metric);
      result.innerHTML='<div class="ranking-tabla" role="region" aria-label="Ranking por cumplimiento" tabindex="0"><table class="dashboard-table"><caption>'+esc(cierre.METRICAS.find(m=>m.id===metric).nombre)+' · '+esc(loadedMonth)+(money?' · COP':' · unidades')+'</caption><thead><tr><th>Posición</th><th>Tienda</th><th>Presupuesto mensual</th><th>Realizado</th><th>Cumplimiento</th><th>Estado</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${r.posicion??'Sin posición'}</td><th scope="row">${esc(r.tienda.nombre)}</th><td>${fmt(r.presupuesto)}</td><td>${fmt(r.realizado)}</td><td>${pct(r.cumplimiento)}</td><td>${esc(r.estado)}</td></tr>`).join('')+'</tbody></table></div>';
      const p=reports[0]?.periodo,ranked=rows.filter(r=>r.posicion!==null).length;
      status.textContent=`${ranked} de ${rows.length} tiendas con posición · ${p?.cerrado?'Mes completo':'Mes en curso: resultados parciales frente al presupuesto mensual'} · Corte ${p?.corte||loadedMonth}. Todas las tiendas se comparan aquí, independientemente del filtro general de tienda.`;
    }
    async function load(){
      clear();const token=request,mes=month.value;button.disabled=true;status.textContent='Consultando presupuesto y resultados de las cuatro categorías…';
      try{
        const data=await cierre.cargar({sb,perfil,tiendas:tiendas(),mes,now:now()});
        if(token!==request||month.value!==mes)return;
        reports=data;loadedMonth=mes;render();
      }catch(e){if(token!==request)return;reports=null;result.innerHTML='';status.textContent='No se pudo preparar el ranking: '+(e.message||'Intenta de nuevo.');}
      finally{button.disabled=false;}
    }
    month.addEventListener('change',clear);button.addEventListener('click',load);
    tabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>{metric=tab.dataset.rankingIndicador;tabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;});render();});
      tab.addEventListener('keydown',e=>{const i=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(i>=0){e.preventDefault();tabs[i].focus();tabs[i].click();}});
    });
    load();
  }
  return Object.freeze({ordenar,montar});
});
