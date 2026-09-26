(function (global) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dinero = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
  const fechaRegistro = s => s ? new Date(s).toLocaleString('es-CO',{timeZone:'America/Bogota'}) : 'Fecha de registro no disponible';
  async function todas(crearConsulta) {
    const filas = [];
    for (let inicio = 0; ; inicio += 500) {
      const {data,error} = await crearConsulta().order('id').range(inicio,inicio+499);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('La consulta de movimientos no devolvió datos verificables.');
      filas.push(...data);
      if (data.length < 500) return filas;
    }
  }
  function fechas(desde,hasta,hoy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta || hasta > hoy) throw new Error('Selecciona un rango válido, sin fechas futuras.');
    const inicio = Date.parse(desde+'T12:00:00Z'), fin = Date.parse(hasta+'T12:00:00Z');
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || new Date(inicio).toISOString().slice(0,10)!==desde || new Date(fin).toISOString().slice(0,10)!==hasta) throw new Error('Selecciona fechas válidas.');
    const cantidad = (fin-inicio)/86400000+1;
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 31) throw new Error('Consulta hasta 31 días por vez.');
    return Array.from({length:cantidad},(_,i) => new Date(inicio+i*86400000).toISOString().slice(0,10));
  }
  async function consultar(sb, tienda, desde, hasta, hoy) {
    if (!tienda) throw new Error('Selecciona una tienda para consultar su libro.');
    const dias = fechas(desde,hasta,hoy);
    const filtrar = q => q.eq('tienda_codigo',tienda).gte('fecha',desde).lte('fecha',hasta);
    const [ventas,gastos,movimientos] = await Promise.all([
      todas(() => filtrar(sb.from('ventas').select('id,consecutivo,tienda_codigo,fecha,tipo,total,anulada,vendedor,created_at,creditos(id,financiera,cuota_inicial,medio_pago_complementario)')).eq('anulada',false)),
      todas(() => filtrar(sb.from('gastos').select('id,fecha,monto,estado,descripcion,registrado_por,aprobado_por,created_at,conceptos_gasto(nombre,preautorizado)'))),
      todas(() => filtrar(sb.from('movimientos_caja_tienda').select('id,fecha,tipo,monto,observacion,creado_por,autorizado_por,created_at,soporte_path'))),
    ]);
    const libros = [];
    for (const fecha of dias) {
      const {data,error} = await sb.rpc('calcular_efectivo_esperado_tienda',{p_tienda_codigo:tienda,p_fecha:fecha});
      if (error) throw error;
      libros.push(global.CreditekCajaLibro.construir({cuadre:data,ventas:ventas.filter(v=>v.fecha===fecha),gastos:gastos.filter(g=>g.fecha===fecha),movimientos:movimientos.filter(m=>m.fecha===fecha)}));
    }
    const ids = [...new Set(libros.flatMap(l=>l.filas.flatMap(f=>[f.usuario,f.autorizado])).filter(Boolean))];
    const nombres = new Map();
    for (let i=0;i<ids.length;i+=100) {
      const {data,error} = await sb.from('perfiles').select('id,nombre').in('id',ids.slice(i,i+100));
      if (error) throw error;
      for (const p of data || []) nombres.set(p.id,p.nombre);
    }
    return {libros,nombres};
  }
  function renderDia(l,nombres,indice) {
    const nombre = id => nombres.get(id) || 'Responsable no disponible';
    return `<section class="libro-dia"><h3>${esc(l.fecha)}</h3>
      <p>Saldo inicial: <strong>${dinero(l.apertura)}</strong> · Entradas / aumentos: ${dinero(l.entradas)} · Salidas / disminuciones: ${dinero(l.salidas)} · Saldo oficial: <strong class="${l.esperado<0?'libro-alerta':''}">${dinero(l.esperado)}</strong></p>
      <details><summary>Cómo se forma la apertura</summary><p>Último efectivo contado al cierre: ${dinero(l.aperturaAnterior)}. Arrastre de días anteriores: ${dinero(l.arrastre)}. Apertura calculada: ${dinero(l.apertura)}. Este desglose explica el cálculo; no registra una entrada o salida nueva.</p></details>
      ${!l.cuadra?`<p role="alert" class="libro-alerta">El detalle no cuadra con el saldo oficial: diferencia ${dinero(l.diferencia)}. Puede haber movimientos recientes o datos incompletos. Actualiza y revisa antes de tomar decisiones; no se ha ajustado ningún saldo.</p>`:''}
      ${l.esperado<0?'<p class="libro-alerta">Saldo negativo: requiere revisión del arrastre y de los movimientos. No significa que exista efectivo físico negativo.</p>':''}
      ${l.pendientes?`<p>${l.pendientes} gasto(s) pendientes de autorización, excluidos del saldo.</p>`:''}
      <div class="libro-tabla"><table><thead><tr><th>Registro / movimiento</th><th>Responsable y soporte</th><th>Saldo anterior</th><th>Entrada / aumento</th><th>Salida / disminución</th><th>Saldo resultante</th></tr></thead><tbody>
      ${l.filas.map((f,i)=>`<tr><td data-label="Movimiento"><div><strong>${esc(f.tipo)}</strong><br>${esc(fechaRegistro(f.registro))}<br>${esc(f.concepto)}<small>${esc(f.estado)}</small></div></td>
        <td data-label="Responsable"><div><span>${esc(nombre(f.usuario))}</span><details><summary>Ver trazabilidad</summary><p>${esc(f.origen)} · ${esc(f.id)}<br>Fecha efectiva: ${esc(f.fecha)}${f.autorizado?`<br>Autorizó: ${esc(nombre(f.autorizado))}`:''}</p>${f.soporte?`<button type="button" data-libro-soporte="${indice}:${i}">Ver comprobante</button>`:f.tipo.startsWith('Ajuste')?'<p>Soporte administrativo: autorización de Gerencia indicada en el movimiento.</p>':'<p>Referencia al registro original; sin comprobante adjunto en este movimiento.</p>'}</details></div></td>
        <td data-label="Saldo anterior">${dinero(f.saldoAnterior)}</td><td data-label="Entrada">${f.importe>0?dinero(f.importe):'—'}</td><td data-label="Salida">${f.importe<0?dinero(-f.importe):'—'}</td><td data-label="Saldo" class="${f.saldo<0?'libro-alerta':''}">${dinero(f.saldo)}</td></tr>`).join('') || '<tr><td colspan="6">Sin movimientos de efectivo en esta fecha.</td></tr>'}
      </tbody><tfoot><tr><th colspan="3">Total de movimientos del día</th><td data-label="Entradas">${dinero(l.entradas)}</td><td data-label="Salidas">${dinero(l.salidas)}</td><td data-label="Saldo">${dinero(l.saldo)}</td></tr></tfoot></table></div>
      ${l.cierre?.estado==='cerrada'?`<details><summary>Cierre registrado · no es otra salida</summary><p>Esperado al cerrar: ${dinero(l.cierre.efectivo_esperado)} · Contado: ${dinero(l.cierre.efectivo_contado)} · Diferencia registrada: ${dinero(l.cierre.diferencia)}. El cierre original se conserva.</p></details>`:''}</section>`;
  }
  function montar({sb,perfil,contenedor,tiendas}) {
    if (!perfil?.activo || !['gerencia','auditoria'].includes(perfil.rol)) return;
    const hoy = new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
    contenedor.classList.add('caja-libro');
    contenedor.innerHTML = `<h2>Libro de caja por tienda</h2><p>Consulta para Gerencia y Auditoría. Incluye ventas en efectivo, otros cobros en efectivo, gastos aplicados, consignaciones, retiros y ajustes. La cartera se consulta por separado en <a href="cuenta-corriente.html">Cuenta corriente</a>. Consultar no modifica saldos.</p>
      <div class="libro-filtros"><label>Tienda<select data-libro="tienda"><option value="">Selecciona una tienda</option>${tiendas.map(t=>`<option value="${esc(t.codigo)}">${esc(t.nombre)}</option>`).join('')}</select></label><label>Desde<input data-libro="desde" type="date" value="${hoy}" max="${hoy}"></label><label>Hasta<input data-libro="hasta" type="date" value="${hoy}" max="${hoy}"></label><button data-libro="consultar" type="button">Consultar libro</button></div><p data-libro="estado" role="status" aria-live="polite"></p><div data-libro="resultado"></div>`;
    const el = n => contenedor.querySelector(`[data-libro="${n}"]`);
    let version = 0;
    const invalidar = () => { version++; el('resultado').innerHTML=''; el('estado').textContent='Pulsa Consultar libro para ver los filtros seleccionados.'; };
    ['tienda','desde','hasta'].forEach(n=>el(n).addEventListener('change',invalidar));
    el('consultar').onclick = async () => {
      const actual = ++version, tienda=el('tienda').value;
      el('resultado').innerHTML='';el('estado').textContent='Consultando y comprobando contra el saldo oficial…';el('consultar').disabled=true;
      try {
        if (!tiendas.some(t=>t.codigo===tienda)) throw new Error('Selecciona una tienda.');
        const {libros,nombres} = await consultar(sb,tienda,el('desde').value,el('hasta').value,hoy);
        if (actual!==version) return;
        el('resultado').innerHTML=`<h3>${esc(tiendas.find(t=>t.codigo===tienda).nombre)}</h3><p>Orden por fecha efectiva y registro. Cada día comienza con su apertura oficial; los ajustes y el arrastre no son ventas ni utilidad.</p>`+libros.map((l,i)=>renderDia(l,nombres,i)).join('');
        el('estado').textContent=libros.every(l=>l.cuadra)?'El detalle de cada día coincide con su saldo oficial. Esto no sustituye el conteo físico.':'Hay diferencias entre detalle y saldo oficial. Revisa las alertas.';
        el('resultado').querySelectorAll('[data-libro-soporte]').forEach(b=>b.onclick=async()=>{
          const [d,i]=b.dataset.libroSoporte.split(':').map(Number), path=libros[d].filas[i].soporte;
          b.disabled=true;
          try {
            const {data,error}=await sb.storage.from('soportes').createSignedUrl(path,60);
            if(error||!data?.signedUrl) throw error || new Error('Soporte no disponible');
            if(actual!==version)return;
            window.open(data.signedUrl,'_blank','noopener');
          } catch { if(actual===version)el('estado').textContent='No se pudo consultar el soporte con tus permisos.'; }
          finally { b.disabled=false; }
        });
      } catch(error) { if(actual===version){el('resultado').innerHTML='';el('estado').textContent='No se pudo consultar: '+error.message;} }
      finally { el('consultar').disabled=false; }
    };
  }
  global.CreditekCajaLibroUI=Object.freeze({montar,consultar,todas,fechas,renderDia});
})(typeof window !== 'undefined' ? window : globalThis);
