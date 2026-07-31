// ============================================================
// CREDITEK — Google Apps Script Backend v2.0
// Portal B2B · WhatsApp Business API + HISTORIAL
// Autor: Oscar Pacheco · comercial@crediteksas.com
// ============================================================

// ⚙️ CONFIGURACIÓN — Reemplaza los valores marcados con ⬅️
var CONFIG = {
  PHONE_NUMBER_ID: '1171114292752516',
  WA_ACCESS_TOKEN: 'EAAVLHpnYaZAABR4T7rY65WcUpVxjUGYzcjMwQRWVIkmoEKE40d9N1rcnaH5ayZBZAEbOT1Da8x4vBiFHunZASkDT4gdCpZAwQZANYpT69aJ6LaAQ6WFyrAcAW5VJBaIGjl214zLJmLqjTCYZAcL3YapBmp7xs5PqrcbMywRCdet7SRK1DbunfumeHQYW1YRFQ88',
  WA_ORDER_TEMPLATE_NAME: 'conf_pedido_b2b',
  WA_ORDER_LANGUAGE_CODE: 'es',
  WA_TEMPLATE_NAME: 'aviso_cierre_pedido',
  WA_LANGUAGE_CODE: 'es_CO',
  WA_API_VERSION: 'v19.0',
  SHEET_TIENDAS: 'TIENDAS',
  SHEET_HISTORIAL: 'HISTORIAL',
  SHEET_CATALOGO: 'CATALOGO',
  SHEET_PROVEEDORES: 'PROVEEDORES',
  SHEET_CATALOGO_EXCEPCIONES: 'CATALOGO_EXCEPCIONES',
  SHEET_CATALOGO_REGLAS: 'CATALOGO_REGLAS',
  EMAIL_COMERCIAL: 'comercial@crediteksas.com',
  EMAIL_GESTION: 'gestion@crediteksas.com',
  SHEET_ID: '1vezpPcLasTiCtYBkKhaYZiw01dVApO_oSqyzbU8jAU4'
};

