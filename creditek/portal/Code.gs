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
    if (body.action === 'guardar_pedido_publico') {
      result = guardarPedidoPublico_(body);
    } else if ([
      'validar_admin_catalogo', 'leer_pedidos_admin', 'cierre_periodo_admin',
      'analizar_catalogo_admin', 'publicar_catalogo_admin', 'rollback_catalogo_admin',
      'catalogo_privado_admin', 'historico_catalogo_admin', 'estadisticas_catalogo_admin'
    ].indexOf(body.action) !== -1) {
      if (!validarAdminCatalogo_(body.admin_pin)) {
        result = { ok: false, error: 'Acceso administrativo denegado' };
      } else if (body.action === 'validar_admin_catalogo') result = { ok: true, admin: true };
      else if (body.action === 'leer_pedidos_admin') result = leerPedidos_();
      else if (body.action === 'cierre_periodo_admin') result = cerrarPeriodo_(body.pedidos || []);
      else if (body.action === 'analizar_catalogo_admin') result = analizarCatalogoAdmin_(body);
      else if (body.action === 'publicar_catalogo_admin') result = publicarCatalogoAdmin_(body);
      else if (body.action === 'rollback_catalogo_admin') result = rollbackCatalogoAdmin_();
      else if (body.action === 'catalogo_privado_admin') result = leerCatalogoPrivado_();
      else if (body.action === 'historico_catalogo_admin') result = leerHistoricoCatalogo_(body.search || '');
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

function validarAdminCatalogo_(pin) {
  var configured = PropertiesService.getScriptProperties().getProperty('B2B_ADMIN_PIN_HASH');
  if (!configured || !pin) return false;
  var received = sha256Hex_(pin);
  return configured.split(',').some(function(hash) {
    return safeEqual_(hash.trim().toLowerCase(), received);
  });
}

function normalizarReferencia_(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
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
    if (pedidoYaRegistrado_(body.order_id)) {
      return { ok: true, numeroPedido: body.order_id, duplicado: true };
    }
    var resolved = resolverProductosCatalogo_(body.items).map(function(item) {
      item.tienda = body.store_name;
      item.ciudad = body.city;
      item.numeroPedido = body.order_id;
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
  return { ok: true, numeroPedido: numeroPedido, tienda: tiendaNombre, ciudad: ciudad, whatsapp: resultWA };
}

function enviarConfirmacionWA_(items, numeroPedido, tiendaNombre, ciudad) {
  try {
    if (CONFIG.WA_ACCESS_TOKEN === 'PEGA_AQUI_TU_TOKEN_60_DIAS') return { enviado: false, motivo: 'Token no configurado' };
    if (CONFIG.WA_ORDER_TEMPLATE_NAME === 'PEGA_AQUI_NOMBRE_PLANTILLA') return { enviado: false, motivo: 'Plantilla no configurada' };
    var telefono = obtenerTelefonoTienda_(tiendaNombre, ciudad);
    if (!telefono) return { enviado: false, motivo: 'Sin telefono registrado para ' + tiendaNombre };
    var totalUnidades = items.reduce(function(s, i) { return s + Number(i.cantidad); }, 0);
    var totalValor = items.reduce(function(s, i) { return s + (Number(i.precioCredilek) * Number(i.cantidad)); }, 0);
    var valorFormateado = '$' + Math.round(totalValor).toLocaleString('es-CO');
    var parameters;
    if (CONFIG.WA_ORDER_TEMPLATE_NAME === 'test_variable') {
      var resumenCompleto = 'Pedido ' + numeroPedido + ' | Tienda: ' + tiendaNombre + ' | ' + String(totalUnidades) + ' uds | Total: ' + valorFormateado;
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
    var prefijo = 'CRD-' + fechaStr + '-';
    data.slice(1).forEach(function(row) { if (String(row[1]).indexOf(prefijo) === 0) contador++; });
  }
  return 'CRD-' + fechaStr + '-' + String(contador).padStart(3, '0');
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

function guardarImportOriginal_(proveedor, rawText) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName('CATALOGO_IMPORTS') || ss.insertSheet('CATALOGO_IMPORTS');
  if (sheet.getLastRow() === 0) sheet.appendRow(['Fecha', 'Proveedor', 'Texto original']);
  sheet.appendRow([new Date(), proveedor, rawText]);
  sheet.hideSheet();
}

function analizarCatalogoAdmin_(body) {
  var rawText = String(body.raw_text || '');
  var proveedor = String(body.provider || '').trim();
  var utilityType = body.utility_type === 'percentage' ? 'percentage' : 'fixed';
  var utilityValue = Number(body.utility_value);
  if (!proveedor || !rawText.trim()) return { ok: false, error: 'Proveedor y lista son obligatorios' };
  if (!isFinite(utilityValue) || utilityValue < 0) return { ok: false, error: 'Utilidad inválida' };

  guardarImportOriginal_(proveedor, rawText);
  var actuales = leerFilasCatalogo_();
  var porNombre = {};
  actuales.forEach(function(item) { porNombre[normalizarReferencia_(item.nombre)] = item; });
  var draft = [];
  var exceptions = [];

  rawText.split(/\r?\n/).forEach(function(linea, index) {
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
      .replace(/[-:|]+$/g, '')
      .trim();
    if (!referencia) return;
    var existente = porNombre[normalizarReferencia_(referencia)];
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
  var result = enviarConfirmacionWA_(testItems, 'CRD-TEST-001', 'KrediSinu', 'Cienaga de Oro');
  Logger.log('Test WhatsApp: ' + JSON.stringify(result));
  Logger.log('Resultado test WA: ' + JSON.stringify(result, null, 2));
}
