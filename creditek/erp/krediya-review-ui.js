(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value == null || typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);

  // Preview only: never manufacture final bonuses, profit, payments or a deadline.
  function previewDifferences(operations, contexts) {
    const byId = new Map(contexts.map(c => [c.operation_id, c]));
    return operations.filter(o => o.reconocida).flatMap(o => {
      const c = byId.get(o.id) || {}, saved = number(c.pvp_guardado), received = number(c.pvp_recibido);
      if (saved != null && received != null && saved === received) return [];
      return [{operation_id:o.id, estado:'pendiente', preliminar:true, contexto:{
        referencia:o.referencia || o.modelo, tienda:o.establishment_name, imei:o.imei,
        fecha:c.fecha || String(o.operation_at || '').slice(0,10), pvp_guardado:saved,
        pvp_liquidado:received, impacto_bruto:saved == null || received == null ? null : Math.round((received-saved)*100)/100,
        pagamos:number(c.pagamos_guardado), inicial:number(o.inicial)
      }}];
    });
  }

  function missingBeneficiaries(operations, beneficiaries, sites=[], clients=[]) {
    const active=beneficiaries.filter(b=>b.activo!==false && b.tipo==='aliado');
    const known = new Set(active.map(b=>b.origen_codigo));
    for(const site of sites){
      const client=clients.find(c=>c.id===site.aliado_id);
      if(client && Object.hasOwn(client,'payment_beneficiary_id')){
        known.delete(site.origen_codigo);
        if(active.some(b=>b.id===client.payment_beneficiary_id))known.add(site.origen_codigo);
      }
    }
    const groups = new Map();
    operations.filter(o => o.reconocida && o.tipo_establecimiento === 'aliado' && !known.has(o.origen_codigo)).forEach(o => {
      if (!groups.has(o.origen_codigo)) groups.set(o.origen_codigo, {code:o.origen_codigo, name:o.establishment_name, count:0});
      groups.get(o.origen_codigo).count++;
    });
    return [...groups.values()].sort((a,b) => a.name.localeCompare(b.name,'es'));
  }

  function filterOperations(rows, {search='', store=''} = {}) {
    const normalize = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const text = normalize(search.trim());
    return rows.filter(r => (!store || r.origen_codigo === store) && (!text || normalize([r.referencia,r.modelo,r.establishment_name,r.imei,r.cliente_nombre].join(' ')).includes(text)));
  }

  function dialog(title, html) {
    const node = document.createElement('dialog');
    node.className = 'krediya-review-dialog';
    node.innerHTML = `<header><h2>${esc(title)}</h2><button class="btn secondary" type="button" data-close>Cerrar</button></header>${html}`;
    node.setAttribute('aria-label',title);
    document.body.append(node);
    node.querySelector('[data-close]').onclick = () => node.close();
    node.addEventListener('close', () => node.remove(), {once:true});
    node.showModal();
    return node;
  }

  const api = {esc, previewDifferences, missingBeneficiaries, filterOperations, dialog};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreditekKrediyaReview = api;
})(typeof window === 'undefined' ? globalThis : window);