function doGet(e) {
  var action = e.parameter.action || '';
  var result;
  try {
    if (action === 'catalogo') {
      result = leerCatalogo_();
    } else if (action === 'leer' || action === 'leer_pedidos') {
      result = leerPedidos_();
    } else if (action === 'historial') {
      result = leerHistorial_(e.parameter.tienda || '');
    } else if (action === 'tiendas') {
      result = leerTiendas_();
    } else if (action === 'ping') {
      result = { ok: true, version: '2.0', ts: new Date().toISOString() };
    } else {
      result = { ok: false, error: 'Accion no reconocida: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;
  try {
    var action = e.parameter.action || 'guardar';
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'autenticar_portal_b2b') {
      result = autenticarPortalB2B_(body);
    } else if (body.action === 'validar_sesion_portal_b2b') {
      result = validarSesionPortalB2B_(body.session_token, body.required_scope);
    } else if (body.action === 'guardar_pedido_publico') {
      result = guardarPedidoPublico_(body);
    } else if ([
      'leer_pedidos_admin', 'cierre_periodo_admin',
      'analizar_catalogo_admin', 'publicar_catalogo_admin', 'rollback_catalogo_admin',
      'catalogo_privado_admin', 'historico_catalogo_admin', 'estadisticas_catalogo_admin',
      'listar_proveedores_admin', 'guardar_proveedor_admin',
      'listar_excepciones_catalogo_admin', 'guardar_regla_catalogo_admin'
    ].indexOf(body.action) !== -1) {
      if (!validarSesionConAlcance_(body.session_token, 'admin')) {
        result = { ok: false, error: 'Acceso administrativo denegado' };
      } else if (body.action === 'leer_pedidos_admin') result = leerPedidos_();
      else if (body.action === 'cierre_periodo_admin') result = cerrarPeriodo_(body.pedidos || []);
      else if (body.action === 'analizar_catalogo_admin') result = analizarCatalogoAdmin_(body);
      else if (body.action === 'publicar_catalogo_admin') result = publicarCatalogoAdmin_(body);
      else if (body.action === 'rollback_catalogo_admin') result = rollbackCatalogoAdmin_();
      else if (body.action === 'catalogo_privado_admin') result = leerCatalogoPrivado_();
      else if (body.action === 'historico_catalogo_admin') result = leerHistoricoCatalogo_(body.search || '');
      else if (body.action === 'listar_proveedores_admin') result = listarProveedoresAdmin_(body.solo_activos === true);
      else if (body.action === 'guardar_proveedor_admin') result = guardarProveedorAdmin_(body.proveedor || {});
      else if (body.action === 'listar_excepciones_catalogo_admin') result = listarExcepcionesCatalogoAdmin_();
      else if (body.action === 'guardar_regla_catalogo_admin') result = guardarReglaCatalogoAdmin_(body);
      else result = estadisticasCatalogo_();
    } else if (action === 'guardar' || action === 'guardar_pedido') {
      result = { ok: false, error: 'Utiliza el contrato público seguro de pedidos' };
    } else if (action === 'catalogo') {
      result = { ok: false, error: 'La actualización del catálogo requiere autorización' };
    } else if (action === 'cierre_periodo') {
      result = cerrarPeriodo_(body);
    } else {
      result = { ok: false, error: 'Accion POST no reconocida: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function safeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  var diff = 0;
  for (var i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function sha256Hex_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

var B2B_SESSION_TTL_SECONDS = 1800;
var B2B_MAX_ATTEMPTS = 5;
var B2B_ATTEMPT_WINDOW_SECONDS = 300;

function hashConfiguradoUnico_(propertyName) {
  var configured = String(PropertiesService.getScriptProperties().getProperty(propertyName) || '')
    .trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(configured) ? configured : '';
}

function claveCoincide_(password, propertyName) {
  var configured = hashConfiguradoUnico_(propertyName);
  if (!configured || !String(password || '')) return false;
  return safeEqual_(configured, sha256Hex_(password));
}

function cacheKeyB2B_(prefix, value) {
  return 'b2b:' + prefix + ':' + sha256Hex_(String(value || '')).slice(0, 40);
}

function autenticarPortalB2B_(body) {
  var password = String(body.password || '');
  var clientId = String(body.client_id || '').trim();
  var requireAdmin = body.require_admin === true;
  if (!clientId || !password) return { ok: false, error: 'Acceso denegado' };

  var cache = CacheService.getScriptCache();
  var attemptKey = cacheKeyB2B_('attempts', clientId);
  var attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= B2B_MAX_ATTEMPTS) {
    return { ok: false, error: 'Demasiados intentos. Intenta nuevamente más tarde.' };
  }

  var isAdmin = claveCoincide_(password, 'B2B_ADMIN_PIN_HASH');
  var isAccess = claveCoincide_(password, 'B2B_ACCESS_PIN_HASH');
  if ((requireAdmin && !isAdmin) || (!requireAdmin && !isAccess)) {
    cache.put(attemptKey, String(attempts + 1), B2B_ATTEMPT_WINDOW_SECONDS);
    return { ok: false, error: 'Acceso denegado' };
  }

  cache.remove(attemptKey);
  var scope = isAdmin ? 'admin' : 'access';
  var token = Utilities.getUuid() + Utilities.getUuid();
  var expiresAt = Date.now() + B2B_SESSION_TTL_SECONDS * 1000;
  cache.put(cacheKeyB2B_('session', token), JSON.stringify({
    scope: scope,
    expires_at: expiresAt
  }), B2B_SESSION_TTL_SECONDS);
  return { ok: true, session_token: token, scope: scope, expires_at: expiresAt };
}

function leerSesionPortalB2B_(token) {
  if (!String(token || '').trim()) return null;
  var raw = CacheService.getScriptCache().get(cacheKeyB2B_('session', token));
  if (!raw) return null;
  try {
    var session = JSON.parse(raw);
    if (!session.expires_at || Number(session.expires_at) <= Date.now()) return null;
    return session;
  } catch (error) {
    return null;
  }
}

function validarSesionConAlcance_(token, requiredScope) {
  var session = leerSesionPortalB2B_(token);
  if (!session) return false;
  return requiredScope !== 'admin' || session.scope === 'admin';
}

function validarSesionPortalB2B_(token, requiredScope) {
  var session = leerSesionPortalB2B_(token);
  var required = requiredScope === 'admin' ? 'admin' : 'access';
  if (!session || (required === 'admin' && session.scope !== 'admin')) {
    return { ok: false, valid: false, error: 'Sesión vencida o inválida' };
  }
  return { ok: true, valid: true, scope: session.scope, expires_at: Number(session.expires_at) };
}

function normalizarReferencia_(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizarNombreProveedor_(value) {
  var text = String(value || '').trim().replace(/\s+/g, ' ');
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (error) {
    // Apps Script V8 soporta normalize; el fallback conserva comparación segura.
  }
  return text.toUpperCase();
}

function asegurarHojaProveedores_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_PROVEEDORES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_PROVEEDORES);
    sheet.appendRow([
      'ID', 'Nombre', 'Nombre comercial', 'NIT', 'Contacto', 'Teléfono',
      'Correo', 'Estado', 'Observaciones', 'Creado en', 'Actualizado en'
    ]);
    sheet.getRange(1, 1, 1, 11)
      .setFontWeight('bold')
      .setBackground('#0B1E3D')
      .setFontColor('#00C4CC');
  }
  if (sheet.getLastRow() === 1) {
    var conocidos = {};
    leerFilasCatalogo_().forEach(function(item) {
      var nombre = String(item.proveedor || '').trim();
      if (nombre) conocidos[normalizarNombreProveedor_(nombre)] = nombre;
    });
    var imports = ss.getSheetByName('CATALOGO_IMPORTS');
    if (imports && imports.getLastRow() > 1) {
      imports.getRange(2, 2, imports.getLastRow() - 1, 1).getValues().forEach(function(row) {
        var nombre = String(row[0] || '').trim();
        if (nombre) conocidos[normalizarNombreProveedor_(nombre)] = nombre;
      });
    }
    Object.keys(conocidos).sort().forEach(function(key) {
      var now = new Date();
      sheet.appendRow([Utilities.getUuid(), conocidos[key], conocidos[key], '', '', '', '', 'activo', '', now, now]);
    });
  }
  return sheet;
}

function leerProveedores_() {
  var sheet = asegurarHojaProveedores_();
  if (sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues().map(function(row, index) {
    return {
      id: String(row[0] || ''),
      name: String(row[1] || ''),
      commercial_name: String(row[2] || ''),
      nit: String(row[3] || ''),
      contact: String(row[4] || ''),
      phone: String(row[5] || ''),
      email: String(row[6] || ''),
      status: normalizarReferencia_(row[7]) === 'INACTIVO' ? 'inactivo' : 'activo',
      notes: String(row[8] || ''),
      created_at: row[9] instanceof Date ? row[9].toISOString() : String(row[9] || ''),
      updated_at: row[10] instanceof Date ? row[10].toISOString() : String(row[10] || ''),
      _row: index + 2
    };
  }).filter(function(provider) { return provider.id && provider.name; });
}

function listarProveedoresAdmin_(soloActivos) {
  var proveedores = leerProveedores_().filter(function(provider) {
    return !soloActivos || provider.status === 'activo';
  }).map(function(provider) {
    delete provider._row;
    return provider;
  });
  return { ok: true, proveedores: proveedores };
}

function guardarProveedorAdmin_(input) {
  var id = String(input.id || '').trim();
  var nombre = String(input.name || '').trim().replace(/\s+/g, ' ');
  var nombreComercial = String(input.commercial_name || '').trim().replace(/\s+/g, ' ');
  var estado = String(input.status || 'activo').toLowerCase() === 'inactivo' ? 'inactivo' : 'activo';
  if (!nombre) return { ok: false, error: 'El nombre del proveedor es obligatorio' };
  if (!nombreComercial) return { ok: false, error: 'El nombre comercial del proveedor es obligatorio' };
  var email = String(input.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'El correo del proveedor no es válido' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = asegurarHojaProveedores_();
    var proveedores = leerProveedores_();
    var normalized = normalizarNombreProveedor_(nombre);
    if (proveedores.some(function(provider) {
      return provider.id !== id && normalizarNombreProveedor_(provider.name) === normalized;
    })) return { ok: false, error: 'Ya existe un proveedor con ese nombre' };

    var existente = id ? proveedores.filter(function(provider) { return provider.id === id; })[0] : null;
    if (id && !existente) return { ok: false, error: 'El proveedor no existe' };
    var now = new Date();
    var row = [
      existente ? existente.id : Utilities.getUuid(),
      nombre,
      nombreComercial,
      String(input.nit || '').trim(),
      String(input.contact || '').trim(),
      String(input.phone || '').trim(),
      email,
      estado,
      String(input.notes || '').trim(),
      existente && existente.created_at ? new Date(existente.created_at) : now,
      now
    ];
    if (existente) sheet.getRange(existente._row, 1, 1, 11).setValues([row]);
    else sheet.appendRow(row);
    var saved = {
      id: row[0], name: row[1], commercial_name: row[2], nit: row[3],
      contact: row[4], phone: row[5], email: row[6], status: row[7],
      notes: row[8], created_at: row[9].toISOString(), updated_at: row[10].toISOString()
    };
    return { ok: true, proveedor: saved };
  } finally {
    lock.releaseLock();
  }
}

function resolverProveedorActivo_(idOrName) {
  var key = String(idOrName || '').trim();
  var normalized = normalizarNombreProveedor_(key);
  var provider = leerProveedores_().filter(function(item) {
    return item.status === 'activo'
      && (item.id === key || normalizarNombreProveedor_(item.name) === normalized);
  })[0];
  if (!provider) throw new Error('Selecciona un proveedor activo');
  return provider;
}

function leerFilasCatalogo_() {
  var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_CATALOGO);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(function(header) { return String(header).trim(); });
  return data.slice(1).map(function(row) {
    var item = {};
    headers.forEach(function(header, index) { item[header] = row[index]; });
    return item;
  }).filter(function(item) { return item.nombre; });
}

function resolverProductosCatalogo_(items) {
  var catalogo = leerFilasCatalogo_();
  var porNombre = {};
  catalogo.forEach(function(item) { porNombre[normalizarReferencia_(item.nombre)] = item; });
  return items.map(function(requested) {
    var cantidad = Number(requested.quantity);
    var catalogItem = porNombre[normalizarReferencia_(requested.product)];
    if (!catalogItem) throw new Error('Producto no disponible en el catálogo publicado: ' + requested.product);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) throw new Error('Cantidad inválida');
    return {
      producto: catalogItem.nombre,
      proveedor: catalogItem.proveedor,
      cantidad: cantidad,
      precioProveedor: Number(catalogItem.precioCompra),
      precioCredilek: Number(catalogItem.precioVenta)
    };
  });
}

function validarTiendaPublica_(storeCode, storeName, city) {
  var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_TIENDAS);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  return data.slice(1).some(function(row) {
    return String(row[0]) === String(storeCode)
      && normalizarReferencia_(row[1]) === normalizarReferencia_(storeName)
      && normalizarReferencia_(row[2]) === normalizarReferencia_(city)
      && normalizarReferencia_(row[5]) !== 'NO';
  });
}

function pedidoYaRegistrado_(numeroPedido) {
  var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_HISTORIAL);
  if (!sheet || sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().some(function(row) {
    return String(row[0]) === String(numeroPedido);
  });
}

function normalizarNumeroPedidoAura_(numeroPedido) {
  var suffix = String(numeroPedido || '')
    .trim()
    .replace(/^(?:[A-Z]+-B2B|CRD)-?/i, '')
    .replace(/[^A-Z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return 'AURA-B2B-' + (suffix || Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd-HHmmss'));
}

function formatearCOP_(valor) {
  var entero = Math.round(Number(valor) || 0);
  var absoluto = String(Math.abs(entero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (entero < 0 ? '-$' : '$') + absoluto;
}

function construirMensajeConfirmacion_(nombre, numeroPedido, totalUnidades, totalValor) {
  return [
    'Pedido confirmado – AURA B2B',
    '',
    'Hola, ' + String(nombre || 'cliente') + ' 👋',
    '',
    'Tu pedido ha sido registrado exitosamente.',
    '',
    '📋 Número de pedido: ' + numeroPedido,
    '📦 Unidades: ' + String(totalUnidades),
    '💰 Valor total: ' + formatearCOP_(totalValor),
    '',
    'Nuestro equipo lo procesará en las próximas horas. Gracias por confiar en Creditek.'
  ].join('\n');
}

function guardarPedidoPublico_(body) {
  if (!body.order_id || !Array.isArray(body.items) || !body.items.length) {
    return { ok: false, error: 'Pedido inválido' };
  }
  if (!validarTiendaPublica_(body.store_code, body.store_name, body.city)) {
    return { ok: false, error: 'Tienda no autorizada' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var numeroPedido = normalizarNumeroPedidoAura_(body.order_id);
    if (pedidoYaRegistrado_(numeroPedido)) {
      return { ok: true, numeroPedido: numeroPedido, duplicado: true };
    }
    var resolved = resolverProductosCatalogo_(body.items).map(function(item) {
      item.tienda = body.store_name;
      item.ciudad = body.city;
      item.numeroPedido = numeroPedido;
      return item;
    });
    return guardarPedido_(resolved);
  } finally {
    lock.releaseLock();
  }
}

function guardarPedido_(items) {
  if (!items || !items.length) return { ok: false, error: 'Pedido vacio' };
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var tiendaNombre = items[0].tienda;
  var ciudad = items[0].ciudad;
  var fecha = new Date();
  var numeroPedido = items[0].numeroPedido || generarNumeroPedido_();
  var sheetNombre = tiendaNombre + ' - ' + ciudad;
  var sheet = ss.getSheetByName(sheetNombre);
  if (!sheet) {
    sheet = ss.insertSheet(sheetNombre);
    sheet.appendRow(['Fecha', 'No. Pedido', 'Producto', 'Proveedor', 'Cantidad', 'Precio Proveedor', 'Precio Tienda', 'Estado']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#00C4CC');
  }
  items.forEach(function(item) {
    sheet.appendRow([
      Utilities.formatDate(fecha, 'America/Bogota', 'yyyy-MM-dd HH:mm'),
      numeroPedido, item.producto || '', item.proveedor || '',
      Number(item.cantidad) || 0, Number(item.precioProveedor) || 0, Number(item.precioCredilek) || 0,
      'PENDIENTE'
    ]);
  });
  guardarEnHistorial_(items, numeroPedido, fecha, tiendaNombre, ciudad);
  var resultWA = enviarConfirmacionWA_(items, numeroPedido, tiendaNombre, ciudad);
  var totalUnidades = items.reduce(function(s, i) { return s + Number(i.cantidad); }, 0);
  var totalValor = items.reduce(function(s, i) { return s + (Number(i.precioCredilek) * Number(i.cantidad)); }, 0);
  return {
    ok: true,
    numeroPedido: numeroPedido,
    tienda: tiendaNombre,
    ciudad: ciudad,
    totalUnidades: totalUnidades,
    totalValor: totalValor,
    mensaje: construirMensajeConfirmacion_(tiendaNombre, numeroPedido, totalUnidades, totalValor),
    whatsapp: resultWA
  };
}

function enviarConfirmacionWA_(items, numeroPedido, tiendaNombre, ciudad) {
  try {
    if (CONFIG.WA_ACCESS_TOKEN === 'PEGA_AQUI_TU_TOKEN_60_DIAS') return { enviado: false, motivo: 'Token no configurado' };
    if (CONFIG.WA_ORDER_TEMPLATE_NAME === 'PEGA_AQUI_NOMBRE_PLANTILLA') return { enviado: false, motivo: 'Plantilla no configurada' };
    var telefono = obtenerTelefonoTienda_(tiendaNombre, ciudad);
    if (!telefono) return { enviado: false, motivo: 'Sin telefono registrado para ' + tiendaNombre };
    var totalUnidades = items.reduce(function(s, i) { return s + Number(i.cantidad); }, 0);
    var totalValor = items.reduce(function(s, i) { return s + (Number(i.precioCredilek) * Number(i.cantidad)); }, 0);
    var valorFormateado = formatearCOP_(totalValor);
    var parameters;
    if (CONFIG.WA_ORDER_TEMPLATE_NAME === 'test_variable') {
      var resumenCompleto = construirMensajeConfirmacion_(tiendaNombre, numeroPedido, totalUnidades, totalValor);
      parameters = [{ type: 'text', text: resumenCompleto }];
    } else {
      parameters = [
        { type: 'text', text: tiendaNombre },
        { type: 'text', text: numeroPedido },
        { type: 'text', text: String(totalUnidades) },
        { type: 'text', text: valorFormateado }
      ];
    }
    var payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual',
      to: telefono.toString().replace(/[\s+\-().]/g, ''),
      type: 'template',
      template: {
        name: CONFIG.WA_ORDER_TEMPLATE_NAME,
        language: { code: CONFIG.WA_ORDER_LANGUAGE_CODE },
        components: [{ type: 'body', parameters: parameters }]
      }
    };
    var url = 'https://graph.facebook.com/' + CONFIG.WA_API_VERSION + '/' + CONFIG.PHONE_NUMBER_ID + '/messages';
    var response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CONFIG.WA_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var statusCode = response.getResponseCode();
    var responseBody = JSON.parse(response.getContentText());
    Logger.log('WhatsApp [' + statusCode + '] → ' + tiendaNombre + ' (' + telefono + ')');
    if (statusCode === 200 && responseBody.messages) {
      actualizarEstadoWA_(numeroPedido, 'WA_ENVIADO');
      return { enviado: true, messageId: responseBody.messages[0].id, telefono: telefono };
    } else {
      var errorMsg = responseBody.error ? responseBody.error.message : 'Error desconocido';
      actualizarEstadoWA_(numeroPedido, 'WA_ERROR');
      return { enviado: false, error: errorMsg, statusCode: statusCode };
    }
  } catch (err) {
    Logger.log('Error critico WhatsApp: ' + err.message);
    return { enviado: false, error: err.message };
  }
}

function obtenerTelefonoTienda_(tiendaNombre, ciudad) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_TIENDAS);
  if (!sheet) { Logger.log('Hoja TIENDAS no existe. Ejecuta inicializarTiendas() primero.'); return null; }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var nombreSheet = String(data[i][1]).trim();
    var ciudadSheet = String(data[i][2]).trim();
    var tel = String(data[i][3]).trim();
    if (nombreSheet === tiendaNombre.trim() && (!ciudad || ciudadSheet === ciudad.trim()) && tel !== '') return tel;
  }
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][1]).trim() === tiendaNombre.trim()) {
      var t = String(data[j][3]).trim();
      return t !== '' ? t : null;
    }
  }
  return null;
}

function guardarEnHistorial_(items, numeroPedido, fecha, tiendaNombre, ciudad) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hist = ss.getSheetByName(CONFIG.SHEET_HISTORIAL);
  if (!hist) {
    hist = ss.insertSheet(CONFIG.SHEET_HISTORIAL);
    var headers = ['Fecha', 'No. Pedido', 'Tienda', 'Ciudad', 'Productos', 'Total Unidades', 'Valor Total COP', 'Estado WA'];
    hist.appendRow(headers);
    hist.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#00C4CC');
    hist.setFrozenRows(1);
    hist.getRange('G:G').setNumberFormat('$#,##0');
  }
  var totalUnidades = items.reduce(function(s, i) { return s + Number(i.cantidad); }, 0);
  var totalValor = items.reduce(function(s, i) { return s + (Number(i.precioCredilek) * Number(i.cantidad)); }, 0);
  var productos = items.map(function(i) { return i.producto + ' x' + i.cantidad; }).join(' | ');
  hist.appendRow([
    Utilities.formatDate(fecha, 'America/Bogota', 'yyyy-MM-dd HH:mm'),
    numeroPedido, tiendaNombre, ciudad, productos, totalUnidades, totalValor, 'PENDIENTE'
  ]);
}

