// Presentación compartida: nunca agrupar por producto ni inferir su proveedor.
(function (root) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(itemId, rows, error = false) {
    const facturas = [...new Map((rows || []).filter(r => r.remision_item_id === itemId && r.factura_id).map(r => [r.factura_id, r])).values()];
    const contenido = error
      ? 'Proveedor: Creditek · No se pudo consultar el origen. Vuelve a abrir la remisión antes de registrar los IMEI.'
      : !facturas.length
        ? 'Proveedor: Creditek · Factura/proveedor de origen pendiente de vincular. Consulta con Mayte antes de registrar los IMEI.'
        : facturas.map(f => `<div><strong>Proveedor: Creditek · ${esc(f.proveedor || 'Origen pendiente')}</strong><br>Factura: ${esc(f.numero || 'Pendiente')} · Fecha: ${esc(f.fecha || 'Pendiente')}</div>`).join('');
    return `<div data-recepcion-origen style="margin:8px 0 12px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:#f0fdfa;color:#0f172a;overflow-wrap:anywhere;font-size:14px;line-height:1.5">${contenido}<div>Origen para garantía. La cartera sigue siendo con Creditek.</div></div>`;
  }
  root.RecepcionOrigen = { render };
})(globalThis);
