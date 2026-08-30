// ============================================================
// CREDITEK SAS — Convenios Aliados
// Apps Script Web App v2.5 (10 jul 2026)
// comercial@crediteksas.com
// Carpeta TERCEROS: 1D17aHqwxnqr6GHpKezzekDLBv8Hy4PoS
//
// CAMBIOS v2.5:
// - generarPDFDesdeImagenes ahora delega la combinación al Worker
//   creditek-pdf-combiner (pdf-lib) en vez de DocumentApp — soporta
//   mezcla de fotos + PDF reales en cualquier documento.
// - Nuevo: identificación del vendedor propio (equipo comercial) que
//   gestiona cada convenio — carpeta, correo, y pestaña "Relación".
// ============================================================

const CARPETA_TERCEROS_ID = '1D17aHqwxnqr6GHpKezzekDLBv8Hy4PoS';
const CORREO_CREDITEK     = 'comercial@crediteksas.com';
const NIT_CREDITEK        = '901.259.859-0';

const SHEET_ID_CONTROL_COMERCIAL = '1UAmh1A9TnvoBKpAsdc9aQKEvGm36SanvNp5JcJXoFTA';
const PDF_COMBINER_URL = 'https://creditek-pdf-combiner.comercial-853.workers.dev/combinar';

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'vendedores_convenio') {
    return ContentService
      .createTextOutput(JSON.stringify(leerVendedoresConvenios_()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'accion no reconocida' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const radicado        = data.radicado;
    const cedula          = data.cedula;
    const nombreComercial = data.nombreComercial;

    const carpetaPrincipal = DriveApp.getFolderById(CARPETA_TERCEROS_ID);
    let carpetaAliado = buscarCarpetaPorCedula(carpetaPrincipal, cedula);
    const esNuevo = !carpetaAliado;

    if (esNuevo) {
      const nombreCarpeta = radicado + ' · ' + nombreComercial.toUpperCase() + ' [' + data.vendedorCreador + ']';
      carpetaAliado = carpetaPrincipal.createFolder(nombreCarpeta);
    }

    registrarEnRelacion_(data, radicado);

    const carpetaDocs       = obtenerOCrearSubcarpeta(carpetaAliado, 'documentos');
    const carpetaVendedores = obtenerOCrearSubcarpeta(carpetaAliado, 'vendedores');

    const docs = data.documentos || {};

    // Camara de comercio — combinar paginas en 1 PDF
    const paginasCamara = [
      docs.camaraComercio1, docs.camaraComercio2, docs.camaraComercio3, docs.camaraComercio4,
      docs.camaraComercio5, docs.camaraComercio6, docs.camaraComercio7, docs.camaraComercio8,
      docs.camaraComercio9, docs.camaraComercio10
    ].filter(Boolean);
    if (paginasCamara.length > 0) {
      // Si la primera pagina es PDF y solo hay 1 pagina — subir tal cual
      if (paginasCamara.length === 1 && paginasCamara[0].tipo === 'application/pdf') {
        subirArchivo(paginasCamara[0], carpetaDocs, 'camara_comercio');
      } else {
        // Multiples paginas o imagenes — convertir todo a PDF combinado
        generarPDFDesdeImagenes(paginasCamara, carpetaDocs, 'camara_comercio', 'Camara de Comercio - ' + data.nombreComercial);
      }
    }

    // Cedula representante — frontal + trasera en 1 PDF
    if (docs.cedulaFrontal || docs.cedulaTrasera) {
      const imagenesced = [docs.cedulaFrontal, docs.cedulaTrasera].filter(Boolean);
      generarPDFDesdeImagenes(imagenesced, carpetaDocs, 'cedula_representante', 'Cedula Representante Legal - ' + data.nombre);
    }

    // Fotos tienda — fachada + interior + vitrinas en 1 PDF
    const fotosTienda = [docs.fotoFachada, docs.fotoInterior, docs.fotoVitrinas].filter(Boolean);
    if (fotosTienda.length > 0) {
      generarPDFDesdeImagenes(fotosTienda, carpetaDocs, 'fotos_tienda', 'Fotos Tienda - ' + nombreComercial);
    }

    // Video — tal cual
    if (docs.video360 && docs.video360.base64) {
      subirArchivo(docs.video360, carpetaDocs, 'video_360');
    }

    // Vendedores — 1 PDF por vendedor
    const vendedores = data.vendedores || [];
    vendedores.forEach((v, i) => {
      const nombreBase     = 'cedula_vendedor_' + (i + 1);
      const nombreVendedor = ((v.nombres || '') + ' ' + (v.apellidos || '')).trim();

      if (v.cedulaPdf && v.cedulaPdf.base64) {
        // Tiene PDF — subir directo
        subirArchivo(v.cedulaPdf, carpetaVendedores, nombreBase);
      } else {
        // Tiene fotos — combinar frontal + trasera en 1 PDF
        const fotos = [v.cedulaFrontal, v.cedulaTrasera].filter(Boolean);
        if (fotos.length > 0) {
          generarPDFDesdeImagenes(fotos, carpetaVendedores, nombreBase, 'Cedula ' + nombreVendedor);
        }
      }
    });

    const pdfFile = generarPDFConvenio(data, carpetaAliado, radicado);
    const plataformas = normalizarPlataformasSolicitadas_(data.plataformasSolicitadas);
    if (plataformas.indexOf('payjoy') !== -1) {
      generarExcelM3(data, carpetaAliado, radicado);
    }
    const formatoKrediya = plataformas.indexOf('krediya') !== -1
      ? generarFormatoKrediyaTemporal_(data, radicado)
      : null;
    enviarEmailInterno(data, radicado, carpetaAliado.getId(), pdfFile.getId(), esNuevo, formatoKrediya);

    let provision;
    try {
      provision = procesarAltaComercial_(data);
    } catch (provisionError) {
      Logger.log('ERROR aprovisionamiento comercial: operación pendiente para ' + radicado);
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false,
          radicado: radicado,
          documentosCreados: true,
          error: 'El convenio y sus documentos quedaron creados, pero el enlace de la tienda necesita reintento.'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        radicado: radicado,
        carpetaId: carpetaAliado.getId(),
        enlaceRegistro: provision.enlace
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('ERROR doPost: ' + err.toString() + ' | Stack: ' + err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── GENERAR PDF DESDE IMÁGENES/PDFs (v2.5 — vía creditek-pdf-combiner) ──
// Antes: creaba un Google Doc temporal, insertaba imágenes a mano y
// exportaba a PDF (fallaba en silencio si alguna página era un PDF real,
// dejando páginas en blanco). Ahora: delega la combinación al Worker
// creditek-pdf-combiner (pdf-lib), que sí soporta mezcla de fotos y PDFs.
function generarPDFDesdeImagenes(imagenesData, carpeta, nombreBase, titulo) {
  try {
    const archivos = imagenesData
      .filter(function(d) { return d && d.base64; })
      .map(function(d, i) {
        return { nombre: 'archivo_' + i, mimeType: d.tipo || 'image/jpeg', base64: d.base64 };
      });
    if (archivos.length === 0) return null;

    const secreto = PropertiesService.getScriptProperties().getProperty('PDF_COMBINER_SECRET');
    const response = UrlFetchApp.fetch(PDF_COMBINER_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Worker-Secret': secreto },
      payload: JSON.stringify({ titulo: titulo || nombreBase, archivos: archivos }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('Error Worker pdf-combiner (' + nombreBase + '): ' + response.getResponseCode() + ' ' + response.getContentText());
      return null;
    }

    const resultado = JSON.parse(response.getContentText());

    // Eliminar versión anterior (mismo criterio que la función original)
    const existentes = carpeta.getFilesByName(nombreBase + '.pdf');
    while (existentes.hasNext()) existentes.next().setTrashed(true);

    return subirArchivo({ base64: resultado.pdfBase64, tipo: 'application/pdf' }, carpeta, nombreBase);
  } catch (err) {
    Logger.log('Error generarPDFDesdeImagenes ' + nombreBase + ': ' + err.toString());
    return null;
  }
}

function buscarCarpetaPorCedula(carpetaPadre, cedula) {
  const subcarpetas = carpetaPadre.getFolders();
  while (subcarpetas.hasNext()) {
    const carpeta = subcarpetas.next();
    if (carpeta.getName().indexOf(cedula) !== -1) return carpeta;
  }
  return null;
}

function obtenerOCrearSubcarpeta(carpetaPadre, nombre) {
  const existentes = carpetaPadre.getFoldersByName(nombre);
  if (existentes.hasNext()) return existentes.next();
  return carpetaPadre.createFolder(nombre);
}

// ── Vendedores (equipo comercial propio) y tracking de convenios ──────
function leerVendedoresConvenios_() {
  var ss = SpreadsheetApp.openById(SHEET_ID_CONTROL_COMERCIAL);
  var sheet = ss.getSheetByName('Vendedores');
  if (!sheet) return { ok: true, vendedores: [] };
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, vendedores: [] };
  var vendedores = data.slice(1)
    .filter(function(row) { return row[1] === 'SI'; })
    .map(function(row) { return row[0]; });
  return { ok: true, vendedores: vendedores };
}

function registrarEnRelacion_(data, radicado) {
  var ss = SpreadsheetApp.openById(SHEET_ID_CONTROL_COMERCIAL);
  var sheet = ss.getSheetByName('Relación');
  if (!sheet) {
    sheet = ss.insertSheet('Relación');
    sheet.appendRow(['Radicado', 'Fecha', 'Nombre Comercial', 'Cédula Aliado', 'Vendedor']);
    sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#00C4CC');
  }
  sheet.appendRow([radicado, new Date(), data.nombreComercial, data.cedula, data.vendedorCreador]);
}

function subirArchivo(fileData, carpeta, nombreBase) {
  if (!fileData || !fileData.base64) return null;
  try {
    const existentes = carpeta.getFilesByName(nombreBase);
    while (existentes.hasNext()) existentes.next().setTrashed(true);
    const bytes = Utilities.base64Decode(fileData.base64);
    const ext   = extensionDesdeTipo(fileData.tipo, fileData.nombre);
    const blob  = Utilities.newBlob(bytes, fileData.tipo, nombreBase + ext);
    return carpeta.createFile(blob);
  } catch (err) {
    Logger.log('Error subiendo ' + nombreBase + ': ' + err.toString());
    return null;
  }
}

function extensionDesdeTipo(tipo, nombreOriginal) {
  if (tipo === 'application/pdf') return '.pdf';
  if (tipo === 'image/jpeg' || tipo === 'image/jpg') return '.jpg';
  if (tipo === 'image/png') return '.png';
  if (tipo === 'image/webp') return '.webp';
  if (tipo && tipo.startsWith('video/')) return '.' + tipo.split('/')[1];
  if (nombreOriginal && nombreOriginal.includes('.')) return '.' + nombreOriginal.split('.').pop();
  return '';
}

function generarPDFConvenio(data, carpeta, radicado) {
  const doc  = DocumentApp.create('convenio_' + radicado + '_TEMP');
  const body = doc.getBody();

  const estiloTitulo = {
    [DocumentApp.Attribute.BOLD]: true,
    [DocumentApp.Attribute.FONT_SIZE]: 13,
    [DocumentApp.Attribute.HORIZONTAL_ALIGNMENT]: DocumentApp.HorizontalAlignment.CENTER
  };
  const estiloNormal = {
    [DocumentApp.Attribute.BOLD]: false,
    [DocumentApp.Attribute.FONT_SIZE]: 10.5
  };
  const estiloBold = {
    [DocumentApp.Attribute.BOLD]: true,
    [DocumentApp.Attribute.FONT_SIZE]: 10.5
  };

  body.clear();
  body.appendParagraph('CONVENIO DE ALIANZA COMERCIAL').setAttributes(estiloTitulo);
  body.appendParagraph('').setAttributes(estiloNormal);

  const pRadicado = body.appendParagraph('Radicado: ' + radicado);
  pRadicado.setAttributes(estiloBold);
  pRadicado.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);

  body.appendParagraph('Fecha: ' + data.fecha).setAttributes(estiloNormal);
  body.appendParagraph('').setAttributes(estiloNormal);
  body.appendParagraph('Empresa: CREDITEK SAS — NIT ' + NIT_CREDITEK).setAttributes(estiloBold);
  body.appendParagraph('Aliado: ' + data.nombre).setAttributes(estiloNormal);
  body.appendParagraph('C.C.: ' + data.cedula).setAttributes(estiloNormal);
  body.appendParagraph('Nombre comercial: ' + data.nombreComercial).setAttributes(estiloNormal);
  body.appendParagraph('Direccion: ' + data.direccion + ', ' + data.municipio + ', ' + data.departamento).setAttributes(estiloNormal);
  if (data.nit) body.appendParagraph('NIT negocio: ' + data.nit).setAttributes(estiloNormal);
  body.appendParagraph('').setAttributes(estiloNormal);

  body.appendParagraph(
    'Yo, ' + data.nombre + ', identificado con C.C. ' + data.cedula +
    ' como representante legal de ' + data.nombreComercial + ' declaro que:'
  ).setAttributes(estiloNormal);
  body.appendParagraph('').setAttributes(estiloNormal);

  const clausulas = [
    'Se realiza alianza comercial para venta de telefonia en modalidad de credito con CREDITEK SAS por medio de la entidad financiera PayJoy Colombia S.A.S',
    'Autorizo a CREDITEK SAS recibir el pago que realice PayJoy Colombia S.A.S por los equipos que sean vendidos en mi establecimiento comercial con modalidad de credito.',
    'CREDITEK SAS realizara el pago de las comisiones al aliado, de acuerdo con los valores acordados.',
    'Los valores de comision pueden variar de acuerdo con las condiciones del mercado y a las promociones que se otorguen, tales cambios seran informados previamente por CREDITEK SAS al aliado.'
  ];
  clausulas.forEach((c, i) => body.appendParagraph((i + 1) + '. ' + c).setAttributes(estiloNormal));

  body.appendParagraph('').setAttributes(estiloNormal);
  body.appendParagraph('').setAttributes(estiloNormal);
  body.appendParagraph('_______________________________').setAttributes(estiloNormal);
  body.appendParagraph(data.nombre).setAttributes(estiloBold);
  body.appendParagraph('C.C. ' + data.cedula).setAttributes(estiloNormal);

  doc.saveAndClose();

  const docFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = docFile.getAs(MimeType.PDF);
  pdfBlob.setName('convenio_' + radicado + '.pdf');

  const existentes = carpeta.getFilesByName('convenio_' + radicado + '.pdf');
  while (existentes.hasNext()) existentes.next().setTrashed(true);

  const pdfFile = carpeta.createFile(pdfBlob);
  docFile.setTrashed(true);

  return pdfFile;
}

function generarExcelM3(data, carpeta, radicado) {
  const ss = SpreadsheetApp.create('formato_M3_' + radicado);

  // ── ADMIN (formato vertical: label en A, valor en B — confirmado en archivo real PayJoy) ──
  const hojaAdmin = ss.getActiveSheet();
  hojaAdmin.setName('ADMIN');
  hojaAdmin.getRange('A1').setValue('Formato unico para registro de creacion de tienda PayJoy - CREDITEK SAS - NIT: 901259859-0');
  hojaAdmin.getRange('A1:B1').merge();
  hojaAdmin.getRange('A1').setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#FFFFFF');

  const filasAdmin = [
    ['RAZON SOCIAL:', 'CREDITEK S.A.S.'],
    ['NIT:', '901259859-0'],
    ['DIRECCION ADMINISTRATIVA PRINCIPAL', 'CL 3 A No 24-70 ED SANKARA'],
    ['CIUDAD', 'BARRANQUILLA'],
    ['DEPARTAMENTO', 'ATLANTICO'],
    ['NOMBRE COMPLETO DE REPRESENTANTE LEGAL', 'Acevedo Mendez Jennifer Janett'],
    ['EMAIL REPRESENTANTE', 'comercial@crediteksas.com'],
    ['TELEFONO CELULAR DEL REPRESENTANTE', '3005875215']
  ];
  filasAdmin.forEach((fila, i) => {
    hojaAdmin.getRange(2 + i, 1, 1, 2).setValues([fila]);
    hojaAdmin.getRange(2 + i, 1).setFontWeight('bold').setBackground('#1CBAD0').setFontColor('#04342C');
  });
  hojaAdmin.autoResizeColumns(1, 2);

  // ── CREACIÓN DE TIENDAS ──────────────────────────────────────────────
  const hojaTiendas = ss.insertSheet('CREACION DE TIENDAS');
  hojaTiendas.getRange('A1').setValue('Formato unico para registro de creacion de tienda PayJoy - CREDITEK SAS - NIT: 901259859-0');
  hojaTiendas.getRange('A1:J1').merge();
  hojaTiendas.getRange('A1').setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#FFFFFF');

  const headersTiendas = [
    'NOMBRE DE LA TIENDA','NUMERO TOTAL DE VENDEDORES EN TIENDA','DIRECCION',
    'DEPARTAMENTO','MUNICIPIO','NOMBRE COMPLETO RESPONSABLE DE LA TIENDA',
    'CORREO DEL RESPONSABLE DE TIENDA','CELULAR DEL RESPONSABLE DE TIENDA',
    'CEDULA DEL RESPONSABLE DE TIENDA','REPRESENTANTE DE VENTAS PAYJOY'
  ];
  const headerRowTiendas = hojaTiendas.getRange(2, 1, 1, headersTiendas.length);
  headerRowTiendas.setValues([headersTiendas]);
  headerRowTiendas.setFontWeight('bold').setBackground('#1CBAD0').setFontColor('#04342C');

  hojaTiendas.getRange(3, 1, 1, 10).setValues([[
    data.nombreComercial || '',
    (data.vendedores || []).length,
    data.direccion || '',
    data.departamento || '',
    data.municipio || '',
    data.nombre || '',
    data.correo || '',
    data.telefono || '',
    data.cedula || '',
    ''
  ]]);
  hojaTiendas.autoResizeColumns(1, 10);

  // ── CREACIÓN DE USUARIOS (sin cambios de lógica — ahora es la 3ra hoja) ──
  const hojaUsuarios = ss.insertSheet('CREACION DE USUARIOS');
  hojaUsuarios.getRange('A1').setValue('Formato unico para registro de creacion de usuarios PayJoy - CREDITEK SAS - NIT: 901259859-0');
  hojaUsuarios.getRange('A1:H1').merge();
  hojaUsuarios.getRange('A1').setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#FFFFFF');

  const headers = [
    'NOMBRE DE LA TIENDA','NOMBRES DEL VENDEDOR','APELLIDOS DEL VENDEDOR',
    'N DE CEDULA DEL VENDEDOR','CORREO ELECTRONICO','NUMERO CELULAR',
    'USUARIO DE INSTAGRAM','USUARIO DE FACEBOOK'
  ];
  const headerRow = hojaUsuarios.getRange(2, 1, 1, headers.length);
  headerRow.setValues([headers]);
  headerRow.setFontWeight('bold').setBackground('#1CBAD0').setFontColor('#04342C');

  const vendedores = data.vendedores || [];
  vendedores.forEach((v, i) => {
    if (!v.nombres && !v.cedula) return;
    hojaUsuarios.getRange(3 + i, 1, 1, 8).setValues([[
      data.nombreComercial, v.nombres || '', v.apellidos || '', v.cedula || '',
      v.correo || '', v.celular || '', v.instagram || '', v.facebook || ''
    ]]);
  });
  hojaUsuarios.autoResizeColumns(1, 8);

  SpreadsheetApp.flush();

  const ssFile = DriveApp.getFileById(ss.getId());
  const existentes = carpeta.getFilesByName('formato_M3_' + radicado);
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  ssFile.moveTo(carpeta);
}

function normalizarPlataformasSolicitadas_(value) {
  const permitidas = ['payjoy', 'alo_credit', 'addi', 'krediya'];
  const recibidas = Array.isArray(value) ? value : [];
  return recibidas
    .map(function(item) { return String(item || '').trim().toLowerCase(); })
    .filter(function(item, index, all) {
      return permitidas.indexOf(item) !== -1 && all.indexOf(item) === index;
    });
}

function dividirNombre_(nombreCompleto) {
  const partes = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nombres: partes[0] || '', apellidos: '' };
  const corte = Math.ceil(partes.length / 2);
  return { nombres: partes.slice(0, corte).join(' '), apellidos: partes.slice(corte).join(' ') };
}

function exportarSpreadsheetXlsx_(spreadsheetId, nombreArchivo) {
  const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx';
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('No se pudo exportar el formato de Krediya');
  }
  return response.getBlob().setName(nombreArchivo);
}

function generarFormatoKrediyaTemporal_(data, radicado) {
  const ss = SpreadsheetApp.create('TEMP_KREDIYA_' + radicado);
  const tempFile = DriveApp.getFileById(ss.getId());
  try {
    const representante = {
      nombres: data.representanteNombres || dividirNombre_(data.nombre).nombres,
      apellidos: data.representanteApellidos || dividirNombre_(data.nombre).apellidos
    };
    const ejecutivo = dividirNombre_(data.vendedorCreador);
    const cuenta = data.cuentaBancaria || {};
    const contactoTelefono = data.telefonoTienda || data.telefono || '';
    const contactoCorreo = data.correoTienda || data.correo || '';
    const plataformas = normalizarPlataformasSolicitadas_(data.plataformasSolicitadas);

    const aliado = ss.getActiveSheet();
    aliado.setName('ALIADO');
    const aliadoHeaders = [
      'Observación','Nombre del aliado','RUT','Direccion','cod postal','Telefono','Correo electronico',
      'Nombre del representante legal','Apellidos del representante legal','Cedula',
      'Nombre del encargado comercial','Apellidos del encargado comercial','Telefono de encargado comercial',
      'Correo de encargado comercial','Cédula de encargado comercial','Nombre de encargado administrativo',
      'Apellidos de encargado administrativo','Telefono de encargado administrativo','Correo de encargado administrativo',
      'Nombre del banco','Direccion','Cod Postal','Nombre del Beneficiario','Tipo de cuenta','#cuenta',
      'Tipo de canal (Directo o MM)','Permitir a Tienda Manejo de Precios (Si/No)','Clasificación de Riesgo',
      'Estado (Activo/inactivo)','Estado (Activo/inactivo)','OBSERVACIÓN DE LA CREACIÓN'
    ];
    aliado.getRange(1, 1, 1, aliadoHeaders.length).setValues([aliadoHeaders]);
    aliado.getRange(2, 1, 1, aliadoHeaders.length).setValues([[
      'CREAR',data.nombreComercial || '',data.nit || '',data.direccion || '',data.codigoPostal || '',
      contactoTelefono,contactoCorreo,representante.nombres,representante.apellidos,data.cedula || '',
      ejecutivo.nombres,ejecutivo.apellidos,'','','','','','','',cuenta.banco || '','',data.codigoPostal || '',
      cuenta.beneficiario || data.nombre || '',String(cuenta.tipoCuenta || '').toUpperCase(),cuenta.numeroCuenta || '',
      'MULTIMARCA','NO','NARANJA','ACTIVO','ACTIVO','CREACIÓN · ' + radicado + ' · ' + plataformas.join(', ')
    ]]);

    const tienda = ss.insertSheet('TIENDA');
    const tiendaHeaders = [
      'Creación','Aliado','Tienda','Teléfono','Dirección de correo electrónico','Direccion','Código Postal',
      'Nombres Gerente','Apellidos Gerente','Correo Electrónico Gerente','Cedula','Forma de venta (Tienda - Domicilio)',
      'Tipo (fisica - online Fuerza de ventas)','Aliado','Zona / Departamento','Ciudad','Region','Geolocalización',
      'Permitir cobro de cuotas (Si/No)','# Ventas máximas por día','#Ventas máximas por mes',
      'Ponderacion de score de cliente','Castigo tasa de interes','Clasificacion de riesgo','Estado (activo o inactivo)',
      'Tipo de catalogo','Cambiar precio de venta durante la venta por vendedor SI/NO',
      'Cambiar precio por encargado SI/NO','Cambiar precio por gerente SI/NO','ESTADO','OBS CREACIÓN','Departamento 2'
    ];
    tienda.getRange(1, 1, 1, tiendaHeaders.length).setValues([tiendaHeaders]);
    tienda.getRange(2, 1, 1, tiendaHeaders.length).setValues([[
      'CREAR',data.nombreComercial || '',data.nombreComercial || '',contactoTelefono,contactoCorreo,
      data.direccion || '',data.codigoPostal || '',representante.nombres,representante.apellidos,
      data.correo || '',data.cedula || '','En la tienda','Física',data.nombreComercial || '',
      data.departamento || '',data.municipio || '','','','NO',2,25,0,0,'NARANJA','ACTIVO','GENERAL',
      'NO','NO','NO','ACTIVO','CREACIÓN · ' + radicado,data.departamento || ''
    ]]);

    const vendedoresSheet = ss.insertSheet('VENDEDORES');
    const vendedoresHeaders = ['SOLICITUD','Nombre Tienda ','Nombres Usuario','Apellidos Usuarios','Teléfono',
      'Tipo de usuario (Gerente-Vendedor/cajero/vendedor cajero)','Correo Electrónico','Cedula','ESTADO','OBSERVACIÓN DE LA CREACIÓN'];
    vendedoresSheet.getRange(1, 1, 1, vendedoresHeaders.length).setValues([vendedoresHeaders]);
    (data.vendedores || []).filter(function(v) { return v.nombres || v.cedula; }).forEach(function(v, index) {
      vendedoresSheet.getRange(2 + index, 1, 1, vendedoresHeaders.length).setValues([[
        index === 0 ? 'CREAR' : '',data.nombreComercial || '',v.nombres || '',v.apellidos || '',v.celular || '',
        'Vendedor',v.correo || '',v.cedula || '','ACTIVO','CREACIÓN · ' + radicado
      ]]);
    });

    const catalogo = ss.insertSheet('CATALOGO');
    const catalogoHeaders = ['ALIADO','TIENDA','MANEJO DE PRECIOS','TIPO DE CATALOGO','CODIGO DE PRODUCTOS PARA INACTIVAR','OBSERVACIONES'];
    catalogo.getRange(1, 1, 1, catalogoHeaders.length).setValues([catalogoHeaders]);
    catalogo.getRange(2, 1, 1, catalogoHeaders.length).setValues([[
      data.nombreComercial || '',data.nombreComercial || '','No maneja precios','Catalogo General','','CREACIÓN · ' + radicado
    ]]);

    [aliado, tienda, vendedoresSheet, catalogo].forEach(function(sheet) {
      const lastColumn = sheet.getLastColumn();
      if (!lastColumn) return;
      sheet.getRange(1, 1, 1, lastColumn).setFontWeight('bold').setBackground('#0B1E3D').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, lastColumn);
    });
    SpreadsheetApp.flush();
    return exportarSpreadsheetXlsx_(ss.getId(), 'Krediya_' + radicado + '_' + (data.nombreComercial || 'aliado') + '.xlsx');
  } finally {
    tempFile.setTrashed(true);
  }
}

function enviarEmailInterno(data, radicado, carpetaId, pdfId, esNuevo, formatoKrediya) {
  const linkCarpeta = 'https://drive.google.com/drive/folders/' + carpetaId;
  const linkPDF     = 'https://drive.google.com/file/d/' + pdfId + '/view';
  const estado      = esNuevo ? 'NUEVO ALIADO' : 'ACTUALIZACION ALIADO';
  const asunto      = '[' + estado + '] ' + data.nombreComercial + ' — ' + radicado;
  const plataformas = normalizarPlataformasSolicitadas_(data.plataformasSolicitadas);

  const resumenVendedores = (data.vendedores || [])
    .filter(v => v.nombres)
    .map((v, i) => `<tr style="background:${i%2===0?'#fff':'#F4F6F8'}">
      <td style="padding:6px;">${i+1}. ${v.nombres} ${v.apellidos}</td>
      <td style="padding:6px;">${v.cedula}</td>
      <td style="padding:6px;">${v.correo}</td>
      <td style="padding:6px;">${v.celular}</td>
    </tr>`).join('');

  const cuerpo = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0B1E3D;padding:20px;text-align:center;">
        <img src="https://oscarjp88-arch.github.io/consultora/creditek/agentes/logos/creditek_logo_corregido_alta.png" width="120" alt="Creditek">
      </div>
      <div style="padding:24px;background:#fff;">
        <h2 style="color:#0B1E3D;font-size:16px;margin-bottom:4px;">${estado}</h2>
        <p style="font-size:13px;color:#64748B;margin-top:0;">Radicado: <strong>${radicado}</strong></p>
        <p style="font-size:13px;color:#0B1E3D;font-weight:600;">Gestionado por: ${data.vendedorCreador}</p>
        <p style="font-size:13px;color:#0B1E3D;"><strong>Plataformas solicitadas:</strong> ${plataformas.join(', ') || '—'}</p>

        <div style="background:#FFF8E1;border:1.5px solid #F59E0B;border-radius:10px;padding:16px;margin:16px 0;text-align:center;">
          <p style="margin:0 0 12px;font-size:13px;color:#92400E;font-weight:600;">Accion requerida — Solicitar firma al aliado</p>
          <a href="${linkPDF}"
             style="background:#0B1E3D;color:#1CBAD0;padding:12px 24px;border-radius:8px;
                    text-decoration:none;font-weight:700;font-size:14px;display:inline-block;margin-bottom:8px;">
            Abrir PDF y solicitar firma electronica
          </a>
          <p style="margin:8px 0 0;font-size:11px;color:#92400E;">
            Abre el PDF > clic en "Solicitar firma electronica" > ingresa el correo: <strong>${data.correo}</strong>
          </p>
        </div>

        <h3 style="color:#0B1E3D;font-size:13px;margin:20px 0 8px;">Datos del aliado</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px;color:#888;width:40%;">Nombre</td><td style="padding:6px;font-weight:600;">${data.nombre}</td></tr>
          <tr style="background:#F4F6F8;"><td style="padding:6px;color:#888;">Cedula</td><td style="padding:6px;font-weight:600;">${data.cedula}</td></tr>
          <tr><td style="padding:6px;color:#888;">Negocio</td><td style="padding:6px;font-weight:600;">${data.nombreComercial}</td></tr>
          <tr style="background:#F4F6F8;"><td style="padding:6px;color:#888;">NIT</td><td style="padding:6px;">${data.nit || '—'}</td></tr>
          <tr><td style="padding:6px;color:#888;">Ubicacion</td><td style="padding:6px;">${data.municipio}, ${data.departamento}</td></tr>
          <tr style="background:#F4F6F8;"><td style="padding:6px;color:#888;">Direccion</td><td style="padding:6px;">${data.direccion}</td></tr>
          <tr><td style="padding:6px;color:#888;">Telefono</td><td style="padding:6px;">${data.telefono}</td></tr>
          <tr style="background:#F4F6F8;"><td style="padding:6px;color:#888;">Correo aliado</td><td style="padding:6px;font-weight:600;">${data.correo}</td></tr>
          <tr><td style="padding:6px;color:#888;">Fecha camara</td><td style="padding:6px;">${data.fechaCamara || '—'}</td></tr>
          <tr style="background:#F4F6F8;"><td style="padding:6px;color:#888;">No. vendedores</td><td style="padding:6px;">${data.numVendedores}</td></tr>
        </table>

        ${resumenVendedores ? `
        <h3 style="color:#0B1E3D;font-size:13px;margin:20px 0 8px;">Vendedores registrados (Formato M3)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#1CBAD0;">
            <th style="padding:6px;text-align:left;color:#04342C;">Nombre</th>
            <th style="padding:6px;text-align:left;color:#04342C;">Cedula</th>
            <th style="padding:6px;text-align:left;color:#04342C;">Correo</th>
            <th style="padding:6px;text-align:left;color:#04342C;">Celular</th>
          </tr>
          ${resumenVendedores}
        </table>` : ''}

        <div style="margin-top:24px;">
          <a href="${linkCarpeta}"
             style="background:#F4F6F8;color:#0B1E3D;padding:10px 20px;border-radius:8px;
                    text-decoration:none;font-weight:600;font-size:13px;display:inline-block;border:1px solid #E2E8F0;margin-right:8px;">
            Ver carpeta en Drive
          </a>
          <a href="${linkPDF}"
             style="background:#F4F6F8;color:#0B1E3D;padding:10px 20px;border-radius:8px;
                    text-decoration:none;font-weight:600;font-size:13px;display:inline-block;border:1px solid #E2E8F0;">
            Ver PDF del convenio
          </a>
        </div>
      </div>
      <div style="background:#F4F6F8;padding:12px;text-align:center;">
        <p style="font-size:11px;color:#888;margin:0;">Creditek OS — Sistema automatizado de convenios · ${radicado}</p>
      </div>
    </div>`;

  const opcionesCorreo = {
    htmlBody: cuerpo,
    name: 'Creditek OS — Convenios'
  };
  if (formatoKrediya) opcionesCorreo.attachments = [formatoKrediya];
  GmailApp.sendEmail(CORREO_CREDITEK, asunto, '', opcionesCorreo);
}
