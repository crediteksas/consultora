(function (global) {
  'use strict';

  const BUCKET = 'soportes';
  // El prefijo identifica el bucket sin alterar rutas de facturas históricas.
  const PREFIX = 'proveedores/saldos-iniciales/';
  const MAX_BYTES = 10 * 1024 * 1024;
  const TIPOS = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  function validarArchivo(archivo) {
    if (!archivo) throw new Error('Adjunta el soporte del saldo inicial.');
    const extension = archivo.name.split('.').pop().toLowerCase();
    const contentType = TIPOS[extension];
    if (!contentType || (archivo.type && archivo.type !== 'application/octet-stream' && archivo.type !== contentType)) {
      throw new Error('El soporte debe ser un PDF o una imagen JPG, PNG o WebP.');
    }
    if (!Number.isFinite(archivo.size) || archivo.size <= 0) throw new Error('El soporte está vacío. Selecciona un archivo con contenido.');
    if (archivo.size > MAX_BYTES) throw new Error('El soporte supera 10 MB. Selecciona un archivo de hasta 10 MB.');
    return { extension, contentType };
  }

  function fechaValida(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
    const valor = new Date(`${fecha}T00:00:00Z`);
    return Number.isFinite(valor.getTime()) && valor.toISOString().slice(0, 10) === fecha;
  }

  function validarDatos(datos) {
    if (!datos.proveedorId || !fechaValida(datos.fechaCorte)) throw new Error('Selecciona proveedor y una fecha de corte válida.');
    const monto = Number(datos.monto);
    if (!Number.isSafeInteger(monto) || monto <= 0) throw new Error('El valor pendiente debe ser mayor que cero, en pesos enteros.');
    const vencimiento = datos.fechaVencimiento || null;
    if (vencimiento && (!fechaValida(vencimiento) || vencimiento < datos.fechaCorte)) throw new Error('El vencimiento debe ser una fecha válida, igual o posterior al corte.');
    const referencia = String(datos.referencia || '').trim() || null;
    const observacion = String(datos.observacion || '').trim() || null;
    if (referencia?.length > 120 || observacion?.length > 500) throw new Error('La referencia admite 120 caracteres y la observación 500.');
    return { p_proveedor_id: datos.proveedorId, p_fecha_corte: datos.fechaCorte, p_fecha_vencimiento: vencimiento, p_monto: monto, p_referencia: referencia, p_observacion: observacion };
  }

  async function huella(archivo) {
    const digest = await global.crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  }

  function conPlazo(promesa, timeoutMs, mensaje) {
    let timer;
    return Promise.race([
      promesa,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(mensaje)), timeoutMs); }),
    ]).finally(() => clearTimeout(timer));
  }

  function resolverSoporte(path) {
    return { bucket: String(path || '').startsWith(PREFIX) ? BUCKET : 'productos-fotos', path };
  }

  function crearRegistro({ sb, idempotencyKey = global.crypto.randomUUID(), timeoutMs = 45000 }) {
    const subidos = new Set();
    let enCurso = null;
    let intentoRpc = null;
    let respuestaIncierta = false;
    let confirmado = null;

    async function ejecutar(datos, progreso) {
      const payload = validarDatos(datos);
      const { extension, contentType } = validarArchivo(datos.archivo);
      const hash = await huella(datos.archivo);
      const path = `${PREFIX}${idempotencyKey}/${hash}.${extension}`;
      payload.p_soporte_path = path;
      payload.p_idempotency_key = idempotencyKey;
      const firma = JSON.stringify(payload);
      // Una respuesta de red incierta no permite cambiar lo que se reintenta.
      if (intentoRpc && intentoRpc !== firma) throw new Error('Hay un intento anterior sin confirmar. Reintenta con los mismos datos y soporte antes de cambiarlos.');
      if (confirmado) return confirmado;
      const storage = sb.storage.from(BUCKET);
      if (!subidos.has(path)) {
        progreso('Subiendo soporte…');
        const { error } = await conPlazo(storage.upload(path, datos.archivo, { contentType, cacheControl: '3600', upsert: false }), timeoutMs, 'La carga del soporte no respondió a tiempo. Puedes reintentar sin duplicar el saldo.');
        if (error) {
          // Tras una respuesta perdida, verificar bytes; nunca sobrescribir.
          const duplicado = error.code === 'Duplicate' || String(error.statusCode) === '409' || /already exists/i.test(error.message || '');
          if (!duplicado) throw new Error('No se pudo subir el soporte: ' + error.message);
          const existente = await conPlazo(storage.download(path), timeoutMs, 'No se pudo verificar el soporte anterior. Reintenta.');
          if (existente.error || !existente.data || await huella(existente.data) !== hash) throw new Error('No se pudo verificar el soporte ya cargado. No se registró otro saldo.');
        }
        subidos.add(path);
      }
      progreso('Soporte listo. Registrando saldo inicial…');
      intentoRpc = firma;
      let respuesta;
      try {
        respuesta = await conPlazo(sb.rpc('registrar_saldo_inicial_proveedor', payload), timeoutMs, 'El servidor aún no confirmó el registro. Reintenta con los mismos datos; no se duplicará el saldo.');
      } catch (error) {
        respuestaIncierta = true;
        throw error;
      }
      const { data, error } = respuesta;
      if (error) {
        // Un rechazo SQL no despeja la incertidumbre de una petición anterior.
        if (/^[0-9A-Z]{5}$/.test(error.code || '') && !respuestaIncierta) intentoRpc = null;
        else respuestaIncierta = true;
        throw new Error(error.message || 'No se recibió confirmación. Reintenta con los mismos datos.');
      }
      if (!data?.ok) {
        respuestaIncierta = true;
        throw new Error('El servidor no confirmó el saldo inicial. Reintenta con los mismos datos.');
      }
      confirmado = data;
      return data;
    }

    return Object.freeze({
      registrar(datos, progreso = () => {}) {
        if (enCurso) return enCurso;
        enCurso = ejecutar(datos, progreso).finally(() => { enCurso = null; });
        return enCurso;
      },
    });
  }

  global.CreditekSaldoInicialProveedor = Object.freeze({ crearRegistro, resolverSoporte, validarArchivo, validarDatos, MAX_BYTES });
})(typeof window !== 'undefined' ? window : globalThis);
