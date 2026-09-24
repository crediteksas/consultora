(function () {
  "use strict";
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
      String(v ?? "—").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const cop = (v) =>
      new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(Number(v) || 0),
    date = (v) => (v ? String(v).slice(0, 10) : "—");
  const shortId = (v) =>
    String(v || "")
      .split("-")[0]
      .toUpperCase() || "—";
  const platformName = (v) =>
    v === "alo"
      ? "ALO Credit"
      : v === "payjoy"
        ? "PayJoy"
        : v === "krediya"
          ? "Krediya"
          : v === "addi"
            ? "Addi"
          : String(v || "—");
  const bogotaDateTime = (v) =>
    v
      ? new Intl.DateTimeFormat("es-CO", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "America/Bogota",
        }).format(new Date(v))
      : "—";
  const TYPES = {
    b2b: [
      ["pago_proveedor", "Pago a proveedor"],
      ["otra_obligacion_b2b", "Otra obligación B2B autorizada"],
    ],
    tercerizacion: [
      ["gasto_administrativo", "Gasto administrativo"],
      ["gasto_financiero", "Gasto financiero"],
      ["impuesto", "Impuesto"],
      ["retiro_socios", "Retiro de socios"],
      ["otro_movimiento_autorizado", "Otro movimiento autorizado"],
    ],
  };
  let preparation, financialExpenses, financialRecorder, pendingFinancialId = null, financialAccessError = false;
  let sb,
    profile,
    data = {},
    initialized = false,
    pendingPaymentIds = [],
    selectedCompensationId = null,
    treasuryView = "operational",
    cobros,
    clients;
  const canAuthorize = () =>
    profile?.rol === "gerencia" && profile?.activo !== false;
  const canViewOutgoing = () =>
    Boolean(profile?.es_operador_aliados || profile?.rol === "gerencia");
  function notice(message, error = false) {
    const n = $("#notice");
    n.textContent = message;
    n.className = `notice${error ? " error" : ""}`;
    n.classList.remove("hidden");
    setTimeout(() => n.classList.add("hidden"), 5000);
  }
  function badge(v, label) {
    return `<span class="badge ${esc(v)}">${esc(label || String(v || "—").replaceAll("_", " "))}</span>`;
  }
  function table(head, rows) {
    return `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : '<tr><td colspan="12"><div class="empty">No hay información para los filtros seleccionados.</div></td></tr>'}</tbody></table></div>`;
  }
  function mask(snapshot) {
    const value = snapshot?.account_number || "";
    return value
      ? `${esc(snapshot.bank || "Cuenta")} · •••• ${esc(value.slice(-4))}`
      : "Cuenta pendiente de validar";
  }
  function storeName(code) {
    return (
      data.origins?.find((origin) => origin.codigo === code)?.nombre ||
      code ||
      "—"
    );
  }
  function paymentBusinessName(p) {
    return p.payment_kind === "aliado"
      ? window.CreditekTesoreriaTercerizacion.paymentBusinessName(p, data.origins)
      : null;
  }
  function paymentExecutiveNames(payments) {
    const rows = Array.isArray(payments) ? payments : [payments];
    return [
      ...new Set(
        rows
          .flatMap((payment) => payment.executive_names || [])
          .map((name) => String(name || "").trim())
          .filter(Boolean),
      ),
    ];
  }
  function commissionCompensation(movement) {
    if (movement.compensation_id) {
      const linked = data.compensations?.find(
        (item) => item.id === movement.compensation_id,
      );
      if (linked) return linked;
    }
    const operationId = String(movement.idempotency_key || "").replace(
      "commission-operation:",
      "",
    );
    return data.compensations?.find(
      (item) => item.operation_id === operationId,
    );
  }
  function missingPaymentData(p) {
    const missing = [];
    if (!p.beneficiary_name || p.beneficiary_name === "Sin nombre")
      missing.push("titular");
    if (!p.beneficiary_identification || p.beneficiary_identification === "—")
      missing.push("identificación");
    if (!p.bank_snapshot?.bank) missing.push("banco");
    if (!p.bank_snapshot?.account_type) missing.push("tipo de cuenta");
    if (!p.bank_snapshot?.account_number) missing.push("número de cuenta");
    return missing;
  }
  function normalizePayment(p) {
    const b =
        p.liquidation_beneficiaries ||
        data.beneficiaries?.find((x) => x.id === p.beneficiary_id) ||
        {},
      bank = p.beneficiary_bank_accounts || {},
      liquidation = p.liquidations || {},
      items = p.payment_items || [];
    const operations = new Set(
      items.map((x) => x.operation_id).filter(Boolean),
    );
    return {
      ...p,
      payment_kind:
        p.payment_kind || (b.tipo === "ejecutivo" ? "ejecutivo" : "aliado"),
      platform_snapshot: p.platform_snapshot || liquidation.plataforma || null,
      cutoff_snapshot: p.cutoff_snapshot || liquidation.fecha_corte || null,
      operations_count: Number(p.operations_count || operations.size),
      concept:
        p.concept ||
        items
          .map((x) => x.concepto)
          .filter(Boolean)
          .join(", ") ||
        "Liquidación aprobada",
      bank_snapshot:
        p.bank_snapshot ||
        (bank.numero_cuenta
          ? {
              bank: bank.banco,
              account_type: bank.tipo_cuenta,
              account_number: bank.numero_cuenta,
              holder: b.nombre,
              holder_identification: b.identificacion,
            }
          : null),
      beneficiary_name: p.bank_snapshot?.holder || b.nombre || "Sin nombre",
      beneficiary_identification: p.bank_snapshot?.holder_identification || b.identificacion || "—",
      origin_code: b.origen_codigo || null,
      business_snapshot: p.business_snapshot || null,
      executive_names: [
        ...new Set(
          items
            .map(
              (item) =>
                item.liquidation_operations?.ejecutivos?.nombre || null,
            )
            .filter(Boolean),
        ),
      ],
    };
  }
  async function safe(query, required = true) {
    const { data, error } = await query;
    if (error) {
      if (required) throw error;
      return [];
    }
    return data || [];
  }
  async function loadCompensations(tableName = "retail_b2b_compensations", columns = "*") {
    const rows = [], ids = new Set();
    let total;
    do {
      const result = await sb.from(tableName)
        .select(columns, { count: "exact" })
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(rows.length, rows.length + 499);
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || !Number.isInteger(result.count)
        || (total !== undefined && result.count !== total)) {
        throw new Error("No fue posible cargar el historial completo de abonos. Actualiza Tesorería.");
      }
      total = result.count;
      for (const row of result.data) {
        if (!row.id || ids.has(row.id)) throw new Error("El historial de abonos cambió durante la consulta. Actualiza Tesorería.");
        ids.add(row.id);
        rows.push(row);
      }
      if ((result.data.length === 0 && rows.length < total) || rows.length > total)
        throw new Error("La consulta de abonos está incompleta. Actualiza Tesorería.");
    } while (rows.length < total);
    return rows;
  }
  async function loadRecoveryRows(table) {
    const rows=[];
    for (;;) {
      const result=await sb.from(table).select('*').order('id').range(rows.length,rows.length+499);
      if(result.error) throw result.error;
      rows.push(...result.data);
      if(result.data.length<500) return rows;
    }
  }
  async function loadOwnStoreOperations() {
    const rows = [];
    for (;;) {
      const result = await sb.from("liquidation_operations")
        .select("id,liquidation_id,origen_codigo,imei,referencia,modelo,operation_at,reconocida,liquidations(id,plataforma,fecha_corte,estado)")
        .eq("tipo_establecimiento", "propia")
        .order("operation_at", { ascending: false })
        .range(rows.length, rows.length + 499);
      if (result.error) throw result.error;
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  }
  // Cartera vigente, independiente del corte/plataforma de cada compensación.
  // No se modifica account_balance_after: permanece como evidencia histórica.
  async function loadCurrentStoreBalances() {
    const rows = [], ids = new Set();
    let total;
    try {
      do {
        const result = await sb.from('cuenta_corriente')
          .select('id,tienda_codigo,tipo,monto', { count: 'exact' })
          .order('id').range(rows.length, rows.length + 499);
        if (result.error || !Array.isArray(result.data) || !Number.isInteger(result.count)
          || (total !== undefined && total !== result.count)) throw new Error('Cartera incompleta');
        total = result.count;
        for (const row of result.data) {
          if (row.id == null || ids.has(row.id)) throw new Error('Cartera cambió durante la consulta');
          ids.add(row.id);
          rows.push(row);
        }
        if ((!result.data.length && rows.length < total) || rows.length > total) throw new Error('Cartera incompleta');
      } while (rows.length < total);
      return window.CreditekTesoreriaTercerizacion.saldosActualesTiendas(rows);
    } catch {
      return null;
    }
  }
  async function load() {
    const [
      balances,
      destinations,
      payments,
      beneficiaries,
      compensations,
      ownStoreOperations,
      movements,
      suppliers,
      invoices,
      profiles,
      origins,
      rectifications,
      recoveries,
      recoveryApplications,
      reversions,
      currentStoreBalances,
      financialEntries,
      addiLiquidations,
    ] = await Promise.all([
      safe(sb.from("treasury_unit_balances").select("*"), true),
      safe(sb.from("liquidation_treasury_destinations").select("*")),
      loadCompensations("payment_orders",
            "*,liquidation_beneficiaries(id,nombre,identificacion,tipo,origen_codigo),beneficiary_bank_accounts(id,banco,tipo_cuenta,numero_cuenta,validada),liquidations(id,plataforma,fecha_corte,estado,frozen_at,approved_at,approved_by),payment_items(operation_id,concepto,valor,liquidation_operations(ejecutivo_id,ejecutivos(nombre)))",
      ),
      safe(
        sb
          .from("liquidation_beneficiaries")
          .select("id,nombre,identificacion,tipo"),
      ),
      loadCompensations(),
      loadOwnStoreOperations(),
      loadCompensations("treasury_movements"),
      safe(sb.from("proveedores").select("id,nombre").eq("activo", true)),
      safe(
        sb
          .from("facturas_proveedor")
          .select("id,proveedor_id,numero,saldo")
          .gt("saldo", 0),
      ),
      safe(sb.from("perfiles").select("id,nombre")),
      safe(sb.from("origenes").select("codigo,nombre").eq("activo", true)),
      safe(sb.from("liquidation_adjustments").select("id,liquidation_id,new_value,estado").eq("field_name", "krediya_bonos_rectificados")),
      loadRecoveryRows('aliados_recuperaciones'),
      loadRecoveryRows('aliados_cruces_recuperacion'),
      loadRecoveryRows('aliados_reversiones'),
      loadCurrentStoreBalances(),
      financialExpenses ? loadCompensations('financial_entries') : Promise.resolve([]),
      ['gerencia', 'auditoria'].includes(profile?.rol)
        ? safe(sb.rpc('addi_tesoreria_listar'))
        : Promise.resolve([]),
    ]);
    data = {
      balances,
      destinations,
      payments: [],
      beneficiaries,
      compensations,
      ownStoreOperations,
      movements,
      suppliers,
      invoices,
      profiles,
      origins,
      rectifications,
      recoveries,
      reversions,
      recoveryApplications,
      currentStoreBalances,
      financialEntries,
      addiLiquidations,
    };
    data.payments = payments.map(normalizePayment);
    fillCompensationStores();
    render();
    fillSuppliers();
  }
  function filtered(items) {
    const platform = $("#platform").value,
      cutoff = $("#cutoff").value,
      status = $("#status").value,
      q = $("#search").value.trim().toLowerCase();
    return items.filter(
      (x) =>
        (!platform ||
          x.platform_snapshot === platform ||
          x.platform === platform) &&
        (!cutoff || x.cutoff_snapshot === cutoff || x.cutoff_date === cutoff) &&
        (!status || x.status === status || x.estado === status) &&
        (!q ||
          JSON.stringify([
            x.concept,
            x.concepto,
            x.beneficiary,
            x.beneficiary_name,
            x.beneficiary_identification,
            x.bank_snapshot?.holder,
            x.bank_snapshot?.holder_identification,
            paymentBusinessName(x),
            x.store_code,
            data.beneficiaries.find((b) => b.id === x.beneficiary_id)?.nombre,
          ])
            .toLowerCase()
            .includes(q)),
    );
  }
  function fillCompensationStores() {
    const select = $("#compensationStore"), previous = select.value;
    const stores = window.CreditekTesoreriaTercerizacion.tiendasCompensaciones(data.compensations, data.origins);
    select.innerHTML = '<option value="">Todas las tiendas</option>' + stores
      .map(store => `<option value="${esc(store.codigo)}">${esc(store.nombre)}</option>`).join("");
    select.value = stores.some(store => store.codigo === previous) ? previous : "";
  }
  function compensationView() {
    return movementView(data.compensations.filter(x => x.applied_at && !x.reversed_at && (x.accepted_at || x.legacy_applied))
      .map(x => ({ ...x, created_at: x.applied_at })));
  }
  function movementView(rows) {
    return window.CreditekTesoreriaTercerizacion.filtrarMovimientosTiendas(rows, {
      tienda: $("#compensationStore").value,
      desde: $("#compensationFrom").value,
      hasta: $("#compensationTo").value,
      plataforma: $("#compensationPlatform").value,
      imei: $("#compensationImei").value,
      valor: $("#compensationAmount").value,
    });
  }
  function approverName(p) {
    return (
      data.profiles?.find((x) => x.id === p.authorized_by)?.nombre ||
      "Oscar Pacheco"
    );
  }
  function paymentAction(p, missing) {
    if (p.historico_inicial) return "";
    if (p.estado === 'pagado' && !p.soporte_path)
      return `<button class="btn primary" data-payment="${p.id}" data-next="pagado">Adjuntar soporte pendiente</button>`;
    if (missing.length)
      return `<button class="btn primary" data-complete="${p.id}">Completar datos</button>`;
    if (!window.CreditekTesoreriaTercerizacion.loteAutorizado(p))
      return `<span class="approval-pending">${esc(window.CreditekTesoreriaTercerizacion.paymentReadiness(p).reason)}. Primero: Mayte revisa y Oscar aprueba la liquidación.</span>`;
    if (['pendiente','programado'].includes(p.estado) && !window.CreditekTesoreriaTercerizacion.pagoAutorizado(p))
      return canAuthorize()
        ? `<button class="btn primary" data-authorize-payment="${p.id}">Autorizar pago</button>`
        : '<span class="approval-pending">Pendiente de autorización individual de Gerencia</span>';
    if (window.CreditekTesoreriaTercerizacion.paymentReadiness(p).ready)
      return `<button class="btn primary" data-payment="${p.id}" data-next="pagado">Adjuntar soporte y registrar</button>`;
    if (p.estado === 'programado') return `<span class="approval-pending">${esc(window.CreditekTesoreriaTercerizacion.paymentReadiness(p).reason)}</span>`;
    return "";
  }
  function isClosedPayment(p) {
    return Boolean(p.historico_inicial) || (p.estado === 'anulado' && Number(p.valor)===0) || p.estado === "conciliado" || (p.estado === 'pagado' && Boolean(p.soporte_path));
  }
  function paymentHistoryRange() {
    const from = $("#historyFrom")?.value || "";
    const to = $("#historyTo")?.value || "";
    return { from, to, invalid:Boolean(from && to && from > to) };
  }
  function historyRows() {
    return window.CreditekTesoreriaTercerizacion.paymentHistoryRows(
      data.payments || [],
      { from:paymentHistoryRange().from, to:paymentHistoryRange().to, origins: data.origins || [] },
    ).filter((row) => filtered([row.payment]).length);
  }
  function renderPaymentHistory() {
    if (treasuryView !== "history") return;
    const range = paymentHistoryRange();
    $("#historyFilterError").classList.toggle("hidden", !range.invalid);
    for (const id of ["historyFrom","historyTo"]) {
      $("#" + id).setAttribute("aria-invalid", String(range.invalid));
    }
    const rows = historyRows();
    const summary =
      window.CreditekTesoreriaTercerizacion.paymentHistorySummary(rows);
    $("#historySummary").innerHTML = summary.length
      ? summary
          .map(
            (item) =>
              '<article class="history-person"><strong>' +
              esc(item.holder || "Sin titular") +
              "</strong><span>" +
              esc(item.identification || "Sin identificación") +
              "</span><small>" +
              esc(item.businesses.join(", ") || "Sin negocio relacionado") +
              " · " +
              item.payments +
              (item.payments === 1 ? " giro" : " giros") +
              "</small><strong>" +
              cop(item.amount) +
              "</strong></article>",
          )
          .join("")
      : '<div class="empty">No hay giros registrados para el rango y filtros seleccionados.</div>';
    $("#exportPaymentHistory").disabled = !rows.length || range.invalid;
  }
  function exportPaymentHistory() {
    const rows = historyRows();
    if (!rows.length)
      return notice("No hay giros para exportar con estos filtros.", true);
    const csv =
      window.CreditekTesoreriaTercerizacion.paymentHistoryCsv(rows);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    const range = paymentHistoryRange();
    link.download = "kora-historico-giros-" + (range.from || "inicio") + "-a-" + (range.to || "hoy") + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function paymentsForCurrentView() {
    const payments = data.payments.filter((p) =>
      treasuryView === "history" ? isClosedPayment(p) : !isClosedPayment(p),
    );
    const range = paymentHistoryRange();
    if (treasuryView !== "history" || (!range.from && !range.to)) return payments;
    return window.CreditekTesoreriaTercerizacion
      .paymentHistoryRows(payments, {
        from: range.from,
        to: range.to,
        origins: data.origins || [],
      })
      .map((row) => row.payment);
  }
  function paymentGroups(kind) {
    const groups = new Map();
    const source = paymentsForCurrentView().filter((x) => x.payment_kind === kind);
    const visible = treasuryView === "history" ? filtered(source) : source;
    for (const payment of visible) {
      const key = window.CreditekTesoreriaTercerizacion.paymentGroupKey(payment);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(payment);
    }
    return [...groups.values()].flatMap(group => Array.from({length:Math.ceil(group.length/50)},(_,i)=>group.slice(i*50,i*50+50)));
  }
  function paymentCards(kind) {
    const groups = paymentGroups(kind);
    if (!groups.length)
      return '<div class="empty">No hay información para los filtros seleccionados.</div>';
    return `<div class="payment-list">${groups
      .map((group) => {
        const p = group[0],
          ids = group.map((x) => x.id).join(","),
          missing = [...new Set(group.flatMap(missingPaymentData))],
          authorized = group.every((x) => window.CreditekTesoreriaTercerizacion.pagoAutorizado(x)),
          total = group.reduce((n, x) => n + Number(x.valor), 0),
          operations = group.reduce(
            (n, x) => n + Number(x.operations_count),
            0,
          ),
          business = paymentBusinessName(p),
          executives = paymentExecutiveNames(group),
          executiveText = executives.length
            ? esc(executives.join(", "))
            : '<span class="approval-pending">Sin ejecutivo asignado</span>',
          action =
            group.length > 1 && group.every(x => window.CreditekTesoreriaTercerizacion.paymentReadiness(x).ready)
              ? `<button class="btn primary" data-payment-group="${ids}">Adjuntar soporte y registrar</button>`
              : paymentAction(p, missing);
        return `<article class="payment-card">
  <div class="payment-card__top"><div><div class="payment-card__title">${business ? `${esc(business)} <span class="payment-card__holder">· Titular: ${esc(p.beneficiary_name)}</span>` : esc(p.beneficiary_name)}</div><div class="payment-card__ref">${group.length > 1 ? `${group.length} órdenes consolidadas` : `Orden PO-${shortId(p.id)}`} · ${esc([...new Set(group.map((x) => platformName(x.platform_snapshot)))].join(", "))}</div></div>${p.historico_inicial ? badge("pagado", "Histórico pagado") : badge(p.estado)}</div>
  <p class="payment-card__ref">Liquidación: ${window.CreditekTesoreriaTercerizacion.loteAutorizado(p)?'aprobada':'pendiente de aprobación'} · Pago: ${esc(p.estado)}</p>
  ${kind === "aliado" ? `<p class="payment-card__executive"><strong>${executives.length > 1 ? "Ejecutivos" : "Ejecutivo"}:</strong> ${executiveText}</p>` : ""}
  <div class="payment-card__grid"><div class="payment-field"><small>${kind === "ejecutivo" ? "Bonificación total" : "Valor total a girar"}</small><strong>${cop(total)}</strong></div><div class="payment-field"><small>${kind === "ejecutivo" ? "Periodos" : "Cortes"}</small><strong>${esc([...new Set(group.map((x) => date(x.cutoff_snapshot)))].join(", "))}</strong></div><div class="payment-field"><small>Operaciones</small><strong>${operations}</strong></div><div class="payment-field"><small>Cuenta destino</small><strong>${mask(p.bank_snapshot)}</strong>${missing.length ? `<span class="approval-pending">Falta: ${esc(missing.join(", "))}</span>` : ""}</div></div>
  ${group.length > 1 ? `<div class="payment-card__orders">${group.map((x) => `<span>PO-${shortId(x.id)} · ${date(x.cutoff_snapshot)} · ${cop(x.valor)}</span>`).join("")}</div>` : ""}
  ${(data.recoveryApplications||[]).some(a=>group.some(x=>x.id===a.payment_order_id))?`<p>Descuentos por anulaciones: ${cop((data.recoveryApplications||[]).filter(a=>group.some(x=>x.id===a.payment_order_id)).reduce((n,a)=>n+Number(a.importe),0))}. ${total===0?'Sin giro bancario.':'El valor a girar ya incluye estos descuentos.'}</p>`:''}
<div class="payment-card__actions"><div class="${p.historico_inicial || authorized ? "approval-ok" : "approval-pending"}">${p.historico_inicial ? "Cerrado antes del inicio operativo · no requiere soporte" : authorized ? `Pago autorizado por Gerencia · ${esc(bogotaDateTime(p.authorized_at))}` : "Sin autorización de Gerencia"}</div><div class="payment-actions"><button class="btn secondary" data-payment-detail="${p.id}">Ver detalle completo</button>${action}</div></div>
 </article>`;
      })
      .join("")}</div>`;
  }
  function render() {
    let recoverySummary=$('#recoverySummary');
    if(!recoverySummary){recoverySummary=document.createElement('section');recoverySummary.id='recoverySummary';recoverySummary.className='card';$('#outgoingContent').before(recoverySummary);}
    const recoveries=(data.recoveries||[]).filter(d=>d.origen==='beneficio_entregado'&&Number(d.importe)>Number(d.recuperado));
    const debtGroups=new Map();
    for(const d of recoveries){const amount=Number(d.importe)-Number(d.recuperado);debtGroups.set(d.beneficiary_id,(debtGroups.get(d.beneficiary_id)||0)+amount);}
    recoverySummary.hidden=!recoveries.length||treasuryView==='expenses';
    recoverySummary.innerHTML=`<h2>Dinero por recuperar · todos los cortes</h2><p>Se cruza con los próximos pagos del mismo beneficiario. Si no tiene pagos, Gestión debe cobrarlo. No representa dinero ya recuperado.</p><strong>${cop([...debtGroups.values()].reduce((n,v)=>n+v,0))}</strong><details><summary>Ver ${debtGroups.size} beneficiarios</summary>${[...debtGroups].map(([id,value])=>`<p>${esc(data.beneficiaries.find(b=>b.id===id)?.nombre||'Beneficiario sin nombre')} · ${cop(value)}</p>`).join('')}</details>`;
    let correction = $("#rectificationSummary");
    if (!correction) {
      correction = document.createElement("section");
      correction.id = "rectificationSummary";
      correction.className = "card";
      $("#outgoingContent").before(correction);
    }
    const differences = (data.rectifications || []).filter(x => x.estado === "aprobado")
      .flatMap(x => (x.new_value?.diferencias_pagos || []).filter(d => d.estado === "pendiente_validacion_soporte"));
    correction.classList.toggle("hidden", !differences.length || ["cobros", "clients", "preparation"].includes(treasuryView));
    correction.innerHTML = differences.length ? `<h3>Krediya · ajuste numérico aplicado</h3><p>Mayte: validar soportes de ${cop(differences.reduce((n, d) => n + Number(d.diferencia || 0), 0))}. No es un nuevo pago ni dinero recuperado.</p><details><summary>Ver diferencias</summary>${differences.map(d => `<p>${esc(d.nombre)}: registrado ${cop(d.pagado)} · bono correcto ${cop(d.bono_correcto)} · diferencia ${cop(d.diferencia)}</p>`).join("")}</details>` : "";
    $("#cobrosContent").classList.toggle("hidden",treasuryView!=="cobros");
    $("#clientsContent").classList.toggle("hidden",treasuryView!=="clients");
    $("#financialExpensesContent").classList.toggle("hidden",treasuryView!=="expenses");
    $("#showFinancialExpenses").classList.toggle("active",treasuryView==="expenses");
    $("#preparationContent").classList.toggle("hidden",treasuryView!=="preparation");
    $("#showPreparation").classList.toggle("active",treasuryView==="preparation");
    $("#outgoingContent").classList.toggle("hidden",["cobros","clients","preparation","expenses"].includes(treasuryView));
    $("#paymentReport").classList.toggle("hidden",treasuryView!=="operational");
    $("#historyTools").classList.toggle("hidden",treasuryView!=="history");
    $("#showStoreMovements").classList.toggle("active", treasuryView === "storeMovements");
    $("#storeMovementsContent").classList.toggle("hidden", treasuryView !== "storeMovements");
    $("#paymentSections").classList.toggle("hidden", treasuryView === "storeMovements");
    $("#addiAuthorizationSection").classList.toggle("hidden", treasuryView !== "operational" || !['gerencia','auditoria'].includes(profile?.rol));
    $("#generalFilters").classList.toggle("hidden", treasuryView === "storeMovements");
    $("#metrics").classList.toggle("hidden", treasuryView === "storeMovements");
    $("#showClients").classList.toggle("active",treasuryView==="clients");
    $("#showCobros").classList.toggle("active",treasuryView==="cobros");
    $("#showOperational").classList.toggle("active",treasuryView==="operational");
    $("#showHistory").classList.toggle("active",treasuryView==="history");
    if(treasuryView==='expenses'){
      correction.classList.add('hidden');
    }
    if(["cobros","clients","preparation","expenses"].includes(treasuryView))return;
    renderPaymentHistory();
    const out = Number(data.balances.find((x) => x.unit === "tercerizacion")?.balance || 0)-Math.max(0,data.reversions.reduce((n,r)=>n+Number(r.treasury_adjustment),0)),
      ally = data.payments.filter(
        (x) =>
          !isClosedPayment(x) &&
          x.payment_kind === "aliado" &&
          !["pagado", "conciliado"].includes(x.estado),
      ),
      exec = data.payments.filter(
        (x) =>
          !isClosedPayment(x) &&
          x.payment_kind === "ejecutivo" &&
          !["pagado", "conciliado"].includes(x.estado),
      );
    const received = data.destinations.reduce(
        (n, x) => n + Number(x.received_from_platform || 0),
        0,
      ) + (data.addiLiquidations || []).reduce(
        (n, x) => n + Number(x.neto_estimado || 0), 0,
      ),
      comp = data.destinations.reduce(
        (n, x) => n + Number(x.total_b2b_compensations || 0),
        0,
      ) + data.compensations.filter(
        (x) => x.platform === "addi" && !x.reversed_at,
      ).reduce((n, x) => n + Number(x.compensation_value || 0), 0),
      pendingB2B = data.compensations
        .filter((x) => !x.applied_at && !x.reversed_at)
        .reduce((n, x) => n + Number(x.compensation_value || 0), 0),
      outsourcingCredits = data.movements
        .filter((x) => x.unit === "tercerizacion" && x.direction === "credit" && ["pagado", "conciliado"].includes(x.status))
        .reduce((n, x) => n + Number(x.amount), 0),
      expenses = data.movements
        .filter(
          (x) =>
            x.unit === "tercerizacion" &&
            x.direction === "debit" &&
            ["pagado", "conciliado"].includes(x.status),
        )
        .reduce((n, x) => n + Number(x.amount), 0);
    const metrics = [
      { label: "Base calculada de plataformas", value: received, detail: "Referencia operativa; no confirma un ingreso bancario." },
      { label: "Pagos pendientes a aliados", value: ally.reduce((n, x) => n + Number(x.valor), 0), detail: "Órdenes aún no cerradas." },
      { label: "Pagos pendientes a ejecutivos", value: exec.reduce((n, x) => n + Number(x.valor), 0), detail: "Bonificaciones aún no cerradas." },
      { label: "Compensaciones Retail calculadas para B2B", value: comp, detail: "Incluye valores aplicados y pendientes. No es utilidad B2B.", className: "metric-b2b" },
      { label: "Compensaciones pendientes de aplicar a B2B", value: pendingB2B, detail: "Todavía no forman parte del saldo contable B2B.", className: "metric-b2b" },
      { label: "Créditos contabilizados en Tercerización", value: outsourcingCredits, detail: "Suma de movimientos de crédito pagados o conciliados, incluidos los ajustes registrados.", className: "metric-outsourcing" },
      { label: "Débitos contabilizados en Tercerización", value: expenses, detail: "Incluye pagos a ejecutivos, reversiones y otros débitos pagados o conciliados.", className: "metric-outsourcing" },
      { label: "Saldo neto de Tercerización disponible", value: Math.max(0, out), detail: "Saldo contable de Tesorería; debe conciliar con créditos menos débitos.", className: "metric-outsourcing" },
    ];
    const outsourcingDifference = outsourcingCredits - expenses - out;
    if (Math.abs(outsourcingDifference) > 0.01) metrics.push({ label: "Diferencia por conciliar · Tercerización", value: outsourcingDifference, detail: "Los movimientos no coinciden con el saldo contable. Revisar antes de usar este saldo.", className: "metric-outsourcing" });
    if (out < 0) metrics.push({ label: "Faltante operativo por anulaciones", value: -out, detail: "Valor por cubrir antes de nuevas salidas.", className: "metric-outsourcing" });
    $("#metrics").innerHTML = metrics
      .map(
        ({ label, value, detail, className = "" }) =>
          `<article class="metric ${className}"><small>${esc(label)}</small><strong>${cop(value)}</strong><span class="metric-detail">${esc(detail)}</span></article>`,
      )
      .join("");
    $("#allyPayments").innerHTML = paymentCards("aliado");
    $("#executivePayments").innerHTML = paymentCards("ejecutivo");
    const expenseSource = data.movements.filter((x) => {
        if (!x.aliados_gasto_id) return false;
        const closed = ["pagado", "conciliado", "rechazado", "anulado"].includes(x.status);
        return treasuryView === "history" ? closed : !closed;
      });
    const expenseMovements = treasuryView === "history" ? filtered(expenseSource) : expenseSource;
    const financialPending = (data.financialEntries || []).filter(window.CreditekPagosUnificados.approved);
    $("#expensePayments").innerHTML = (treasuryView === "history" ? '' : window.CreditekPagosUnificados.cards(financialPending,cop)) + (expenseMovements.length ? table(
      ["Fecha", "Beneficiario", "Concepto", "Cuenta destino", "Valor", "Estado", "Autorización", "Acción"],
      expenseMovements.map(
        (x) => `<tr><td>${date(x.movement_date)}</td><td>${esc(x.beneficiary)}</td><td>${esc(x.concept)}</td><td class="account">${esc(x.destination_account)}</td><td>${cop(x.amount)}</td><td>${badge(x.status)}</td><td>${x.authorized_by ? `<span class="approval-ok">Autorizado por ${esc(approverName(x))}</span>` : '<span class="approval-pending">Pendiente de Oscar</span>'}</td><td>${movementActions(x)}</td></tr>`,
      ),
    ) : financialPending.length && treasuryView !== 'history' ? '' : '<div class="empty">No hay gastos autorizados pendientes de soporte en esta vista.</div>');
    $("#showOperational").classList.toggle(
      "active",
      treasuryView === "operational",
    );
    $("#showHistory").classList.toggle("active", treasuryView === "history");
    const { rows: visibleCompensations, rangoInvalido } = compensationView();
    const compensatedOperationIds = new Set(
      data.compensations.filter(x => !x.reversed_at).map(x => x.operation_id),
    );
    const unlinkedOperations = (data.ownStoreOperations || []).filter(
      x => x.reconocida !== false && !compensatedOperationIds.has(x.id),
    );
    for (const addi of data.addiLiquidations || []) {
      if (addi.tipo_tienda === 'propia' && !addi.compensacion_id) {
        unlinkedOperations.push({
          origen_codigo: addi.tienda_codigo,
          imei: `Venta Addi #${addi.consecutivo}`,
          addi_id: addi.id,
          liquidation_id: null,
          liquidations: { plataforma: 'addi', estado: 'aprobada', fecha_corte: addi.fecha_venta },
        });
      }
    }
    const pendingCompensations = data.compensations.filter(x => !x.applied_at && !x.reversed_at);
    const awaitingAcceptance = data.compensations.filter(x => x.applied_at && !x.accepted_at && !x.reversed_at && !x.legacy_applied);
    $("#awaitingAcceptanceCount").textContent = awaitingAcceptance.length;
    $("#awaitingAcceptanceSummary").textContent = `${awaitingAcceptance.length} abonos · ${cop(awaitingAcceptance.reduce((sum,x) => sum + Number(x.compensation_value || 0),0))} ya descontados de cartera. No requieren otra aplicación de Gestión.`;
    $("#awaitingAcceptance").innerHTML = awaitingAcceptance.length ? table(
      ["Tienda", "Plataforma", "IMEI", "Abono aplicado", "Fecha de aplicación", "Aplicó", "Estado"],
      awaitingAcceptance.map(x => `<tr><td>${esc(storeName(x.store_code))}</td><td>${esc(platformName(x.platform))}</td><td>${esc(x.imei || '—')}</td><td>${cop(x.compensation_value)}</td><td>${esc(bogotaDateTime(x.applied_at))}</td><td>${esc(data.profiles?.find(p => p.id === x.applied_by)?.nombre || 'Consultar registro de aplicación')}</td><td>${badge('pendiente', 'Pendiente de aceptación de la tienda')}</td></tr>`),
    ) : '<div class="empty">No hay abonos nuevos pendientes de aceptación de la tienda.</div>';
    $("#pendingCompensationCount").textContent = pendingCompensations.length;
    $("#pendingCompensations").innerHTML = table(
      ["Seleccionar", "Tienda", "Plataforma", "Corte", "IMEI", "Abono por aplicar"],
      pendingCompensations.map(x => `<tr><td><input type="checkbox" data-pending-compensation="${x.id}" aria-label="Aplicar abono de ${esc(storeName(x.store_code))}"></td><td>${esc(storeName(x.store_code))}</td><td>${esc(platformName(x.platform))}</td><td>${date(x.cutoff_date)}</td><td>${esc(x.imei)}</td><td>${cop(x.compensation_value)}</td></tr>`),
    );
    $("#applyCompensations").disabled = !pendingCompensations.length || !['gerencia','auditoria'].includes(profile?.rol);
    $("#unlinkedCompensations").innerHTML = table(
      ["Tienda", "Plataforma", "Corte", "IMEI / referencia", "Situación", "Consulta"],
      unlinkedOperations.map(x => {
        const liquidation = x.liquidations || {};
        const detail = [x.imei, x.referencia || x.modelo].filter(Boolean).join(" · ") || "Sin referencia";
        const historical = ['cerrada','pagada'].includes(liquidation.estado);
        return `<tr><td>${esc(storeName(x.origen_codigo))}</td><td>${esc(platformName(liquidation.plataforma))}</td><td>${date(liquidation.fecha_corte || x.operation_at)}</td><td>${esc(detail)}</td><td>${badge(liquidation.estado || "pendiente", x.liquidation_id && historical ? "Histórico por conciliar" : "Sin abono preparado")}</td><td><a class="btn secondary" href="${x.liquidation_id ? `aliados-liquidaciones.html?lote=${encodeURIComponent(x.liquidation_id)}` : `aliados-liquidaciones.html?plataforma=addi&addi=${encodeURIComponent(x.addi_id)}`}">Consultar liquidación</a></td></tr>`;
      }),
    );
    $("#compensationFilterError").classList.toggle("hidden", !rangoInvalido);
    for (const id of ["compensationFrom", "compensationTo"]) {
      $(`#${id}`).setAttribute("aria-invalid", String(rangoInvalido));
    }
    if (!visibleCompensations.some(x => x.id === selectedCompensationId)) selectedCompensationId = null;
    const acceptedCompensations = visibleCompensations.filter(x => x.accepted_at).length;
    const legacyCompensations = visibleCompensations.filter(x => !x.accepted_at && x.legacy_applied).length;
    $("#compensationSummary").textContent = rangoInvalido
      ? "Corrige el rango para consultar los abonos."
      : `${visibleCompensations.length} de ${data.compensations.filter(x => x.applied_at && !x.reversed_at && (x.accepted_at || x.legacy_applied)).length} abonos a cartera · ${acceptedCompensations} con aceptación de tienda · ${legacyCompensations} antiguos sin constancia · Total aplicado de los resultados: ${cop(visibleCompensations.reduce((sum, x) => sum + Number(x.compensation_value || 0), 0))}`;
    const comps = visibleCompensations.map(
        (x) =>
          `<tr><td>${esc(window.CreditekTesoreriaTercerizacion.diaBogota(x.created_at) || 'No disponible')}</td><td><input type="checkbox" data-compensation-select="${x.id}" aria-label="Seleccionar compensación de ${esc(storeName(x.store_code))}" ${selectedCompensationId === x.id ? "checked" : ""}></td><td>${esc(storeName(x.store_code))}</td><td>${esc(platformName(x.platform))}</td><td>${date(x.cutoff_date)}</td><td>${esc(x.imei || "—")}</td><td>${cop(x.compensation_value)}</td><td>${data.currentStoreBalances === null ? 'Saldo no disponible' : cop(data.currentStoreBalances?.get(x.store_code) ?? 0)}</td><td>${badge("pagado", x.accepted_at ? "Aceptado por la tienda" : x.legacy_applied ? "Aplicado antes del control · sin aceptación registrada" : "Aplicado a cartera · falta aceptación")}</td></tr>`,
      );
    $("#compensations").innerHTML = table(
      [
        "Fecha del movimiento",
        "Seleccionar",
        "Tienda",
        "Plataforma",
        "Corte",
        "IMEI",
        "Abono aplicado",
        "Saldo actual de tienda",
        "Estado",
      ],
      comps,
    );
    const retailCommissions = movementView(
      data.movements
        .filter((x) => x.type === "comision_retail")
        .map((x) => {
          const c = commissionCompensation(x);
          return {
            ...x,
            platform: c?.platform,
            cutoff_date: c?.cutoff_date,
            store_code: c?.store_code,
            imei: c?.imei,
            commercial_value: c?.commercial_value,
          };
        }),
    ).rows.map(
      (x) =>
        `<tr><td>${esc(window.CreditekTesoreriaTercerizacion.diaBogota(x.created_at) || 'No disponible')}</td><td>${esc(storeName(x.store_code))}</td><td>${esc(platformName(x.platform))}</td><td>${date(x.cutoff_date || x.movement_date)}</td><td>${esc(x.imei || "—")}</td><td>${cop(x.commercial_value)}</td><td>${cop(x.direction === "debit" ? -Number(x.amount) : x.amount)}${x.platform === "krediya" ? '<small>Margen antes de bonos y gastos</small>' : ''}</td><td>${badge(x.status, x.direction === "debit" ? "Ajuste contable" : "Utilidad contabilizada")}</td></tr>`,
    );
    $("#retailCommissions").innerHTML = table(
      [
        "Fecha del movimiento",
        "Tienda origen",
        "Plataforma",
        "Corte",
        "IMEI",
        "Valor comercial",
        "Utilidad / ajuste de Tercerización",
        "Registro contable",
      ],
      retailCommissions,
    );
    const addiPayouts = (data.addiLiquidations || []).filter(x => x.tipo_tienda === 'propia');
    const addiPending = addiPayouts.filter(x => !x.pago_autorizado_at);
    $("#addiAuthorizationCount").textContent = addiPending.length;
    $("#addiPaymentAuthorizations").innerHTML = addiPayouts.length
      ? addiPayouts.map(x => {
        const bankReady = x.cobro_estado === 'activo' && Number(x.recibido) === Number(x.neto_estimado);
        const state = x.compensacion_aplicada ? 'Compensado a cartera'
          : x.compensacion_id ? 'Autorizado · pendiente de compensar'
          : x.pago_autorizado_at ? 'Autorizado · revisar preparación'
          : bankReady ? 'Pendiente de tu autorización' : 'Pendiente de banco';
        const action = !x.pago_autorizado_at && bankReady && canAuthorize()
          ? `<button class="btn primary" data-authorize-addi="${esc(x.id)}">Autorizar ${cop(x.pago_tienda)} a tienda</button>`
          : x.compensacion_id && !x.compensacion_aplicada
            ? '<button class="btn secondary" data-open-addi-compensations="1">Ver para compensar</button>' : '';
        return `<article class="payment-card"><div class="payment-card__top"><div><strong class="payment-card__title">Venta #${esc(x.consecutivo)} · ${esc(x.tienda || storeName(x.tienda_codigo))}</strong><div class="payment-card__ref">Addi · ${date(x.fecha_venta)} · ${esc(state)}</div></div>${badge(x.compensacion_aplicada ? 'pagado' : x.pago_autorizado_at ? 'programado' : 'pendiente', state)}</div><div class="payment-card__grid"><div class="payment-field"><small>Crédito Addi</small><strong>${cop(x.credito_bruto)}</strong></div><div class="payment-field"><small>Recibido en banco</small><strong>${cop(x.recibido)} / ${cop(x.neto_estimado)}</strong></div><div class="payment-field"><small>Valor pactado a tienda</small><strong>${cop(x.pago_tienda)}</strong></div><div class="payment-field"><small>Autorización individual</small><strong>${x.pago_autorizado_at ? bogotaDateTime(x.pago_autorizado_at) : 'No autorizada'}</strong></div></div><div class="payment-card__actions"><span class="${x.pago_autorizado_at ? 'approval-ok' : 'approval-pending'}">${esc(state)} · ${x.pago_autorizado_at ? 'No vuelve a autorizarse ni descontarse' : 'Autorizar no aplica el abono'}</span><div class="payment-actions">${action}</div></div></article>`;
      }).join('')
      : '<p class="section-copy">No hay liquidaciones Addi de tiendas propias aprobadas.</p>';
    const selected = visibleCompensations.find(
      (x) => x.id === selectedCompensationId,
    );
    $("#compensationSelection").textContent = selected
      ? `${storeName(selected.store_code)} · ${cop(selected.compensation_value)} · IMEI ${selected.imei || "—"}`
      : "Ninguna compensación seleccionada";
    $("#openStoreLedger").disabled = !selected;
    $("#allyCount").textContent = ally.length;
    $("#executiveCount").textContent = exec.length;
    $("#expenseCount").textContent = expenseMovements.length + (treasuryView === 'history' ? 0 : financialPending.length);
    $("#compensationCount").textContent = visibleCompensations.length;
    $("#retailCommissionCount").textContent = retailCommissions.length;
    bindActions();
  }
  function movementActions(m) {
    if (m.direction === "credit") return "";
    if (m.status === "pendiente") {
      if ((m.type === "retiro_socios" || m.aliados_gasto_id) && !m.authorized_by)
        return canAuthorize()
          ? `<button class="btn primary" data-authorize="${m.id}">Autorizar pago</button>`
          : '<span class="approval-pending">Esperando autorización de Oscar</span>';
      return `<button class="btn secondary" data-movement="${m.id}" data-next="programado">Programar</button>`;
    }
    if (m.status === "programado")
      return `<button class="btn primary" data-movement="${m.id}" data-next="pagado">Registrar pago</button>`;
    if (m.status === "pagado")
      return `<button class="btn secondary" data-movement="${m.id}" data-next="conciliado">Conciliar</button>`;
    return "";
  }
  function bindActions() {
    document.querySelectorAll('[data-authorize-addi]').forEach(button => {
      button.onclick = async () => {
        const row = (data.addiLiquidations || []).find(x => x.id === button.dataset.authorizeAddi);
        if (!row || row.pago_autorizado_at || !canAuthorize()) return;
        if (!confirm(`¿Autorizar el pago pactado de ${cop(row.pago_tienda)} a ${row.tienda || storeName(row.tienda_codigo)} por la venta Addi #${row.consecutivo}?\n\nQuedará pendiente para que Gestión lo compense; esta acción no aplica el abono.`)) return;
        button.disabled = true;
        try {
          const { error } = await sb.rpc('addi_pago_autorizar', { p_addi_id: row.id });
          if (error) throw error;
          await load();
          notice('Pago Addi autorizado y abono preparado. Gestión aún debe aplicar la compensación.');
        } catch (error) {
          notice(error.message || 'No se autorizó el pago Addi.', true);
          button.disabled = false;
        }
      };
    });
    document.querySelectorAll('[data-open-addi-compensations]').forEach(button => {
      button.onclick = () => { treasuryView = 'storeMovements'; render(); };
    });
    document.querySelectorAll('[data-financial-support]').forEach(button=>button.onclick=()=>openFinancialSupport(button.dataset.financialSupport));
    $("#applyCompensations").onclick = async () => {
      const ids = [...document.querySelectorAll('[data-pending-compensation]:checked')].map(x => x.dataset.pendingCompensation);
      if (!ids.length) return notice('Selecciona los abonos que revisaste.', true);
      const amount = data.compensations.filter(x => ids.includes(x.id)).reduce((sum,x) => sum + Number(x.compensation_value),0);
      if (!confirm(`Confirmo que revisé estos ${ids.length} créditos. Aplicar ${cop(amount)} a las carteras seleccionadas. La tienda deberá aceptar después.`)) return;
      $("#applyCompensations").disabled = true;
      try {
        const { data: applied, error } = await sb.rpc('aplicar_compensaciones_gestion', { p_ids: ids });
        if (error) throw error;
        await load();
        notice(`${applied} abonos aplicados. Quedan pendientes de aceptación en cada tienda.`);
      } catch (error) { notice(error.message, true); }
      finally { $("#applyCompensations").disabled = !data.compensations.some(x => !x.applied_at && !x.reversed_at); }
    };
    document
      .querySelectorAll("[data-payment]")
      .forEach(
        (b) =>
          (b.onclick = () => changePayment(b.dataset.payment, b.dataset.next)),
      );
    document
      .querySelectorAll("[data-payment-group]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            openPaymentSupport(b.dataset.paymentGroup.split(","))),
      );
    document
      .querySelectorAll("[data-authorize-payment]")
      .forEach(
        (b) => (b.onclick = () => authorizePayment(b.dataset.authorizePayment)),
      );
    document
      .querySelectorAll("[data-payment-detail]")
      .forEach(
        (b) => (b.onclick = () => openPaymentDetail(b.dataset.paymentDetail)),
      );
    document
      .querySelectorAll("[data-complete]")
      .forEach(
        (b) => (b.onclick = () => completePaymentData(b.dataset.complete)),
      );
    document
      .querySelectorAll("[data-movement]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            changeMovement(b.dataset.movement, b.dataset.next)),
      );
    document
      .querySelectorAll("[data-authorize]")
      .forEach((b) => (b.onclick = () => authorize(b.dataset.authorize)));
    document.querySelectorAll("[data-compensation-select]").forEach(
      (input) =>
        (input.onchange = () => {
          selectedCompensationId = input.checked
            ? input.dataset.compensationSelect
            : null;
          render();
        }),
    );
  }
  async function authorizePayment(id) {
    const preview=await sb.rpc('aliados_previsualizar_cruce',{p_id:id});
    if(preview.error) return notice(preview.error.message,true);
    const v=preview.data;
    if(Number(v.recuperacion)>0&&!confirm(`Pago antes del cruce: ${cop(v.pago)}\nDescuento por anulación: ${cop(v.recuperacion)}\nValor a girar: ${cop(v.neto)}\nSaldo aún por cobrar: ${cop(v.saldo_por_cobrar)}\n\n¿Confirmas este cruce y autorizas únicamente el valor neto?`))return;
    const { error } = await sb.rpc("aliados_autorizar_pago_con_cruce", { p_id: id,p_neto_esperado:Number(v.neto) });
    if (error)
      return notice(
        error.message || "Solo Oscar Pacheco puede autorizar este pago.",
        true,
      );
    notice(Number(v.neto)===0?'Cruce registrado. No hay giro ni se requiere un comprobante bancario ficticio.':"Pago neto autorizado por Gerencia. Maite ya puede adjuntar el soporte.");
    await load();
  }
  function syncPaymentModalState() {
    const open = Boolean(document.querySelector("body > .modal.show"));
    document.documentElement.classList.toggle("kora-payment-modal-open", open);
    document.body.classList.toggle("kora-payment-modal-open", open);
  }
  function showPaymentModal(modal) {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    syncPaymentModalState();
  }
  function hidePaymentModal(modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    syncPaymentModalState();
  }
  function closePaymentDetail() {
    hidePaymentModal($("#paymentDetailModal"));
  }
  function openPaymentDetail(id) {
    const p = data.payments.find((x) => x.id === id);
    if (!p) return;
    const bank = p.bank_snapshot || {},
      executives = paymentExecutiveNames(p),
      authorized = window.CreditekTesoreriaTercerizacion.pagoAutorizado(p);
    $("#paymentDetailBody").innerHTML = `<div class="payment-detail-grid">
 <div><small>Orden KORA</small><strong>PO-${shortId(p.id)}</strong></div><div><small>Estado</small><strong>${p.historico_inicial ? "Histórico pagado · sin soporte requerido" : esc(String(p.estado || "—").replaceAll("_", " "))}</strong></div>
 <div><small>Negocio relacionado</small><strong>${esc(paymentBusinessName(p) || "No aplica")}</strong></div><div><small>Titular / beneficiario</small><strong>${esc(p.beneficiary_name)}</strong></div>
 ${p.payment_kind === "aliado" ? `<div><small>Ejecutivo</small><strong>${executives.length ? esc(executives.join(", ")) : "Sin ejecutivo asignado"}</strong></div>` : ""}
 <div><small>Identificación</small><strong>${esc(p.beneficiary_identification)}</strong></div><div><small>Fecha real del pago</small><strong>${date(p.fecha_pagada)}</strong></div>
 <div><small>Plataforma</small><strong>${esc(platformName(p.platform_snapshot))}</strong></div><div><small>Fecha de corte</small><strong>${date(p.cutoff_snapshot)}</strong></div>
 <div><small>Operaciones incluidas</small><strong>${p.operations_count}</strong></div><div><small>Valor autorizado</small><strong>${cop(p.valor)}</strong></div>
 <div><small>Banco / tipo</small><strong>${esc(bank.bank || "Pendiente")} · ${esc(bank.account_type || "Pendiente")}</strong></div><div><small>Número de cuenta</small><strong class="account">${esc(bank.account_number || "Pendiente")}</strong></div>
 <div><small>Titular de la cuenta</small><strong>${esc(bank.holder || p.beneficiary_name)}</strong></div><div><small>Identificación del titular</small><strong>${esc(bank.holder_identification || p.beneficiary_identification)}</strong></div>
 <div class="wide"><small>Concepto</small><strong>${esc(p.concept)}</strong></div><div class="wide"><small>Autorización de Gerencia</small><strong class="${authorized ? "approval-ok" : "approval-pending"}">${authorized ? `Pago autorizado por Gerencia · ${esc(bogotaDateTime(p.authorized_at))}` : "Pendiente de autorización de Oscar Pacheco"}</strong></div>
 </div>`;
    showPaymentModal($("#paymentDetailModal"));
    $("#closePaymentDetail").focus();
  }
  async function completePaymentData(id) {
    const p = data.payments.find((x) => x.id === id);
    if (!p) return;
    if (!clients) return notice('No tienes permiso para editar titulares y cuentas.',true);
    if(!p.bank_account_id&&!p.bank_snapshot&&p.estado==='pendiente'&&!p.authorized_at&&!p.authorized_by){
      const result=await sb.from('beneficiary_bank_accounts').select('id,banco,tipo_cuenta,numero_cuenta').eq('beneficiary_id',p.beneficiary_id).eq('activo',true).eq('validada',true);
      if(result.error)return notice(result.error.message,true);
      if(result.data?.length===1){
        const a=result.data[0];
        if(!confirm(`Vincular a esta orden la cuenta validada de ${p.liquidation_beneficiaries?.nombre||'su beneficiario'}: ${a.banco}, ${a.tipo_cuenta}, terminada en ${String(a.numero_cuenta).slice(-4)}.\n\nNo cambia el importe ni autoriza el pago. ¿Vincular cuenta?`))return;
        const linked=await sb.rpc('tesoreria_vincular_cuenta_orden',{p_orden:id,p_cuenta:a.id});
        if(linked.error)return notice(linked.error.message,true);
        await load();notice('Cuenta vinculada. El pago sigue pendiente de autorización de Gerencia.');return;
      }
    }
    treasuryView='clients';render();
    await clients.mount($("#clientsContent"));
    clients.openBeneficiary(p.beneficiary_id);
  }
  function validateSupport(file) {
    if (!file) return "Selecciona una imagen o un archivo PDF.";
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.type))
      return "El soporte debe ser JPG, PNG o PDF.";
    if (file.size > 10 * 1024 * 1024)
      return "El archivo supera el límite de 10 MB.";
    return "";
  }
  async function upload(file, folder) {
    const validation = validateSupport(file);
    if (validation) throw new Error(validation);
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase(),
      path = `aliados/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage
      .from("soportes")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }
  function closePaymentSupport() {
    pendingFinancialId = null;
    pendingPaymentIds = [];
    $("#paymentSupportForm").reset();
    $("#paymentSupportSelected").classList.add("hidden");
    $("#paymentSupportError").classList.add("hidden");
    hidePaymentModal($("#paymentSupportModal"));
  }
  function openPaymentSupport(ids) {
    pendingFinancialId = null;
    pendingPaymentIds = Array.isArray(ids) ? ids : [ids];
    const payments = pendingPaymentIds
      .map((id) => data.payments.find((x) => x.id === id))
      .filter(Boolean);
    if (!payments.length) return;
    const blocked = payments.map(p => ({p,check:window.CreditekTesoreriaTercerizacion.paymentReadiness(p)})).filter(x=>!x.check.ready);
    if (blocked.length) return notice(blocked.map(x=>x.check.reason).join('. '),true);
    const total = payments.reduce((n, p) => n + Number(p.valor), 0);
    $("#paymentSupportSummary").textContent =
      `${payments[0].beneficiary_name} · ${payments.length} ${payments.length === 1 ? "orden" : "órdenes"} · ${cop(total)}`;
    $("#paymentSupportError").classList.add("hidden");
    $("#paymentSupportSelected").classList.add("hidden");
    showPaymentModal($("#paymentSupportModal"));
    $("#paymentSupportFile").focus();
  }
  function openFinancialSupport(id) {
    const row=data.financialEntries?.find(x=>x.id===id);
    if(!financialRecorder||!row||!window.CreditekPagosUnificados.approved(row))return notice('Actualiza los gastos antes de registrar el pago.',true);
    closePaymentSupport();
    pendingFinancialId=id;
    $("#paymentSupportSummary").textContent=`${row.beneficiary} · ${row.concept} · ${cop(row.amount)}. Adjunta el comprobante del giro realizado.`;
    showPaymentModal($("#paymentSupportModal"));
    $("#paymentSupportFile").focus();
  }
  async function submitPaymentSupport(event) {
    event.preventDefault();
    if($("#savePaymentSupport").disabled)return;
    if(pendingFinancialId){
      const id=pendingFinancialId,button=$("#savePaymentSupport"),errorBox=$("#paymentSupportError");
      button.disabled=true;button.textContent='Subiendo soporte…';errorBox.classList.add('hidden');
      try{
        await financialRecorder.record(id,$("#paymentSupportFile").files[0]);
        closePaymentSupport();notice('Pago registrado con evidencia. Se conserva la autorización original.');
        await load().catch(()=>notice('Pago confirmado. Actualiza Tesorería para consultar el estado.',true));
        await financialExpenses.refreshSummary();
      }catch(error){errorBox.textContent=error.message||'No se confirmó el registro. Actualiza antes de reintentar.';errorBox.classList.remove('hidden');}
      finally{button.disabled=false;button.textContent='Subir soporte y registrar pago';}
      return;
    }
    const file = $("#paymentSupportFile").files[0],
      validation = validateSupport(file),
      errorBox = $("#paymentSupportError"),
      button = $("#savePaymentSupport"),
      payments = pendingPaymentIds
        .map((id) => data.payments.find((x) => x.id === id))
        .filter(Boolean);
    if (validation) {
      errorBox.textContent = validation;
      errorBox.classList.remove("hidden");
      return;
    }
    if (!payments.length) return closePaymentSupport();
    const blocked = payments.map(p=>window.CreditekTesoreriaTercerizacion.paymentReadiness(p)).find(x=>!x.ready);
    if (blocked) {
      errorBox.textContent = blocked.reason;
      errorBox.classList.remove("hidden");
      return;
    }
    button.disabled = true;
    button.textContent = "Subiendo soporte…";
    errorBox.classList.add("hidden");
    let support = null, recorded = false;
    try {
      support = await upload(file, "pagos");
      const rpc = sb.rpc("tesoreria_cerrar_pagos_con_soporte", {p_ids:pendingPaymentIds,p_soporte_path:support});
      const { error } = await rpc;
      if (error) throw error;
      recorded = true;
      closePaymentSupport();
      notice(
        `${payments.length} ${payments.length === 1 ? "pago registrado" : "pagos registrados"} con un único soporte.`,
      );
      await load();
    } catch (error) {
      if (recorded) {
        notice('El pago quedó registrado con soporte. No se pudo actualizar la lista; pulsa Actualizar, no vuelvas a registrarlo.',true);
        return;
      }
      // Una respuesta perdida puede ocultar un pago ya confirmado. Nunca borrar
      // su comprobante sin comprobar que ninguna orden lo está utilizando.
      if (support) {
        try {
          const referenced = await sb.from('payment_orders').select('id').eq('soporte_path',support);
          if (!referenced.error && Array.isArray(referenced.data)) {
            if (payments.every(p=>referenced.data.some(r=>r.id===p.id))) {
              closePaymentSupport();
              notice('Pago confirmado con su soporte. No se repitió el registro.');
              await load().catch(()=>notice('El pago está confirmado. Actualiza la lista para ver su estado.',true));
              return;
            }
            if (referenced.data.length === 0) await sb.storage.from("soportes").remove([support]);
          }
        } catch {
          notice('No fue posible confirmar el resultado. Conservamos el soporte; actualiza Tesorería antes de reintentar.',true);
        }
      }
      console.error("No fue posible registrar el soporte del pago", error);
      errorBox.textContent =
        error?.message ||
        "No fue posible cargar el soporte y registrar el pago.";
      errorBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
      button.textContent = "Subir soporte y registrar pago";
    }
  }
  async function askSupport(folder) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    return new Promise((resolve) => {
      input.onchange = async () => {
        try {
          resolve(await upload(input.files[0], folder));
        } catch (error) {
          notice(
            error?.message || "No fue posible cargar el soporte privado.",
            true,
          );
          resolve(null);
        } finally {
          input.remove();
        }
      };
      input.addEventListener(
        "cancel",
        () => {
          input.remove();
          resolve(null);
        },
        { once: true },
      );
      input.click();
    });
  }
  async function changePayment(id, next) {
    if (next === "pagado") return openPaymentSupport(id);
    const { error } = await sb.rpc("aliados_cambiar_estado_pago", {
      p_id: id,
      p_estado: next,
      p_soporte_path: null,
    });
    if (error)
      return notice(
        "No fue posible actualizar el pago. Verifica el estado y la autorización.",
        true,
      );
    notice("Pago actualizado y auditado.");
    await load();
  }
  async function paymentReport() {
    if(financialAccessError)return notice('No se pudo verificar el acceso a gastos. Actualiza la página antes de generar una orden completa.',true);
    const button=$("#paymentReport");
    if(button.disabled)return;
    button.disabled=true;
    try { await load(); }
    catch { notice('No se pudo consultar la orden completa. No se generó un documento parcial; actualiza Tesorería.',true);return; }
    finally {button.disabled=false;}
    // One order for every authorized unpaid item. Platform/date filters only affect consultation.
    const rows = window.CreditekPagosUnificados.reportRows(data.payments || [],data.financialEntries || [],data.movements || [],window.CreditekTesoreriaTercerizacion.paymentReadiness);
    if (!rows.length)
      return notice(
        "No hay órdenes listas para pagar con estos filtros. Revisa la aprobación de los lotes y sus autorizaciones.",
        true,
      );
    const incomplete = rows.filter((p) => missingPaymentData(p).length || !Number.isFinite(Number(p.valor)) || Number(p.valor)<=0);
    if (incomplete.length) {
      notice(
        `No se generó una orden parcial. Revisa beneficiario, identificación, cuenta o valor: ${incomplete.map(p=>p.concept || p.beneficiary_name).join(', ')}.`,
        true,
      );
      document
        .querySelector(`[data-complete="${incomplete[0].id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const now = new Date(),
      total = rows.reduce((n, p) => n + Number(p.valor || 0), 0),
      generated = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(now),
      stamp = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Bogota",
      })
        .formatToParts(now)
        .reduce((o, x) => ((o[x.type] = x.value), o), {}),
      reportId = `OP-${stamp.year}${stamp.month}${stamp.day}-${stamp.hour}${stamp.minute}${stamp.second}`,
      logo = new URL("../shared/branding/creditek-logo.png", location.href)
        .href;
    const liquidationRefs = [
      ...new Map(
        rows
          .filter((p) => p.liquidation_id)
          .map((p) => [
            p.liquidation_id,
            { id: p.liquidation_id, approvedAt: p.liquidations?.approved_at },
          ]),
      ).values(),
    ];
    // Render inside KORA: installed apps and popup blockers must not hide the order.
    document.getElementById('treasuryPaymentReportDialog')?.remove();
    const reportDialog = document.createElement('dialog');
    reportDialog.id = 'treasuryPaymentReportDialog';
    reportDialog.setAttribute('aria-label', 'Orden de pagos autorizados');
    reportDialog.style.cssText = 'width:96vw;max-width:1500px;padding:16px;border:1px solid #cbd5e1;border-radius:12px';
    reportDialog.innerHTML = '<button type="button" class="btn secondary" data-close-report>Cerrar orden</button><p>Revisa el destino y utiliza «Imprimir / Guardar PDF» al final de la orden. Generar este documento no registra un pago.</p><iframe title="Orden de pagos autorizados para imprimir" style="width:100%;height:75vh;border:0"></iframe>';
    document.body.appendChild(reportDialog);
    reportDialog.querySelector('[data-close-report]').onclick = () => reportDialog.close();
    reportDialog.addEventListener('close', () => reportDialog.remove());
    reportDialog.showModal();
    const report = reportDialog.querySelector('iframe').contentWindow;
    if (!report)
      return notice("No fue posible abrir la orden. Cierra la vista e intenta nuevamente.", true);
    report.document.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(reportId)} · Orden de pagos Creditek</title><style>
