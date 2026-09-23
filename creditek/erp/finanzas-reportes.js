(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function destination(value) {
    const raw = String(value || '').trim(), parts = raw.split(' · ').map(x => x.trim());
    const complete = parts.length === 3 && parts[0] && parts[1] && /^\d{6,20}$/.test(parts[2]);
    return {raw, bank: complete ? parts[0] : '', type: complete ? parts[1] : '', account: complete ? parts[2] : '', complete: !!complete};
  }
  function table(rows, domain) {
    return [['Fecha','Negocio','Tienda','Tipo','Categoría','Concepto','Beneficiario','Identificación','Banco / billetera','Tipo de cuenta','Número de cuenta','Destino registrado','Valor COP','Estado','Fecha de aprobación','ID movimiento'],
      ...rows.map(row => {
        const account = destination(row.destination_account);
        return [String(row.due_date || ''),domain.BUSINESS_LABELS[row.business_unit] || row.business_unit,row.store_name || row.store_code || '',row.entry_type === 'retiro_utilidad' ? 'Retiro de utilidad' : 'Gasto',domain.CATEGORY_LABELS[row.category] || row.category,row.concept,row.beneficiary,String(row.beneficiary_document || ''),account.bank,account.type,account.account,account.raw,domain.number(row.amount),domain.STATUS_LABELS[row.status] || row.status,String(row.approved_at || ''),String(row.id || '')];
      })];
  }
  function workbook(rows, domain, XLSX) {
    const sheet = XLSX.utils.aoa_to_sheet(table(rows, domain));
    sheet['!cols'] = [12,12,24,20,16,32,28,20,22,18,24,46,18,20,28,40].map(wch => ({wch}));
    sheet['!autofilter'] = {ref: sheet['!ref']};
    for (let r=1;r<=rows.length;r++) {
      for (const c of [7,10,15]) { const cell=sheet[XLSX.utils.encode_cell({r,c})]; if(cell) {cell.t='s';cell.z='@';delete cell.f;} }
      const amount=sheet[XLSX.utils.encode_cell({r,c:12})]; if(amount) amount.z='"$"#,##0.00';
    }
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Movimientos');return book;
  }
  function approvedRows(rows) {
    // Store-funded Retail withdrawals have their own instructions, not a second central giro.
    const approved=rows.filter(row => row.status==='aprobado' && !(row.entry_type==='retiro_utilidad' && row.business_unit==='retail'));
    if(!approved.length) throw new Error('No hay movimientos aprobados pendientes de pago con estos filtros.');
    const incomplete=approved.filter(row => !row.id || !row.beneficiary || !row.beneficiary_document || !destination(row.destination_account).complete || !Number.isFinite(Number(row.amount)) || Number(row.amount)<=0);
    if(incomplete.length) throw new Error(`No se generó la orden: ${incomplete.map(row=>row.concept || 'Movimiento sin concepto').join(', ')} requiere verificar beneficiario, identificación, banco, tipo, cuenta o valor. No se modificó ningún pago.`);
    return approved;
  }
  function reportBody(rows, domain) {
    const approved=approvedRows(rows), total=approved.reduce((n,row)=>n+Number(row.amount),0);
    return `<h1>Orden de pagos autorizados</h1><p>Gastos y retiros · ${approved.length} movimientos · Total: <strong>${esc(domain.money(total))}</strong></p><p>Documento operativo. No acredita un giro ni registra un pago.</p><table><thead><tr><th>Fecha / movimiento</th><th>Concepto / negocio</th><th>Beneficiario / identificación</th><th>Banco / tipo</th><th>Cuenta destino</th><th>Valor COP</th></tr></thead><tbody>${approved.map(row=>{const account=destination(row.destination_account);return `<tr><td>${esc(row.due_date)}<br><small>${esc(row.id)}</small></td><td>${esc(row.concept)}<br>${esc(domain.BUSINESS_LABELS[row.business_unit] || row.business_unit)}</td><td>${esc(row.beneficiary)}<br>${esc(row.beneficiary_document)}</td><td>${esc(account.bank)}<br>${esc(account.type)}</td><td>${esc(account.account)}</td><td>${esc(domain.money(row.amount))}</td></tr>`;}).join('')}</tbody></table><p><strong>Total a girar: ${esc(domain.money(total))}</strong></p><p>Conservar las autorizaciones y registrar el soporte en KORA después de realizar el giro.</p>`;
  }
  function showOrder(rows, domain) {
    const body=reportBody(rows,domain); // Validate before opening any document.
    root.document.getElementById('financialPaymentReport')?.remove();
    if(!root.document.getElementById('financialPaymentReportStyle')) {
      const style=root.document.createElement('style');style.id='financialPaymentReportStyle';
      style.textContent='#financialPaymentReport{width:95vw;max-width:1200px;max-height:90vh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:12px;color:#0b1e3d;font:14px Arial;background:white}#financialPaymentReport::backdrop{background:#0006}#financialPaymentReport table{width:100%;border-collapse:collapse}#financialPaymentReport td,#financialPaymentReport th{padding:10px;border:1px solid #cbd5e1;text-align:left;overflow-wrap:anywhere}#financialPaymentReport small{font-size:9px}#financialPaymentReport .report-tools{display:flex;gap:12px;margin-bottom:18px}@media print{body>*:not(#financialPaymentReport){display:none!important}#financialPaymentReport{display:block!important;position:static;width:100%;max-width:none;max-height:none;overflow:visible;border:0;padding:0;font-size:10px}#financialPaymentReport .report-tools{display:none}#financialPaymentReport tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}}';
      root.document.head.appendChild(style);
    }
    const dialog=root.document.createElement('dialog');dialog.id='financialPaymentReport';dialog.setAttribute('aria-label','Orden de pagos autorizados');
    dialog.innerHTML=`<div class="report-tools"><button type="button" class="btn primary" data-print>Imprimir / Guardar PDF</button><button type="button" class="btn" data-close>Cerrar</button></div><img src="/creditek/shared/branding/creditek-logo.png" alt="Creditek" width="150">${body}`;
    root.document.body.appendChild(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-print]').onclick=()=>root.print();dialog.showModal();
  }
  root.KoraFinancialReports=Object.freeze({destination,table,workbook,approvedRows,reportBody,showOrder});
})(typeof window==='undefined'?globalThis:window);