function actualizarEstadoWA_(numeroPedido, estado) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var hist = ss.getSheetByName(CONFIG.SHEET_HISTORIAL);
    if (!hist) return;
    var data = hist.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === numeroPedido) { hist.getRange(i + 1, 8).setValue(estado); return; }
    }
  } catch (err) { Logger.log('Error actualizando estado WA: ' + err.message); }
}

function leerHistorial_(tienda) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hist = ss.getSheetByName(CONFIG.SHEET_HISTORIAL);
  if (!hist) return { ok: true, pedidos: [] };
  var data = hist.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, pedidos: [] };
  var headers = data[0];
  var rows = data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i] instanceof Date ? Utilities.formatDate(row[i], 'America/Bogota', 'yyyy-MM-dd HH:mm') : row[i];
    });
    return obj;
  });
  if (tienda) rows = rows.filter(function(r) { return r['Tienda'] === tienda; });
  rows.reverse();
  return { ok: true, pedidos: rows };
}

function generarNumeroPedido_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var hist = ss.getSheetByName(CONFIG.SHEET_HISTORIAL);
  var fechaStr = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd');
  var contador = 1;
  if (hist) {
    var data = hist.getDataRange().getValues();
    var prefijo = 'AURA-B2B-' + fechaStr + '-';
    data.slice(1).forEach(function(row) { if (String(row[1]).indexOf(prefijo) === 0) contador++; });
  }
  return 'AURA-B2B-' + fechaStr + '-' + String(contador).padStart(3, '0');
}

