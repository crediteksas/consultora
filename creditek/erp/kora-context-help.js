(function () {
  'use strict';

  const HELP_LIBRARY = Object.freeze({
    'tablero.html': guide('Resumen ejecutivo', 'Concentra los indicadores clave de ventas, utilidad, desempeño por tienda y alertas para tomar decisiones.', ['Selecciona el período que quieres analizar.', 'Filtra por tienda cuando necesites revisar un punto específico.', 'Compara los indicadores y abre el detalle relacionado antes de tomar una decisión.'], ['Los valores cambian con los filtros activos.', 'Una alerta señala algo que debe revisarse; no reemplaza la validación del dato original.']),
    'presupuestos.html': guide('Presupuestos', 'Permite consultar, comparar y dar seguimiento a los presupuestos comerciales por tienda y período.', ['Selecciona el período y la tienda.', 'Revisa el presupuesto asignado frente al resultado observado.', 'Registra o ajusta información solo si tu rol lo permite.'], ['Confirma siempre el período antes de guardar.', 'Los cambios deben conservar la trazabilidad del responsable.']),
    'reportes.html': guide('Análisis e informes', 'Reúne reportes históricos y comparativos de Retail para consultar resultados y exportar información.', ['Define el rango de fechas.', 'Aplica los filtros de tienda, plataforma o categoría.', 'Revisa los totales antes de exportar o compartir.'], ['Un reporte vacío puede significar que los filtros son demasiado específicos.', 'La exportación debe coincidir con los filtros visibles.']),
    'catalogo.html': guide('Catálogo', 'Administra las referencias y datos maestros que usan inventario, compras, remisiones y ventas.', ['Busca primero la referencia para evitar duplicados.', 'Revisa nombre, categoría, tipo y estado.', 'Crea o edita únicamente cuando la información esté confirmada.', 'Verifica los productos con cantidad cero desde los filtros disponibles.'], ['Una referencia duplicada afecta inventario y reportes.', 'Los cambios de precio o margen dependen de los permisos del rol.']),
    'remisiones.html': guide('Remisiones', 'Gestiona el envío y la recepción de mercancía entre la bodega central y las tiendas.', ['Busca o crea la remisión correspondiente.', 'Confirma tienda de destino, productos, cantidades e IMEI.', 'La tienda receptora debe verificar físicamente la mercancía.', 'Acepta o reporta diferencias antes de cerrar.'], ['No aceptes una remisión sin comparar lo físico con el documento.', 'El documento de remisión se abre desde el registro correspondiente.']),
    'documento-remision.html': guide('Documento de remisión', 'Muestra el detalle formal de una remisión para revisión, recepción y trazabilidad.', ['Confirma origen, destino y estado.', 'Compara referencias, cantidades e IMEI con la mercancía recibida.', 'Registra la aceptación o la novedad según corresponda.'], ['Este documento se abre desde Remisiones.', 'No cierres el proceso si existe una diferencia sin reportar.']),
    'inventario.html': guide('Inventario', 'Permite consultar existencias por tienda, referencia e IMEI y detectar unidades que requieren revisión.', ['Selecciona la tienda o el alcance permitido.', 'Busca por referencia, categoría o IMEI.', 'Revisa estado y ubicación antes de realizar otra operación.'], ['El inventario es una consulta; los cambios se realizan en el módulo operativo correspondiente.', 'Una cantidad inesperada debe validarse contra Kardex y remisiones.']),
    'traslados.html': guide('Traslados', 'Registra y controla movimientos de unidades entre tiendas o bodegas.', ['Selecciona origen y destino.', 'Identifica las unidades o IMEI que se trasladarán.', 'Confirma cantidades y registra el movimiento.', 'Verifica la recepción en el destino.'], ['No traslades una unidad que no esté disponible en el origen.', 'Origen y destino deben ser diferentes.']),
    'ajustes.html': guide('Ajustes de inventario', 'Corrige diferencias justificadas de inventario conservando responsable, motivo y trazabilidad.', ['Ubica la referencia o unidad afectada.', 'Compara la existencia del sistema con la verificación física.', 'Selecciona el tipo de ajuste y escribe un motivo claro.', 'Revisa el resultado antes de confirmar.'], ['Un ajuste no reemplaza una venta, traslado o remisión.', 'Usa esta opción solo cuando exista evidencia de la diferencia.']),
    'cierre-periodo.html': guide('Cierre de período', 'Consolida el inventario del período y protege su trazabilidad para futuras revisiones.', ['Confirma la fecha o período a cerrar.', 'Revisa alertas, diferencias y operaciones pendientes.', 'Genera el cierre únicamente cuando la información esté completa.', 'Conserva o descarga el soporte disponible.'], ['Después del cierre, las correcciones requieren un proceso controlado.', 'No cierres con remisiones o ajustes pendientes.']),
    'auditoria-cruzada.html': guide('Auditoría cruzada', 'Compara inventario, movimientos y registros relacionados para detectar inconsistencias.', ['Selecciona el alcance de la revisión.', 'Analiza las diferencias encontradas.', 'Abre el registro de origen antes de concluir.', 'Documenta la acción requerida.'], ['Una diferencia es una señal de revisión, no una prueba automática de error.']),
    'kardex.html': guide('Kardex', 'Muestra el historial cronológico de entradas, salidas y movimientos de cada producto o unidad.', ['Busca la referencia o IMEI.', 'Selecciona tienda y período.', 'Sigue la secuencia de movimientos hasta identificar el origen del saldo.'], ['El saldo debe explicarse con los movimientos anteriores.', 'Usa filtros amplios si no encuentras una operación esperada.']),
    'ventas.html': guide('Ventas', 'Registra y consulta las ventas de la tienda con su plataforma, cliente, equipo y valores asociados.', ['Confirma la tienda y el vendedor.', 'Registra cliente, plataforma y datos del equipo.', 'Revisa valores y soporte antes de guardar.', 'Comprueba que la venta aparezca en el listado.'], ['No dupliques una venta al reintentar.', 'El IMEI debe corresponder al equipo entregado.']),
    'gastos.html': guide('Gastos', 'Registra y consulta gastos operativos autorizados por tienda.', ['Selecciona tienda, fecha y categoría.', 'Escribe el concepto y valor exactos.', 'Adjunta o conserva el soporte requerido.', 'Revisa el registro en el período correcto.'], ['No mezcles varios conceptos diferentes en un solo gasto.', 'Un gasto debe tener soporte y responsable identificables.']),
    'caja.html': guide('Cierre diario de caja', 'Compara el efectivo y movimientos esperados con lo reportado para cerrar la jornada.', ['Confirma fecha y tienda.', 'Revisa ventas, gastos y demás movimientos del día.', 'Ingresa el valor contado y explica cualquier diferencia.', 'Cierra solo cuando la conciliación esté completa.'], ['Una diferencia no debe ocultarse; debe quedar explicada.', 'Verifica que todas las operaciones del día estén registradas.']),
    'cuenta-corriente.html': guide('Cuenta corriente', 'Consulta saldos, obligaciones, abonos y movimientos con proveedores u otros terceros.', ['Selecciona la cuenta o tercero.', 'Revisa saldo y movimientos anteriores.', 'Registra el abono o soporte mediante la acción permitida.', 'Comprueba el nuevo saldo y el estado de verificación.'], ['Un abono reportado no equivale a uno verificado.', 'No registres dos veces el mismo comprobante.']),
    'conciliacion.html': guide('Conciliación', 'Compara pagos y movimientos para vincularlos correctamente e identificar diferencias.', ['Selecciona el período o lote.', 'Revisa movimientos sin coincidencia.', 'Vincula únicamente cuando los datos correspondan.', 'Deja en revisión lo que no pueda demostrarse.'], ['No fuerces coincidencias por valor solamente.', 'Fecha, tercero y referencia también deben concordar.']),
    'proveedores.html': guide('Cartera de proveedores', 'Administra proveedores, obligaciones, pagos y saldos pendientes de Creditek B2B.', ['Selecciona o crea el proveedor.', 'Revisa obligaciones, vencimientos y saldo.', 'Abre el detalle antes de registrar una acción.', 'Confirma que el movimiento quede asociado al proveedor correcto.'], ['No dupliques proveedores con variaciones del mismo nombre.', 'La verificación de pagos debe conservar evidencia.']),
    'compra-proveedor.html': guide('Compra a proveedor', 'Registra compras, costos, pagos e ingreso inicial de mercancía a Bodega Central.', ['Selecciona el proveedor.', 'Busca cada referencia antes de crear una nueva.', 'Ingresa cantidades, costos y reglas de utilidad.', 'Revisa el resumen y guarda la compra.', 'Verifica que las unidades ingresen al inventario central.'], ['Compara siempre el costo con la lista original.', 'Una referencia nueva debe validarse antes de publicarse.']),
    'bodega-central.html': guide('Inventario Central', 'Consulta y administra las existencias disponibles en la operación B2B.', ['Busca por referencia o IMEI.', 'Revisa cantidad, estado y ubicación.', 'Abre el movimiento de origen si encuentras una diferencia.'], ['Las salidas deben estar respaldadas por remisión, venta o ajuste.']),
    'utilidad-creditek.html': guide('Resultado B2B', 'Analiza facturación, costo congelado, gastos, retiros y resultado de la operación B2B.', ['Selecciona período y filtros.', 'Revisa ingresos y costos por separado.', 'Analiza margen y retiros antes de comparar el resultado.', 'Exporta únicamente después de validar los totales.'], ['El costo histórico no debe sustituirse por el precio actual.', 'Los filtros activos determinan el resultado mostrado.']),
    'aliados-dashboard.html': guide('Dashboard de Aliados', 'Resume el estado comercial y operativo de los aliados, liquidaciones y pagos.', ['Selecciona el período.', 'Revisa indicadores y alertas.', 'Abre el módulo de origen para gestionar cada novedad.'], ['Los indicadores agregados deben validarse en el detalle.']),
    'aliados.html': guide('Aliados', 'Administra la información operativa y contractual de los aliados autorizados.', ['Busca el aliado antes de crear uno nuevo.', 'Revisa identidad, estado y datos de operación.', 'Actualiza únicamente campos confirmados.', 'Verifica que el estado corresponda a la relación vigente.'], ['Evita duplicados por variaciones del nombre.', 'Los datos bancarios requieren revisión reforzada.']),
    'aliados-ejecutivos.html': guide('Ejecutivos de Aliados', 'Gestiona responsables y relaciones operativas asociadas a cada aliado.', ['Selecciona el aliado.', 'Revisa ejecutivos existentes y su estado.', 'Agrega o actualiza la asignación autorizada.'], ['No asignes un ejecutivo al aliado equivocado.']),
    'aliados-plataformas.html': guide('Plataformas de Aliados', 'Configura y consulta las plataformas de crédito utilizadas por cada aliado.', ['Selecciona el aliado.', 'Revisa plataformas activas y sus identificadores.', 'Actualiza solo relaciones confirmadas.'], ['No mezcles identificadores entre aliados o plataformas.']),
    'aliados-liquidaciones.html': guide('Liquidaciones de Aliados', 'Importa, revisa y aprueba liquidaciones de plataformas, conservando novedades y auditoría.', ['Selecciona plataforma y período.', 'Carga el archivo correspondiente.', 'Revisa coincidencias, excepciones y totales.', 'Aprueba únicamente cuando las diferencias estén resueltas.'], ['No mezcles períodos ni plataformas en una importación.', 'Una excepción debe quedar resuelta o documentada.']),
    'aliados-tesoreria.html': guide('Tesorería de Aliados', 'Gestiona pagos, compensaciones y saldos de Aliados de forma separada a otras operaciones.', ['Selecciona el aliado o liquidación.', 'Revisa el valor aprobado y los datos de pago.', 'Registra el movimiento con su soporte.', 'Confirma estado y saldo resultante.'], ['Verifica beneficiario y cuenta antes de pagar.', 'No mezcles pagos de B2B, Retail y Aliados.']),
    'aliados-calidad.html': guide('Calidad de Aliados', 'Revisa integridad, novedades y cumplimiento de la información procesada para aliados.', ['Selecciona el período o aliado.', 'Analiza alertas y registros incompletos.', 'Abre el origen de cada novedad.', 'Documenta la corrección o escalamiento.'], ['Una alerta de calidad debe resolverse en el dato de origen.']),
    'aliados-bonificaciones.html': guide('Bonificaciones de Aliados', 'Consulta y registra bonificaciones autorizadas asociadas a liquidaciones o desempeño.', ['Selecciona aliado y período.', 'Revisa la base y regla aplicada.', 'Registra únicamente bonificaciones autorizadas.', 'Comprueba el impacto en la liquidación.'], ['Toda bonificación debe tener responsable y justificación.']),
    'aliados-reportes.html': guide('Reportes de Aliados', 'Genera análisis y exportaciones de liquidaciones, pagos, calidad y desempeño de aliados.', ['Define período y aliado.', 'Aplica los filtros necesarios.', 'Valida totales y estado de los datos.', 'Exporta el resultado revisado.'], ['No interpretes un reporte parcial como consolidado.']),
    'registro-interno.html': guide('Registro de cliente', 'Crea el expediente inicial de un cliente desde KORA con validaciones y trazabilidad.', ['Confirma el origen de la solicitud.', 'Registra la información solicitada con autorización del cliente.', 'Completa verificaciones y soportes requeridos.', 'Revisa la información antes de guardar.'], ['No inventes información faltante.', 'Protege los datos personales y consulta solo lo necesario.']),
    'validacion.html': guide('Validación de clientes', 'Permite revisar la información y soportes registrados antes de aceptar o escalar un expediente.', ['Busca el expediente.', 'Compara los datos con los soportes disponibles.', 'Marca observaciones concretas.', 'Aprueba, devuelve o escala según la evidencia.'], ['No apruebes datos que no puedan verificarse.', 'Evita exponer información personal fuera del expediente.']),
    'incidencias.html': guide('Centro de Incidencias', 'Permite reportar, asignar, responder, resolver y cerrar problemas encontrados en KORA.', ['Usa los filtros para localizar una incidencia existente.', 'Abre el detalle y revisa evidencia e historial.', 'Asigna responsable, prioridad y estado.', 'Documenta la solución y solicita validación antes del cierre.'], ['No cierres una incidencia solo porque fue asignada.', 'Si el problema continúa, conserva la incidencia abierta o en validación.']),
  });

  function guide(title, purpose, steps, tips) {
    return Object.freeze({ title, purpose, steps: Object.freeze(steps), tips: Object.freeze(tips) });
  }

  function currentRoute() {
    const last = location.pathname.split('/').filter(Boolean).pop() || 'app.html';
    return last.includes('.') ? last : `${last}.html`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function fallbackGuide(context = {}) {
    return guide(
      context.title || document.title || 'Esta pantalla',
      context.description || 'Esta sección forma parte de la operación de KORA y muestra únicamente las acciones permitidas para tu perfil.',
      ['Revisa el título y los filtros activos.', 'Completa solo la información solicitada.', 'Confirma el resultado antes de salir de la pantalla.'],
      ['Si una opción esperada no aparece, puede depender de tu rol o del estado del proceso.'],
    );
  }

  function renderList(items, className) {
    return `<ol class="${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
  }

  function mount(options = {}) {
    const button = options.button || document.querySelector('[data-kora-help]');
    if (!button || button.dataset.koraHelpMounted === 'true') return;
    button.dataset.koraHelpMounted = 'true';

    const dialog = document.createElement('dialog');
    dialog.className = 'kora-context-help-dialog';
    dialog.setAttribute('aria-labelledby', 'koraContextHelpTitle');
    document.body.appendChild(dialog);

    let opener = null;
    const open = () => {
      const content = HELP_LIBRARY[currentRoute()] || fallbackGuide(options);
      dialog.innerHTML = `<article class="kora-context-help">
        <header class="kora-context-help__header">
          <div><p class="kora-context-help__eyebrow">Guía de esta pantalla</p><h2 class="kora-context-help__title" id="koraContextHelpTitle">${escapeHtml(content.title)}</h2></div>
          <button class="kora-icon-button ghost kora-context-help__close" type="button" aria-label="Cerrar guía" data-kora-help-close><i data-lucide="x"></i></button>
        </header>
        <div class="kora-context-help__body">
          <p class="kora-context-help__purpose">${escapeHtml(content.purpose)}</p>
          <section class="kora-context-help__section" aria-labelledby="koraHelpStepsTitle"><h3 id="koraHelpStepsTitle"><i data-lucide="list-checks"></i> Cómo usarla</h3>${renderList(content.steps, 'kora-context-help__steps')}</section>
          <section class="kora-context-help__section" aria-labelledby="koraHelpTipsTitle"><h3 id="koraHelpTipsTitle"><i data-lucide="shield-check"></i> Antes de continuar</h3><ul class="kora-context-help__tips">${content.tips.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
          <div class="kora-context-help__support"><i data-lucide="circle-help"></i><span>Si la pantalla no funciona como se explica aquí, repórtala desde el Centro de Incidencias y adjunta evidencia.</span></div>
        </div>
        <footer class="kora-context-help__footer"><button class="btn primary" type="button" data-kora-help-understood>Entendido</button></footer>
      </article>`;
      dialog.querySelectorAll('[data-kora-help-close],[data-kora-help-understood]').forEach(control => control.addEventListener('click', () => dialog.close()));
      opener = document.activeElement;
      dialog.showModal();
      window.lucide?.createIcons();
      dialog.querySelector('[data-kora-help-close]')?.focus();
    };

    button.addEventListener('click', open);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dialog.close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && dialog.open) {
        event.preventDefault();
        dialog.close();
      }
    });
    dialog.addEventListener('close', () => opener?.focus?.());
  }

  window.KoraContextHelp = Object.freeze({ mount, library: HELP_LIBRARY, version: '1.0.0' });
  document.dispatchEvent(new CustomEvent('kora-context-help-ready'));
})();