@page{size:A4 portrait;margin:10mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Montserrat,Arial,sans-serif;color:#0B1E3D;margin:0}
.head{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:3px solid #00C4CC;padding-bottom:7px}
.brand{display:flex;align-items:center;gap:12px}.head img{width:105px;max-height:44px;object-fit:contain}
.head h1{margin:0;font-size:23px;line-height:1.15}.eyebrow{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#4b6b7e;margin-bottom:3px}
.meta{font-size:11px;color:#536176;line-height:1.3;text-align:right;max-width:290px}
.summary{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 0;padding:6px 8px;border:1px solid #b7e9ec;border-radius:6px;background:#eefbfd;font-size:11px}
.summary strong{font-size:20px;margin-right:4px}.summary .money{font-size:20px}
table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11.5px;line-height:1.2}
thead{display:table-header-group}th{background:#0B1E3D;color:#fff;padding:6px 4px;text-align:left;font-size:10.5px;overflow-wrap:anywhere}
td{padding:3px 4px;border-bottom:1px solid #dfe5ec;vertical-align:top;overflow-wrap:anywhere}
tr{break-inside:avoid}.money{text-align:right;font-size:12px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.payment-number{font-size:13px;font-weight:700}.account{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.internal-ref{display:block;color:#64748b;font-size:8px;line-height:1.2;margin-top:2px;white-space:nowrap}
.muted{display:block;color:#536176;font-size:11px;line-height:1.2}.total td{font-size:14px;font-weight:800;padding:6px 4px;border-top:2px solid #00C4CC;background:#eefbfd}
.trace{margin-top:6px;font-size:10.5px;line-height:1.2;color:#536176}.foot{display:flex;justify-content:space-between;gap:12px;margin-top:6px;padding-top:5px;border-top:1px solid #ccd6e0;font-size:10px;color:#536176}
.tools{position:sticky;bottom:0;display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:10px 0;background:#fff}
.print-note{font-size:11px;max-width:330px}.no-print button{background:#00C4CC;color:#0B1E3D;border:0;border-radius:10px;padding:12px 18px;font-weight:800}
@media print{.no-print{display:none!important}}
</style></head><body>
<header class="head"><div class="brand"><img src="${esc(logo)}" alt="Creditek"><div><div class="eyebrow">Tesorería</div><h1>Orden de pagos</h1></div></div><div class="meta">${esc(generated)}<br>Responsable: ${esc(profile?.nombre || profile?.email || "Usuario KORA")}</div></header>
<section class="summary"><span><strong>${rows.length}</strong> pagos autorizados</span><span>${liquidationRefs.length} liquidaciones</span><span>Total <strong class="money">${cop(total)}</strong></span></section>
<table><colgroup><col style="width:7%"><col style="width:33%"><col style="width:22.5%"><col style="width:23%"><col style="width:14.5%"></colgroup><thead><tr><th>N.º</th><th>Beneficiario</th><th>Cuenta destino</th><th>Concepto y fecha</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows.map((p, i) => {
        const holder = p.bank_snapshot.holder || p.beneficiary_name;
        const business = p.report_business || paymentBusinessName(p);
        const platform = p.liquidation_id ? platformName(p.platform_snapshot) : "";
        const concept = String(p.concept || "");
        // Only shorten known generated descriptions when their platform/date match.
        // Custom concepts and discrepancies stay complete; no accounting data changes.
        const credit = /^Pago de (\d+) créditos (.+?) [—/-] corte (\d{4}-\d{2}-\d{2})$/i.exec(concept);
        const bonus = /^Bonos y comisiones [—/-] (.+?) [—/-] corte (\d{4}-\d{2}-\d{2})$/i.exec(concept);
        const samePlatform = value => [platform, p.platform_snapshot].some(x => String(x || "").toLowerCase() === value.toLowerCase());
        const shortCredit = p.liquidation_id && credit && credit[3] === String(p.cutoff_snapshot) && samePlatform(credit[2]);
        const shortBonus = p.liquidation_id && bonus && bonus[2] === String(p.cutoff_snapshot) && samePlatform(bonus[1]);
        const label = shortCredit ? (credit[1] + " crédito" + (Number(credit[1]) === 1 ? "" : "s") + " " + platform) : shortBonus ? "Bonos y comisiones" : concept;
        const separateBusiness = business && business !== "No aplica" && String(business).trim().toLowerCase() !== String(holder || "").trim().toLowerCase();
        return `<tr><td><span class="payment-number">${i + 1}</span><span class="internal-ref" title="${esc(p.report_ref)}">Ref. ${esc(String(p.report_ref || "").slice(-4).toUpperCase())}</span></td><td>${separateBusiness ? `<strong>${esc(business)}</strong><span class="muted">${esc(holder)}</span>` : `<strong>${esc(holder)}</strong>`}<span class="muted">${esc(p.bank_snapshot.holder_identification || p.beneficiary_identification)}</span></td><td><span class="account">${esc(p.bank_snapshot.account_number)}</span><span class="muted">${esc(p.bank_snapshot.bank)} ${esc(p.bank_snapshot.account_type)}</span></td><td>${esc(label)}<span class="muted">${p.liquidation_id ? `${shortCredit ? "" : esc(platform) + " "}${date(p.cutoff_snapshot)}` : `${esc(p.report_kind)} ${esc(p.report_date)}`}</span></td><td class="money">${cop(p.valor)}</td></tr>`;
      }).join("")}<tr class="total"><td colspan="4">TOTAL A GIRAR</td><td class="money">${cop(total)}</td></tr></tbody></table>
<section class="trace">Pendientes de pago y soporte. La referencia corta es interna, no un comprobante bancario.<details class="no-print"><summary>Trazabilidad KORA · referencias completas</summary>${rows.map((p, i) => `<div>${i + 1}: ${esc(p.report_ref)}${p.liquidation_id ? ` · LQ-${shortId(p.liquidation_id)}` : ""} · ${esc(p.concept)}</div>`).join("")}</details></section>
<footer class="foot"><span>Creditek S.A.S. · NIT 901.259.859-0 · Valores en COP</span><span>${esc(reportId)}</span></footer>
<div class="tools no-print"><div class="print-note">Para un PDF limpio, desactiva “Encabezados y pies de página” en Más ajustes.</div><button onclick="window.print()">Imprimir / Guardar PDF</button></div></body></html>`,
    );
    report.document.close();
  }
  async function changeMovement(id, next) {
    let support = null;
    if (next === "pagado") {
      support = await askSupport("tesoreria");
      if (!support) return;
    }
    const { error } = await sb.rpc("tesoreria_cambiar_estado_movimiento", {
      p_id: id,
      p_status: next,
      p_support_path: support,
    });
    if (error)
      return notice(
        "No fue posible actualizar el movimiento. Verifica saldo, soporte y autorización.",
        true,
      );
    notice("Movimiento actualizado y auditado.");
    await load();
  }
  async function authorize(id) {
    const { error } = await sb.rpc("tesoreria_autorizar_movimiento", {
      p_id: id,
    });
    if (error)
      return notice("Solo Óscar puede autorizar este movimiento.", true);
    notice("Movimiento autorizado.");
    await load();
  }
  function updateTypes() {
    const unit = $("#movementForm [name=unit]").value,
      type = $("#movementForm [name=type]");
    type.innerHTML = TYPES[unit]
      .map(([v, l]) => `<option value="${v}">${l}</option>`)
      .join("");
    type.onchange = toggleSupplier;
    toggleSupplier();
  }
  function toggleSupplier() {
    const show = $("#movementForm [name=type]").value === "pago_proveedor";
    $("#supplierWrap").classList.toggle("hidden", !show);
    $("#invoiceWrap").classList.toggle("hidden", !show);
  }
  function fillSuppliers() {
    if (!$("#movementForm")) return;
    $("#movementForm [name=supplier_id]").innerHTML =
      '<option value="">Selecciona</option>' +
      data.suppliers
        .map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`)
        .join("");
    fillInvoices();
  }
  function fillInvoices() {
    const supplier = $("#movementForm [name=supplier_id]").value;
    $("#movementForm [name=supplier_invoice_id]").innerHTML =
      '<option value="">Selecciona</option>' +
      data.invoices
        .filter((x) => !supplier || x.proveedor_id === supplier)
        .map(
          (x) =>
            `<option value="${x.id}">${esc(x.numero)} · ${cop(x.saldo)}</option>`,
        )
        .join("");
  }
  async function submitMovement(event) {
    event.preventDefault();
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form)),
      file = form.elements.support.files[0];
    let support = null;
    if (file) {
      try {
        support = await upload(file, "tesoreria");
      } catch {
        return notice("No fue posible cargar el soporte privado.", true);
      }
    }
    const input = {
        unidad: values.unit,
        tipo: values.type,
        valor: Number(values.amount),
        saldo: Number(
          data.balances.find((x) => x.unit === values.unit)?.balance || 0,
        ),
      },
      check = window.CreditekTesoreriaTercerizacion.validarMovimiento(input);
    if (!check.ok)
      return notice(
        check.error === "saldo_insuficiente"
          ? "El valor supera el saldo disponible."
          : "El tipo no corresponde a la unidad económica.",
        true,
      );
    const params = {
      p_unit: values.unit,
      p_type: values.type,
      p_beneficiary: values.beneficiary,
      p_concept: values.concept,
      p_amount: Number(values.amount),
      p_destination_account: values.destination_account,
      p_date: values.movement_date,
      p_support_path: support,
      p_liquidation_id: null,
      p_supplier_id: values.supplier_id || null,
      p_supplier_invoice_id: values.supplier_invoice_id || null,
      p_idempotency_key: crypto.randomUUID(),
    };
    const { error } = await sb.rpc("tesoreria_registrar_movimiento", params);
    if (error)
      return notice(
        "No fue posible registrar el movimiento. Verifica saldo y campos obligatorios.",
        true,
      );
    $("#movementDialog").close();
    form.reset();
    notice("Movimiento preparado y auditado.");
    await load();
  }
  async function init() {
    if (initialized || !window.creditekSidebar?.sb) return;
    initialized = true;
    sb = window.creditekSidebar.sb;
    profile = window.creditekSidebar.perfil;
    try {
      const access = await sb.rpc('es_controlador_financiero');
      if(access.error)throw access.error;
      if (!access.error && access.data === true) {
        financialExpenses = window.CreditekTesoreriaGastos.create({sb,profile,domain:window.KoraFinancialDomain,onSummary:summary=>window.CreditekTesoreriaGastos.paintIndicator($("#showFinancialExpenses"),summary)});
        financialRecorder = window.CreditekPagosUnificados.createRecorder(sb);
        $("#showFinancialExpenses").classList.remove('hidden');
        await financialExpenses.refreshSummary();
        // Read-only refresh: never replace an approval form while it is being edited.
        const refreshExpenseIndicator=()=>{if(!document.hidden)financialExpenses.refreshSummary();};
        const expenseTimer=setInterval(refreshExpenseIndicator,60000);
        window.addEventListener('focus',refreshExpenseIndicator);
        document.addEventListener('visibilitychange',refreshExpenseIndicator);
        window.addEventListener('pagehide',()=>clearInterval(expenseTimer),{once:true});
      }
    } catch (error) { financialAccessError=true;console.error('No se pudo comprobar el acceso a gastos de Tesorería',error); }
    if(profile?.activo && ['gerencia','auditoria'].includes(profile.rol)) {
      cobros=window.CreditekCobrosPlataformas.create({sb,money:cop,canEdit:profile.rol==='gerencia',canVoid:profile.rol==='gerencia'});
      $("#showCobros").classList.remove("hidden");
    }
    if (!canViewOutgoing() && !cobros && !financialExpenses) {
      $("#accessDenied").classList.remove("hidden");
      return;
    }
    $("#pageContent").classList.remove("hidden");
    // The same server capability protects both the directory and its save RPC.
    try {
      const clientAccess = await sb.rpc('tiene_capacidad_aliados', {p_capacidad:'revisor'});
      if (!clientAccess.error && clientAccess.data === true) {
        clients = window.CreditekTesoreriaClientes.create({sb,profile});
        preparation = window.CreditekTesoreriaPreparacion.create({sb});
        $("#showPreparation").classList.remove("hidden");
        $("#showClients").classList.remove("hidden");
      }
    } catch (error) {
      console.error('No se pudo comprobar el acceso al directorio bancario', error);
    }
    const route = new URLSearchParams(location.search);
    if (route.get('vista') === 'cobros' && cobros) {
      treasuryView='cobros';render();await cobros.mount($("#cobrosContent"));return;
    }
    if (route.get('vista') === 'gastos' && financialExpenses) {
      treasuryView='expenses';render();await financialExpenses.mount($("#financialExpensesContent"));return;
    }
    if (route.get('vista') === 'preparacion' && preparation) {
      treasuryView='preparation';render();await preparation.mount($("#preparationContent"));return;
    }
    if (route.get('vista') === 'clientes' && clients) {
      treasuryView='clients';render();await clients.mount($("#clientsContent"));
      if(route.get('origen'))clients.openOrigin(route.get('origen'));
      else if(route.get('beneficiario'))clients.openBeneficiary(route.get('beneficiario'));
      return;
    }
    if (!canViewOutgoing()) {
      $("#showOperational").classList.add("hidden");
      $("#showHistory").classList.add("hidden");
      $("#showStoreMovements").classList.add("hidden");
      treasuryView = "cobros";
      render();
      await cobros.mount($("#cobrosContent"));
      return;
    }
    try {
      await load();
    } catch (error) {
      console.error("Tesorería no pudo cargar", error);
      notice("No fue posible cargar Tesorería. Intenta nuevamente.", true);
    }
  }
  document.addEventListener("kora-sidebar-ready", init, { once: true });
  if (window.creditekSidebar?.sb) init();
  ["platform", "cutoff", "status"].forEach((id) =>
    $(`#${id}`).addEventListener("change", render),
  );
  $("#search").addEventListener("input", render);
  ["compensationStore", "compensationFrom", "compensationTo", "compensationPlatform", "compensationImei", "compensationAmount"].forEach(id =>
    $(`#${id}`).addEventListener("change", render),
  );
  function clearCompensationFilters() {
    ["compensationStore", "compensationFrom", "compensationTo", "compensationPlatform", "compensationImei", "compensationAmount"].forEach(id => { $(`#${id}`).value = ""; });
  }
  ["compensationFrom", "compensationTo"].forEach(id => {
    $(`#${id}`).value = window.CreditekTesoreriaTercerizacion.diaBogota();
  });
  $("#clearCompensationFilters").onclick = () => { clearCompensationFilters(); render(); };
  $("#todayCompensations").onclick = () => {
    ["compensationFrom", "compensationTo"].forEach(id => { $(`#${id}`).value = window.CreditekTesoreriaTercerizacion.diaBogota(); });
    render();
  };
  $("#refresh").onclick = async () => {
    try {
      if(treasuryView!=='expenses')await financialExpenses?.refreshSummary();
      if (treasuryView === 'cobros') await cobros?.mount($("#cobrosContent"));
      else if (treasuryView === 'clients') await clients?.mount($("#clientsContent"));
      else if (treasuryView === 'preparation') await preparation?.mount($("#preparationContent"));
      else if (treasuryView === 'expenses') await financialExpenses?.mount($("#financialExpensesContent"));
      else await load();
    } catch (error) {
      notice("No fue posible actualizar Tesorería. Se conserva la consulta anterior; intenta nuevamente.", true);
    }
  };
  $("#showCobros").onclick = async () => {
    if(!cobros)return;
    treasuryView='cobros';render();await cobros.mount($("#cobrosContent"));
  };
  $("#showClients").onclick = async () => {
    if (!clients) return;
    treasuryView = 'clients';
    render();
    await clients.mount($("#clientsContent"));
  };
  $("#showPreparation").onclick = async () => {
    if(!preparation)return;
    treasuryView='preparation';render();await preparation.mount($("#preparationContent"));
  };
  $("#showFinancialExpenses").onclick = async () => {
    if(!financialExpenses)return;
    treasuryView='expenses';render();await financialExpenses.mount($("#financialExpensesContent"));
  };
  $("#paymentReport").onclick = paymentReport;
  async function showPaymentView(view) {
    if (!canViewOutgoing()) return;
    treasuryView = view;
    try { await load(); }
    catch { notice('No fue posible cargar los pagos. Pulsa Actualizar para reintentar.',true); }
  }
  $("#showOperational").onclick = () => showPaymentView('operational');
  $("#showHistory").onclick = () => showPaymentView('history');
  $("#showStoreMovements").onclick = () => showPaymentView('storeMovements');
  ["historyFrom","historyTo"].forEach((id) => $("#" + id).onchange = render);
  $("#clearPaymentHistory").onclick = () => {
    $("#historyFrom").value = "";
    $("#historyTo").value = "";
    render();
  };
  $("#exportPaymentHistory").onclick = exportPaymentHistory;
  $("#openStoreLedger").onclick = () => {
    const selected = compensationView().rows.find(
      (x) => x.id === selectedCompensationId,
    );
    if (selected)
      location.href = `cuenta-corriente.html?tienda=${encodeURIComponent(selected.store_code)}&referencia=${encodeURIComponent(selected.id)}`;
  };
  $("#closePaymentSupport").onclick = closePaymentSupport;
  $("#paymentSupportForm").onsubmit = submitPaymentSupport;
  $("#paymentSupportFile").onchange = (event) => {
    const file = event.target.files[0],
      validation = validateSupport(file),
      selected = $("#paymentSupportSelected"),
      errorBox = $("#paymentSupportError");
    if (validation) {
      selected.classList.add("hidden");
      errorBox.textContent = validation;
      errorBox.classList.remove("hidden");
      return;
    }
    errorBox.classList.add("hidden");
    selected.textContent = `Archivo listo: ${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    selected.classList.remove("hidden");
  };
  $("#paymentSupportModal").onclick = (event) => {
    if (event.target === $("#paymentSupportModal")) closePaymentSupport();
  };
  $("#closePaymentDetail").onclick = closePaymentDetail;
  $("#paymentDetailModal").onclick = (event) => {
    if (event.target === $("#paymentDetailModal")) closePaymentDetail();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if ($("#paymentSupportModal").classList.contains("show"))
      closePaymentSupport();
    else if ($("#paymentDetailModal").classList.contains("show"))
      closePaymentDetail();
  });
})();