function leerTiendas_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_TIENDAS);
  if (!sheet) return { ok: true, tiendas: [] };
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, tiendas: [] };
  var headers = data[0];
  var tiendas = data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
  return { ok: true, tiendas: tiendas };
}

function inicializarTiendas() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var existing = ss.getSheetByName(CONFIG.SHEET_TIENDAS);
  if (existing) {
    ss.deleteSheet(existing);
  }
  var sheet = ss.insertSheet(CONFIG.SHEET_TIENDAS);
  var headers = ['tienda_id', 'nombre', 'ciudad', 'telefono_encargado', 'email_encargado', 'activa'];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#00C4CC');
  var tiendas = [
    ['CRD-TOL-01', 'Cellfiao Tolu',       'Tolu',           '573112889758', 'luisa.medrano@crediteksas.com',   'SI'],
    ['CRD-COR-01', 'Movil Shoping',        'Corozal',        '573014991556', 'andrea.velez@crediteksas.com',    'SI'],
    ['CRD-COR-02', 'Celfiao Tecnologia',   'Corozal',        '573113052878', 'katty.puello@crediteksas.com',    'SI'],
    ['CRD-COR-03', 'Creditel Store',       'Corozal',        '573144220401', 'wendy.perez@crediteksas.com',     'SI'],
    ['CRD-CHI-01', 'Chinu Cell',           'Chinu',          '573234052533', 'luis.marin@crediteksas.com',      'SI'],
    ['CRD-CHI-02', 'Creditel Chinu',       'Chinu',          '573052044046', 'yajaira.salas@crediteksas.com',   'SI'],
    ['CRD-CHI-03', 'Sonivox Chinu',        'Chinu',          '573052044046', 'vanessa.salas@crediteksas.com',   'SI'],
    ['CRD-CIE-01', 'OroCell',              'Cienaga de Oro', '573006177114', 'carmen.viggiani@crediteksas.com', 'SI'],
    ['CRD-CIE-02', 'KrediSinu',            'Cienaga de Oro', '573021297349', 'digna.pantoja@crediteksas.com',   'SI'],
    ['CRD-COV-01', 'Creditel Covenas',     'Covenas',        '573008529877', 'yulimar.briceno@crediteksas.com', 'SI']
  ];
  tiendas.forEach(function(row) { sheet.appendRow(row); });
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.autoResizeColumns(1, headers.length);
  Logger.log('Hoja TIENDAS creada con 10 tiendas.');
}

