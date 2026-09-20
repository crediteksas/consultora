/* Arqueo físico separado del corte operativo. Ningún importe se autoconfirma. */
(function () {
  'use strict';
  const fechaColombia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const pesos = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(n));
  function elemento(tag, texto, clase) {
    const el = document.createElement(tag);
    if (texto !== undefined) el.textContent = texto;
    if (clase) el.className = clase;
    return el;
  }
  async function montar({ sb, perfil, contenedor }) {
    const central = ['gerencia', 'auditoria'].includes(perfil.rol);
    if (!central && perfil.rol !== 'admin_tienda') return;
    contenedor.classList.add('caja-ciclo-panel');
    contenedor.replaceChildren(elemento('h2', 'Validación del efectivo anterior'));
    contenedor.append(elemento('p', 'El informe de ventas no espera este arqueo. Antes de nuevos movimientos, cuenta el efectivo y registra los gastos pendientes con la fecha del día correspondiente.'));
    const actualizar = elemento('button', 'Actualizar arqueos', 'btn-primary');
    actualizar.type = 'button';
    const lista = elemento('div');
    lista.style.cssText = 'display:grid;gap:16px;margin:16px 0';
    contenedor.append(actualizar, lista);
    async function cargar() {
      actualizar.disabled = true;
      lista.replaceChildren(elemento('p', 'Consultando…'));
      try {
        let tiendas;
        if (central) {
          const r = await sb.from('origenes').select('codigo,nombre').eq('tipo', 'propia').eq('activo', true).order('nombre');
          if (r.error) throw r.error;
          tiendas = r.data;
        } else tiendas = [{ codigo: perfil.tienda_codigo, nombre: 'Mi tienda' }];
        const resultados = await Promise.all(tiendas.map(async tienda => {
          const r = await sb.rpc('estado_apertura_caja', { p_tienda_codigo: tienda.codigo });
          return { tienda, ...r };
        }));
        lista.replaceChildren();
        let pendientes = 0;
        for (const { tienda, data: estado, error } of resultados) {
          if (error) { lista.append(elemento('p', `${tienda.nombre}: no se pudo consultar. ${error.message}`)); continue; }
          if (!estado.bloqueada) continue;
          pendientes++;
          const card = elemento('section', undefined, 'cierre-box');
          card.style.cssText = 'border-top:2px solid #00bcc8;padding:18px;border-radius:14px;background:white';
          card.append(elemento('h3', `${tienda.nombre} · ${estado.fecha_pendiente}`));
          card.append(elemento('p', `Esperado: ${pesos(estado.resumen.esperado)} · Gastos pendientes de aprobación: ${estado.resumen.gastos_pendientes}`));
          if (estado.resumen.apertura_sin_arqueo) card.append(elemento('p', 'No existe un arqueo anterior: el esperado se basa en los movimientos registrados. Gestión debe revisar cualquier diferencia; no ajustes el conteo para hacerlo coincidir.'));
          const gastos = elemento('a', 'Registrar o revisar gastos del día');
          gastos.href = `gastos.html?fecha=${encodeURIComponent(estado.fecha_pendiente)}`;
          card.append(gastos);
          const form = elemento('form');
          form.style.cssText = 'display:grid;gap:12px;margin-top:14px;max-width:640px';
          const label = elemento('label', 'Efectivo contado físicamente');
          const input = elemento('input');
          input.type = 'number'; input.min = '0'; input.step = '0.01'; input.required = true;
          input.style.cssText = 'width:100%;min-height:44px;font-size:18px';
          // Revisión central: se conserva el conteo comunicado por la tienda.
          if (central && estado.corte.efectivo_contado !== null) input.value = estado.corte.efectivo_contado;
          label.append(input);
          const notaLabel = elemento('label', 'Observación (obligatoria si hay diferencia)');
          const nota = elemento('textarea'); nota.rows = 2; nota.style.width = '100%'; notaLabel.append(nota);
          const diferencia = elemento('p', 'Ingresa el conteo, no el saldo esperado.');
          input.addEventListener('input', () => {
            diferencia.textContent = input.value === '' ? 'Ingresa el conteo, no el saldo esperado.' : `Diferencia: ${pesos(Number(input.value) - Number(estado.resumen.esperado))}`;
          });
          const guardar = elemento('button', 'Registrar arqueo y validar', 'btn-primary'); guardar.type = 'submit';
          const respuesta = elemento('p'); respuesta.setAttribute('role', 'status'); respuesta.style.overflowWrap = 'anywhere';
          form.append(label, diferencia, notaLabel, guardar);
          let autorizar;
          if (central && estado.corte.estado === 'observada' && estado.corte.efectivo_contado !== null) {
            autorizar = elemento('button', 'Autorizar diferencia registrada', 'btn-primary'); autorizar.type = 'button';
            form.append(autorizar);
          }
          form.append(respuesta); card.append(form); lista.append(card);
          let intento = null;
          async function enviar(autorizacion) {
            if (!form.reportValidity()) return;
            if (autorizacion && !confirm('¿Autorizar esta diferencia conservando el efectivo contado y la observación en auditoría?')) return;
            const payload = { p_tienda_codigo: tienda.codigo, p_fecha: estado.fecha_pendiente, p_efectivo_contado: Number(input.value), p_nota: nota.value.trim() || null, p_autorizar: autorizacion };
            const firma = JSON.stringify(payload);
            if (!intento || intento.firma !== firma) intento = { firma, key: crypto.randomUUID() };
            guardar.disabled = true; if (autorizar) autorizar.disabled = true;
            try {
              const r = await sb.rpc('validar_arqueo_caja', { ...payload, p_idempotency_key: intento.key });
              if (r.error) throw r.error;
              respuesta.textContent = r.data.mensaje;
              if (r.data.ok) { guardar.remove(); autorizar?.remove(); input.disabled = true; nota.disabled = true; }
              else intento = null;
            } catch (e) { respuesta.textContent = `No se validó el ciclo: ${e.message}. Puedes reintentar sin duplicar el registro.`; }
            finally { guardar.disabled = false; if (autorizar) autorizar.disabled = false; }
          }
          form.addEventListener('submit', e => { e.preventDefault(); enviar(false); });
          autorizar?.addEventListener('click', () => enviar(true));
        }
        if (!pendientes && !resultados.some(r => r.error)) lista.append(elemento('p', 'No hay arqueos anteriores pendientes. Las operaciones del día están habilitadas.'));
      } catch (e) { lista.replaceChildren(elemento('p', `No se pudo consultar el estado de caja: ${e.message}. Pulsa Actualizar para reintentar.`)); }
      finally { actualizar.disabled = false; }
    }
    actualizar.addEventListener('click', cargar);
    await cargar();
  }
  window.CreditekCajaCiclo = { montar, fechaColombia };
})();