function leerCatalogo_() {
  var productos = leerFilasCatalogo_().map(function(row, i) {
    return {
      catalog_item_id: 'sheet-' + i,
      nombre: row.nombre,
      precioVenta: row.precioVenta,
      marca: row.marca,
      categoria: row.categoria
    };
  }).filter(function(p) { return p.nombre && Number(p.precioVenta) > 0; });
  return { ok: true, productos: productos };
}

function leerCatalogoPrivado_() {
  return { ok: true, productos: leerFilasCatalogo_() };
}

function guardarCatalogo_(productos) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_CATALOGO);
  if (!sheet) { sheet = ss.insertSheet(CONFIG.SHEET_CATALOGO); } else { sheet.clearContents(); }
  sheet.appendRow(['proveedor', 'nombre', 'precioCompra', 'precioVenta', 'marca', 'categoria']);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#00C4CC');
  var validos = productos.filter(function(p) { return p.proveedor && String(p.proveedor).trim() !== ''; });
  var descartados = productos.length - validos.length;
  validos.forEach(function(p) {
    sheet.appendRow([p.proveedor, p.nombre, p.precioCompra, p.precioVenta, p.marca, p.categoria]);
  });
  return { ok: true, total: validos.length, descartadosSinProveedor: descartados };
}

function parsePrecio_(linea) {
  var matches = String(linea).match(/\$?\s*\d[\d.,]{3,}/g) || [];
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1].replace(/[^\d]/g, '')) || 0;
}

function detectarMarca_(nombre) {
  var upper = String(nombre).toUpperCase();
  var marcas = ['SAMSUNG','XIAOMI','MOTOROLA','HONOR','INFINIX','TECNO','NOKIA','IPHONE','OPPO','ZTE','REALME','VIVO','HUAWEI','ITEL','ALCATEL','JBL'];
  for (var i = 0; i < marcas.length; i++) if (upper.indexOf(marcas[i]) !== -1) return marcas[i];
  return 'OTROS';
}

function normalizarReferenciaCompleta_(value) {
  var text = String(value || '').trim().replace(/\s+/g, ' ');
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (error) {
    // El fallback conserva una comparación segura en runtimes antiguos.
  }
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function asegurarHojaCatalogoExcepciones_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_CATALOGO_EXCEPCIONES);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_CATALOGO_EXCEPCIONES);
    sheet.appendRow([
      'ID', 'Fila importación', 'Offer ID', 'Proveedor', 'Referencia recibida',
      'Tipo excepción', 'Costo', 'Precio venta', 'Marca', 'Categoría', 'Estado',
      'Referencia canónica', 'Creado en', 'Actualizado en'
    ]);
    sheet.getRange(1, 1, 1, 14)
      .setFontWeight('bold')
      .setBackground('#0B1E3D')
      .setFontColor('#00C4CC');
    sheet.hideSheet();
  }
  return sheet;
}

function asegurarHojaCatalogoReglas_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_CATALOGO_REGLAS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_CATALOGO_REGLAS);
    sheet.appendRow([
      'ID', 'Proveedor', 'Referencia normalizada', 'Referencia recibida',
      'Referencia canónica', 'Activa', 'Creado en', 'Actualizado en'
    ]);
    sheet.getRange(1, 1, 1, 8)
      .setFontWeight('bold')
      .setBackground('#0B1E3D')
      .setFontColor('#00C4CC');
    sheet.hideSheet();
  }
  return sheet;
}

function leerReglasCatalogo_() {
  var sheet = asegurarHojaCatalogoReglas_();
  if (sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues().map(function(row, index) {
    return {
      id: String(row[0] || ''),
      provider: String(row[1] || ''),
      source_normalized: String(row[2] || ''),
      source_reference: String(row[3] || ''),
      canonical_name: String(row[4] || ''),
      active: String(row[5] || '').toUpperCase() !== 'NO',
      created_at: row[6],
      updated_at: row[7],
      _row: index + 2
    };
  }).filter(function(rule) { return rule.id && rule.active; });
}

function leerExcepcionesCatalogo_() {
  var sheet = asegurarHojaCatalogoExcepciones_();
  if (sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues().map(function(row, index) {
    return {
      id: String(row[0] || ''),
      import_row: Number(row[1]) || 0,
      offer_id: String(row[2] || ''),
      provider: String(row[3] || ''),
      source_reference: String(row[4] || ''),
      exception_type: String(row[5] || ''),
      cost: Number(row[6]) || 0,
      sale_price: Number(row[7]) || 0,
      brand: String(row[8] || ''),
      category: String(row[9] || ''),
      status: String(row[10] || 'pendiente').toLowerCase(),
      canonical_name: String(row[11] || ''),
      created_at: row[12],
      updated_at: row[13],
      _row: index + 2
    };
  }).filter(function(exception) { return exception.id; });
}

function construirBorradorCatalogo_(proveedor, rawText, utilityType, utilityValue) {
  var actuales = leerFilasCatalogo_();
  var porNombre = {};
  actuales.forEach(function(item) { porNombre[normalizarReferencia_(item.nombre)] = item; });
  var reglas = {};
  leerReglasCatalogo_().forEach(function(rule) {
    reglas[normalizarNombreProveedor_(rule.provider) + '|' + rule.source_normalized] = rule.canonical_name;
  });
  var draft = [];
  var exceptions = [];

  String(rawText || '').split(/\r?\n/).forEach(function(linea, index) {
    var texto = String(linea).trim();
    var costo = parsePrecio_(texto);
    if (!texto || !costo) return;
    var upper = texto.toUpperCase();
    var noPublicable = /\b(USADO|REACONDICIONADO|A\+\+|A\+)\b/.test(upper)
      || /\bA\b/.test(upper) || /BAJO PEDIDO/.test(upper);
    var referencia = texto
      .replace(/\$?\s*\d[\d.,]{3,}/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/\b(?:57)?3\d{9}\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[-:|→]+$/g, '')
      .trim();
    if (!referencia) return;
    var learnedName = reglas[
      normalizarNombreProveedor_(proveedor) + '|' + normalizarReferenciaCompleta_(referencia)
    ];
    var existente = learnedName
      ? porNombre[normalizarReferencia_(learnedName)]
      : porNombre[normalizarReferencia_(referencia)];
    var salePrice = utilityType === 'percentage'
      ? Math.round(costo * (1 + utilityValue / 100))
      : Math.round(costo + utilityValue);
    var item = {
      offer_id: 'line-' + index,
      proveedor: proveedor,
      nombre: existente ? existente.nombre : referencia,
      precioCompra: costo,
      precioVenta: salePrice,
      marca: existente ? existente.marca : detectarMarca_(referencia),
      categoria: existente ? existente.categoria : 'Celular',
      source_reference: referencia,
      publishable: Boolean(existente) && !noPublicable
    };
    draft.push(item);
    if (!item.publishable) exceptions.push({
      offer_id: item.offer_id,
      source_reference: referencia,
      exception_type: noPublicable ? 'not_publishable' : 'missing_image'
    });
  });
  return { draft: draft, exceptions: exceptions };
}

function persistirExcepcionesCatalogo_(importRow, proveedor, draft, exceptions) {
  var sheet = asegurarHojaCatalogoExcepciones_();
  var existing = leerExcepcionesCatalogo_();
  var now = new Date();
  exceptions.forEach(function(exception) {
    var item = draft.filter(function(row) { return row.offer_id === exception.offer_id; })[0];
    if (!item) return;
    var current = existing.filter(function(row) {
      return normalizarNombreProveedor_(row.provider) === normalizarNombreProveedor_(proveedor)
        && normalizarReferenciaCompleta_(row.source_reference) === normalizarReferenciaCompleta_(exception.source_reference)
        && row.status === 'pendiente';
    })[0];
    var id = current ? current.id : 'catalog-exception-' + importRow + '-' + exception.offer_id;
    var values = [
      id, importRow, exception.offer_id, proveedor, exception.source_reference,
      exception.exception_type, item.precioCompra, item.precioVenta, item.marca,
      item.categoria, 'pendiente', '', current ? current.created_at : now, now
    ];
    if (current) sheet.getRange(current._row, 1, 1, 14).setValues([values]);
    else sheet.appendRow(values);
  });
}

function bootstrapExcepcionesCatalogo_() {
  var sheet = asegurarHojaCatalogoExcepciones_();
  if (sheet.getLastRow() > 1) return;
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var imports = ss.getSheetByName('CATALOGO_IMPORTS');
  if (!imports || imports.getLastRow() <= 1) return;
  var importRow = imports.getLastRow();
  var row = imports.getRange(importRow, 1, 1, 3).getValues()[0];
  var parsed = construirBorradorCatalogo_(String(row[1] || ''), String(row[2] || ''), 'fixed', 0);
  persistirExcepcionesCatalogo_(importRow, String(row[1] || ''), parsed.draft, parsed.exceptions);
}

function listarExcepcionesCatalogoAdmin_() {
  bootstrapExcepcionesCatalogo_();
  return {
    ok: true,
    excepciones: leerExcepcionesCatalogo_().filter(function(exception) {
      return exception.status === 'pendiente';
    }).map(function(exception) {
      delete exception._row;
      return exception;
    })
  };
}

function guardarImportOriginal_(proveedor, rawText) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('CATALOGO_IMPORTS') || ss.insertSheet('CATALOGO_IMPORTS');
  if (sheet.getLastRow() === 0) sheet.appendRow(['Fecha', 'Proveedor', 'Texto original']);
  sheet.appendRow([new Date(), proveedor, rawText]);
  sheet.hideSheet();
  return sheet.getLastRow();
}

function analizarCatalogoAdmin_(body) {
  var rawText = String(body.raw_text || '');
  var proveedor;
  var utilityType = body.utility_type === 'percentage' ? 'percentage' : 'fixed';
  var utilityValue = Number(body.utility_value);
  if (!body.provider || !rawText.trim()) return { ok: false, error: 'Proveedor y lista son obligatorios' };
  try {
    proveedor = resolverProveedorActivo_(body.provider).name;
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!isFinite(utilityValue) || utilityValue < 0) return { ok: false, error: 'Utilidad inválida' };

  var importRow = guardarImportOriginal_(proveedor, rawText);
  var parsed = construirBorradorCatalogo_(proveedor, rawText, utilityType, utilityValue);
  var draft = parsed.draft;
  var exceptions = parsed.exceptions;
  persistirExcepcionesCatalogo_(importRow, proveedor, draft, exceptions);
  return {
    ok: true,
    draft: draft,
    exceptions: exceptions,
    preview: draft.filter(function(item) { return item.publishable; }).map(function(item) {
      return {
        name: item.nombre, provider_name: item.proveedor, cost: item.precioCompra,
        sale_price: item.precioVenta, image_status: 'Imagen conservada'
      };
    }),
    version_id: 'sheet-draft'
  };
}

function guardarReglaCatalogo_(sheet, exception, canonicalName) {
  var rules = leerReglasCatalogo_();
  var normalizedSource = normalizarReferenciaCompleta_(exception.source_reference);
  var current = rules.filter(function(rule) {
    return normalizarNombreProveedor_(rule.provider) === normalizarNombreProveedor_(exception.provider)
      && rule.source_normalized === normalizedSource;
  })[0];
  var now = new Date();
  var values = [
    current ? current.id : Utilities.getUuid(),
    exception.provider,
    normalizedSource,
    exception.source_reference,
    canonicalName,
    'SI',
    current ? current.created_at : now,
    now
  ];
  if (current) sheet.getRange(current._row, 1, 1, 8).setValues([values]);
  else sheet.appendRow(values);
}

function agregarReferenciaCatalogo_(exception, canonical) {
  var name = String(canonical.canonicalName || '').trim().replace(/\s+/g, ' ');
  var brand = String(canonical.brand || '').trim();
  var model = String(canonical.model || '').trim();
  var ram = Number(canonical.ramGb);
  var storage = Number(canonical.storageGb);
  var category = String(canonical.category || 'Celulares').trim();
  if (!name || !brand || !model || !ram || !storage || !category) {
    throw new Error('Completa o selecciona una referencia canónica antes de guardar.');
  }
  var actuales = leerFilasCatalogo_();
  var duplicate = actuales.filter(function(item) {
    return normalizarReferenciaCompleta_(item.nombre) === normalizarReferenciaCompleta_(name);
  })[0];
  if (duplicate) throw new Error('Ya existe una referencia similar. Revísala antes de crear una nueva.');

  var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_CATALOGO);
  if (!sheet) throw new Error('No existe la hoja central CATALOGO');
  sheet.appendRow([
    exception.provider,
    name,
    exception.cost,
    exception.sale_price,
    brand,
    normalizarReferencia_(category) === 'CELULARES' ? 'Celular' : category
  ]);
  return name;
}

function guardarReglaCatalogoAdmin_(body) {
  var exceptionId = String(body.exception_id || '').trim();
  if (!exceptionId) return { ok: false, error: 'Excepción inexistente' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    bootstrapExcepcionesCatalogo_();
    var exceptionSheet = asegurarHojaCatalogoExcepciones_();
    var exception = leerExcepcionesCatalogo_().filter(function(row) {
      return row.id === exceptionId;
    })[0];
    if (!exception) return { ok: false, error: 'Excepción inexistente' };
    if (exception.status === 'resuelta') {
      return {
        ok: true,
        idempotent: true,
        offer_id: exception.offer_id,
        canonical_name: exception.canonical_name,
        pending_count: leerExcepcionesCatalogo_().filter(function(row) {
          return row.status === 'pendiente';
        }).length
      };
    }

    var canonicalName = '';
    if (body.create_new === true) {
      canonicalName = agregarReferenciaCatalogo_(exception, body.canonical || {});
    } else {
      canonicalName = String(body.canonical_product_id || '').trim();
      if (!canonicalName) {
        return { ok: false, error: 'Completa o selecciona una referencia canónica antes de guardar.' };
      }
      var product = leerFilasCatalogo_().filter(function(item) {
        return normalizarReferencia_(item.nombre) === normalizarReferencia_(canonicalName);
      })[0];
      if (!product) return { ok: false, error: 'Referencia canónica inexistente' };
      canonicalName = product.nombre;
    }

    guardarReglaCatalogo_(asegurarHojaCatalogoReglas_(), exception, canonicalName);
    var now = new Date();
    exceptionSheet.getRange(exception._row, 11, 1, 4).setValues([[
      'resuelta', canonicalName, exception.created_at || now, now
    ]]);
    return {
      ok: true,
      offer_id: exception.offer_id,
      canonical_name: canonicalName,
      created: body.create_new === true,
      pending_count: leerExcepcionesCatalogo_().filter(function(row) {
        return row.status === 'pendiente';
      }).length
    };
  } finally {
    lock.releaseLock();
  }
}

function crearSnapshotCatalogo_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('CATALOGO_HISTORICO') || ss.insertSheet('CATALOGO_HISTORICO');
  if (sheet.getLastRow() === 0) sheet.appendRow(['Fecha', 'Catálogo JSON']);
  sheet.appendRow([new Date(), JSON.stringify(leerFilasCatalogo_())]);
  sheet.hideSheet();
}

function publicarCatalogoAdmin_(body) {
  if (!Array.isArray(body.productos) || !body.productos.length) return { ok: false, error: 'No hay productos listos para publicar' };
  if (body.productos.some(function(item) {
    return !item.nombre || !item.proveedor || Number(item.precioCompra) <= 0 || Number(item.precioVenta) <= 0;
  })) return { ok: false, error: 'El catálogo contiene productos incompletos' };
  crearSnapshotCatalogo_();
  var actuales = leerFilasCatalogo_();
  var cambios = {};
  body.productos.forEach(function(item) { cambios[normalizarReferencia_(item.nombre)] = item; });
  var merged = actuales.map(function(item) { return cambios[normalizarReferencia_(item.nombre)] || item; });
  body.productos.forEach(function(item) {
    if (!actuales.some(function(actual) {
      return normalizarReferencia_(actual.nombre) === normalizarReferencia_(item.nombre);
    })) merged.push(item);
  });
  var result = guardarCatalogo_(merged);
  result.version = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd-HHmmss');
  return result;
}

function rollbackCatalogoAdmin_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('CATALOGO_HISTORICO');
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, error: 'No existe una versión anterior' };
  var row = sheet.getLastRow();
  var productos = JSON.parse(String(sheet.getRange(row, 2).getValue() || '[]'));
  if (!productos.length) return { ok: false, error: 'La versión anterior está vacía' };
  guardarCatalogo_(productos);
  sheet.deleteRow(row);
  return { ok: true, total: productos.length };
}

function leerHistoricoCatalogo_(search) {
  var needle = normalizarReferencia_(search);
  return {
    ok: true,
    productos: leerFilasCatalogo_().filter(function(item) {
      return !needle || normalizarReferencia_(item.nombre).indexOf(needle) !== -1;
    }).map(function(item) {
      return {
        canonical_name: item.nombre, provider_name: item.proveedor, cost: item.precioCompra,
        created_at: 'Catálogo actual', won: true
      };
    })
  };
}

function estadisticasCatalogo_() {
  var agrupado = {};
  leerFilasCatalogo_().forEach(function(item) {
    var proveedor = String(item.proveedor || 'Sin proveedor');
    if (!agrupado[proveedor]) agrupado[proveedor] = { provider_name: proveedor, won_references: 0, total: 0 };
    agrupado[proveedor].won_references++;
    agrupado[proveedor].total += Number(item.precioCompra) || 0;
  });
  return {
    ok: true,
    proveedores: Object.keys(agrupado).map(function(key) {
      var row = agrupado[key];
      row.won_percentage = 100;
      row.average_cost = row.won_references ? Math.round(row.total / row.won_references) : 0;
      row.month = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM');
      return row;
    })
  };
}

function leerPedidos_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheets = ss.getSheets();
  var pedidos = [];
  var hojasSistema = [CONFIG.SHEET_TIENDAS, CONFIG.SHEET_HISTORIAL, CONFIG.SHEET_CATALOGO, 'Hoja 1', 'Sheet1', 'RESUMEN', 'CIERRES'];
  sheets.forEach(function(sheet) {
    var nombre = sheet.getName();
    if (hojasSistema.indexOf(nombre) !== -1) return;
    if (nombre.indexOf(' - ') === -1) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    data.slice(1).forEach(function(row, idx) {
      if (!row[2]) return;
      if (row[7] === 'CERRADO') return;
      pedidos.push({
        fecha: row[0] instanceof Date ? Utilities.formatDate(row[0], 'America/Bogota', 'yyyy-MM-dd HH:mm') : row[0],
        numeroPedido: row[1] || '', tienda: nombre.split(' - ')[0], ciudad: nombre.split(' - ')[1] || '',
        producto: row[2], proveedor: row[3], cantidad: row[4], precioProveedor: row[5], precioCredilek: row[6],
        _hoja: nombre, _fila: idx + 2
      });
    });
  });
  return { ok: true, pedidos: pedidos };
}

function cerrarPeriodo_(pedidos) {
  if (!pedidos || !pedidos.length) return { ok: false, error: 'Sin pedidos para cerrar' };
  var resumen = {};
  pedidos.forEach(function(p) {
    var key = p.proveedor || 'Sin proveedor';
    if (!resumen[key]) resumen[key] = {};
    if (!resumen[key][p.ciudad]) resumen[key][p.ciudad] = [];
    resumen[key][p.ciudad].push(p);
  });
  var html = '<h2 style="color:#0B1E3D">Creditek — Cierre de Periodo</h2>';
  html += '<p style="color:#666">Fecha: ' + Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy HH:mm') + '</p><hr>';
  Object.keys(resumen).sort().forEach(function(proveedor) {
    html += '<h3 style="color:#0B1E3D;margin-top:20px">' + proveedor + '</h3>';
    Object.keys(resumen[proveedor]).sort().forEach(function(ciudad) {
      html += '<h4 style="color:#00C4CC;margin-left:16px">' + ciudad + '</h4>';
      html += '<table border="1" cellpadding="6" cellspacing="0" style="margin-left:32px;border-collapse:collapse;font-size:13px">';
      html += '<tr style="background:#0B1E3D;color:#00C4CC"><th>Tienda</th><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>';
      resumen[proveedor][ciudad].forEach(function(p) {
        var sub = Number(p.precioProveedor) * Number(p.cantidad);
        html += '<tr><td>' + p.tienda + '</td><td>' + p.producto + '</td><td>' + p.cantidad + '</td>';
        html += '<td>$' + Math.round(Number(p.precioProveedor)).toLocaleString('es-CO') + '</td>';
        html += '<td>$' + Math.round(sub).toLocaleString('es-CO') + '</td></tr>';
      });
      html += '</table>';
    });
  });
  var total = pedidos.reduce(function(s, p) { return s + Number(p.precioProveedor) * Number(p.cantidad); }, 0);
  html += '<hr><h3>Total a pagar proveedores: $' + Math.round(total).toLocaleString('es-CO') + '</h3>';

  html += '<h2 style="color:#0B1E3D;margin-top:30px">📋 DETALLE PARA REPARTIR (Por Tienda)</h2>';
  html += '<p style="color:#666">Guía de distribución individual para despacho una vez se reciban las cajas globales:</p>';
  var porTiendaDetalle = {};
  pedidos.forEach(function(p) {
    if (!porTiendaDetalle[p.tienda]) porTiendaDetalle[p.tienda] = {};
    porTiendaDetalle[p.tienda][p.producto] = (porTiendaDetalle[p.tienda][p.producto] || 0) + Number(p.cantidad);
  });
  Object.keys(porTiendaDetalle).sort().forEach(function(tienda) {
    html += '<h3 style="color:#0B1E3D;margin-top:16px">🏪 ' + tienda + '</h3>';
    html += '<table border="1" cellpadding="6" cellspacing="0" style="margin-left:16px;border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#0B1E3D;color:#00C4CC"><th>Producto Asignado</th><th>Unidades a Entregar</th></tr>';
    Object.keys(porTiendaDetalle[tienda]).sort().forEach(function(producto) {
      html += '<tr><td>' + producto + '</td><td>' + porTiendaDetalle[tienda][producto] + '</td></tr>';
    });
    html += '</table>';
  });

  var fechaCierreStr = Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy HH:mm');
  var cierresGid = guardarCierreEnSheet_(pedidos, fechaCierreStr);
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID + '/edit#gid=' + cierresGid;
  html += '<hr><p style="margin-top:20px"><a href="' + sheetUrl + '" style="color:#00C4CC;font-weight:bold">Ver en Google Sheets →</a></p>';

  MailApp.sendEmail({
    to: CONFIG.EMAIL_COMERCIAL + ',' + CONFIG.EMAIL_GESTION,
    subject: 'Creditek · Cierre Periodo · ' + Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy'),
    htmlBody: html
  });

  var porTienda = {};
  pedidos.forEach(function(p) {
    var key = p.tienda + '|' + p.ciudad;
    if (!porTienda[key]) porTienda[key] = { tienda: p.tienda, ciudad: p.ciudad, numeros: [] };
    if (porTienda[key].numeros.indexOf(p.numeroPedido) === -1) porTienda[key].numeros.push(p.numeroPedido);
  });
  var resultadosWA = [];
  Object.keys(porTienda).forEach(function(key) {
    var t = porTienda[key];
    resultadosWA.push(enviarNotificacionCierre_(t.tienda, t.ciudad, t.numeros));
  });

  var ssMarcar = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  pedidos.forEach(function(p) {
    if (p._hoja && p._fila) {
      var hojaTienda = ssMarcar.getSheetByName(p._hoja);
      if (hojaTienda) hojaTienda.getRange(p._fila, 8).setValue('CERRADO');
    }
  });

  return { ok: true, emailEnviado: true, total: total, notificacionesWA: resultadosWA };
}

function guardarCierreEnSheet_(pedidos, fechaCierreStr) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('CIERRES');
  if (!sheet) {
    sheet = ss.insertSheet('CIERRES');
    var headers = ['Fecha Cierre', 'Tienda', 'Ciudad', 'Proveedor', 'Producto', 'Cantidad', 'Precio Proveedor', 'Precio Tienda', 'No. Pedido'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#00C4CC');
    sheet.setFrozenRows(1);
  }
  pedidos.forEach(function(p) {
    sheet.appendRow([
      fechaCierreStr, p.tienda, p.ciudad, p.proveedor, p.producto,
      Number(p.cantidad) || 0, Number(p.precioProveedor) || 0, Number(p.precioCredilek) || 0, p.numeroPedido
    ]);
  });
  return sheet.getSheetId();
}

function enviarNotificacionCierre_(tiendaNombre, ciudad, numerosPedido) {
  try {
    if (CONFIG.WA_ACCESS_TOKEN === 'PEGA_AQUI_TU_TOKEN_60_DIAS') return { enviado: false, motivo: 'Token no configurado' };
    var telefono = obtenerTelefonoTienda_(tiendaNombre, ciudad);
    if (!telefono) return { enviado: false, tienda: tiendaNombre, motivo: 'Sin telefono registrado' };

    var resumenCompleto = 'Tu pedido ' + numerosPedido.join(', ') + ' ya fue cerrado y enviado a los proveedores. Te avisaremos cuando llegue a tu tienda.';
    var parameters = [{ type: 'text', text: resumenCompleto }];
    var payload = {
      messaging_product: 'whatsapp', recipient_type: 'individual',
      to: telefono.toString().replace(/[\s+\-().]/g, ''),
      type: 'template',
      template: {
        name: CONFIG.WA_TEMPLATE_NAME,
        language: { code: CONFIG.WA_LANGUAGE_CODE },
        components: [{ type: 'body', parameters: parameters }]
      }
    };
    var url = 'https://graph.facebook.com/' + CONFIG.WA_API_VERSION + '/' + CONFIG.PHONE_NUMBER_ID + '/messages';
    var response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CONFIG.WA_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var statusCode = response.getResponseCode();
    var responseBody = JSON.parse(response.getContentText());
    if (statusCode === 200 && responseBody.messages) {
      return { enviado: true, tienda: tiendaNombre, messageId: responseBody.messages[0].id };
    } else {
      var errorMsg = responseBody.error ? responseBody.error.message : 'Error desconocido';
      return { enviado: false, tienda: tiendaNombre, error: errorMsg };
    }
  } catch (err) {
    return { enviado: false, tienda: tiendaNombre, error: err.message };
  }
}

function testWhatsApp() {
  var testItems = [{ tienda: 'TEST', ciudad: 'TEST', producto: 'SAMSUNG A16 4/128GB', cantidad: 2, precioCredilek: 470000 }];
  var result = enviarConfirmacionWA_(testItems, 'AURA-B2B-TEST-001', 'KrediSinu', 'Cienaga de Oro');
  Logger.log('Test WhatsApp: ' + JSON.stringify(result));
  Logger.log('Resultado test WA: ' + JSON.stringify(result, null, 2));
}
