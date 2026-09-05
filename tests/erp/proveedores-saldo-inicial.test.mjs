import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../../creditek/erp/proveedores-saldo-inicial.js';

const domain = globalThis.CreditekSaldoInicialProveedor;
const pdf = (contenido = '%PDF-1.4\nQA sin datos reales') => new File([contenido], 'soporte.pdf', {type:'application/pdf'});
const datos = overrides => ({proveedorId:'proveedor-qa', fechaCorte:'2026-09-05', monto:1200, archivo:pdf(), ...overrides});

function fixture(options = {}) {
  const uploads = [], rpcs = [], downloads = [];
  const sb = {
    storage: { from(bucket) { return {
      async upload(path, file, opts) { uploads.push({bucket,path,file,opts}); return options.upload ? options.upload(uploads.length, file) : {data:{path},error:null}; },
      async download(path) { downloads.push({bucket,path}); return options.download ? options.download(path) : {data:uploads[0].file,error:null}; },
    }; } },
    async rpc(name, payload) { rpcs.push({name,payload}); return options.rpc ? options.rpc(rpcs.length,payload) : {data:{ok:true,factura_id:'factura-qa'},error:null}; },
  };
  return {uploads,rpcs,downloads, registro:domain.crearRegistro({sb,idempotencyKey:'idempotencia-qa',timeoutMs:options.timeoutMs ?? 2000})};
}

test('PDF nuevo va a soportes privado y conserva exactamente el monto; opcionales son null', async () => {
  const f = fixture(), estados = [];
  assert.equal((await f.registro.registrar(datos(), x => estados.push(x))).ok, true);
  assert.equal(f.uploads[0].bucket, 'soportes');
  assert.match(f.uploads[0].path, /^proveedores\/saldos-iniciales\/idempotencia-qa\/[a-f0-9]{64}\.pdf$/);
  assert.deepEqual(f.uploads[0].opts, {contentType:'application/pdf',cacheControl:'3600',upsert:false});
  assert.equal(f.rpcs[0].name, 'registrar_saldo_inicial_proveedor');
  assert.equal(f.rpcs[0].payload.p_monto, 1200);
  for (const field of ['p_fecha_vencimiento','p_referencia','p_observacion']) assert.equal(f.rpcs[0].payload[field], null);
  assert.equal(f.rpcs[0].payload.p_soporte_path, f.uploads[0].path);
  assert.equal(estados.length, 2);
});

test('resolver mantiene bucket histórico y usa privado solo para el prefijo nuevo', () => {
  for (const path of ['saldos-iniciales-proveedores/antiguo.jpg','pagos-proveedores/antiguo.png','compras/antiguo.jpg']) {
    assert.deepEqual(domain.resolverSoporte(path), {bucket:'productos-fotos',path});
  }
  const path = 'proveedores/saldos-iniciales/nuevo.pdf';
  assert.deepEqual(domain.resolverSoporte(path), {bucket:'soportes',path});
});

test('archivo faltante, vacío, MIME distinto, formato prohibido o >10 MB no llega a red', async () => {
  const archivos = [null, pdf(''), new File(['qa'], 'soporte.pdf', {type:'text/html'}), new File(['qa'], 'soporte.exe'), {name:'grande.pdf',type:'application/pdf',size:domain.MAX_BYTES+1}];
  for (const archivo of archivos) {
    const f = fixture();
    await assert.rejects(f.registro.registrar(datos({archivo})));
    assert.equal(f.uploads.length+f.rpcs.length, 0);
  }
});

test('validación permite PDF sin MIME, JPEG, PNG y WebP; limita montos y fechas', () => {
  assert.equal(domain.validarArchivo(new File(['qa'],'SOPORTE.PDF')).contentType, 'application/pdf');
  for (const [ext,mime] of [['jpg','image/jpeg'],['png','image/png'],['webp','image/webp']]) {
    assert.equal(domain.validarArchivo(new File(['qa'],`qa.${ext}`,{type:mime})).contentType,mime);
  }
  for (const monto of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>domain.validarDatos(datos({monto})));
  for (const fechaCorte of ['', '2026-02-30', '05/09/2026']) assert.throws(()=>domain.validarDatos(datos({fechaCorte})));
  assert.throws(()=>domain.validarDatos(datos({fechaVencimiento:'2026-09-04'})));
  assert.throws(()=>domain.validarDatos(datos({referencia:'a'.repeat(121)})));
});

test('upload fallido no ejecuta RPC y puede reintentarse', async () => {
  const f = fixture({upload:n=>n===1?{error:{message:'No hay conexión'}}:{error:null}});
  await assert.rejects(f.registro.registrar(datos()), /No se pudo subir el soporte/);
  assert.equal(f.rpcs.length,0);
  await f.registro.registrar(datos());
  assert.equal(f.uploads.length,2);
  assert.equal(f.uploads[0].path,f.uploads[1].path);
  assert.equal(f.rpcs.length,1);
});

test('RPC fallido reusa upload confirmado y la misma operación idempotente', async () => {
  const f = fixture({rpc:n=>n===1?{error:{message:'Fallo de red'}}:{data:{ok:true,reutilizado:true}}});
  await assert.rejects(f.registro.registrar(datos()), /Fallo de red/);
  assert.equal((await f.registro.registrar(datos())).reutilizado,true);
  assert.equal(f.uploads.length,1);
  assert.equal(f.rpcs.length,2);
  assert.deepEqual(f.rpcs[0],f.rpcs[1]);
});

test('doble envío comparte una única promesa y una sola llamada al servidor', async () => {
  const f = fixture();
  const primero = f.registro.registrar(datos()), segundo = f.registro.registrar(datos());
  assert.equal(primero,segundo);
  await Promise.all([primero,segundo]);
  assert.equal(f.uploads.length,1);
  assert.equal(f.rpcs.length,1);
});

test('respuesta upload perdida: verifica bytes del objeto duplicado sin sobrescribir', async () => {
  const f = fixture({upload:()=>({error:{statusCode:'409',code:'Duplicate',message:'Already exists'}})});
  await f.registro.registrar(datos());
  assert.equal(f.downloads.length,1);
  assert.equal(f.downloads[0].bucket,'soportes');
  assert.equal(f.rpcs.length,1);
  assert.equal(f.uploads[0].opts.upsert,false);
});

test('objeto duplicado distinto o sin permiso de lectura no se acepta como soporte', async () => {
  for (const download of [()=>({data:pdf('otro contenido')}),()=>({error:{message:'denegado'}})]) {
    const f = fixture({upload:()=>({error:{message:'Asset already exists'}}),download});
    await assert.rejects(f.registro.registrar(datos()), /No se pudo verificar/);
    assert.equal(f.rpcs.length,0);
  }
});

test('timeout RPC recupera controles mediante rechazo y reintenta con misma idempotencia', async () => {
  const f = fixture({timeoutMs:20,rpc:n=>n===1?new Promise(()=>{}):{data:{ok:true,reutilizado:true}}});
  await assert.rejects(f.registro.registrar(datos()), /aún no confirmó/);
  await f.registro.registrar(datos());
  assert.equal(f.uploads.length,1);
  assert.deepEqual(f.rpcs[0],f.rpcs[1]);
});

test('timeout upload no genera saldo y permite retry', async () => {
  const f = fixture({timeoutMs:20,upload:n=>n===1?new Promise(()=>{}):{error:null}});
  await assert.rejects(f.registro.registrar(datos()), /no respondió a tiempo/);
  assert.equal(f.rpcs.length,0);
  await f.registro.registrar(datos());
  assert.equal(f.rpcs.length,1);
});

test('rechazo SQL de un reintento no borra incertidumbre de un RPC anterior', async () => {
  const f = fixture({timeoutMs:20,rpc:n=>n===1?new Promise(()=>{}):n===2?{error:{code:'57014',message:'cancelada'}}:{data:{ok:true,reutilizado:true}}});
  await assert.rejects(f.registro.registrar(datos()), /aún no confirmó/);
  await assert.rejects(f.registro.registrar(datos()), /cancelada/);
  for (const cambio of [{fechaCorte:'2026-09-06'},{referencia:'otra'},{archivo:pdf('otro soporte')}]) {
    await assert.rejects(f.registro.registrar(datos(cambio)), /mismos datos y soporte/);
  }
  assert.equal(f.rpcs.length,2);
  assert.equal((await f.registro.registrar(datos())).reutilizado,true);
  assert.deepEqual(f.rpcs[0],f.rpcs[2]);
});

test('no permite cambiar monto, fecha, referencia o documento después de respuesta RPC incierta', async () => {
  const f = fixture({rpc:()=>({error:{message:'Respuesta perdida'}})});
  await assert.rejects(f.registro.registrar(datos()));
  for (const cambio of [{monto:2000},{fechaCorte:'2026-09-06'},{referencia:'otra'},{archivo:pdf('distinto')}]) {
    await assert.rejects(f.registro.registrar(datos(cambio)), /mismos datos y soporte/);
  }
  assert.equal(f.uploads.length,1);
  assert.equal(f.rpcs.length,1);
});

test('rechazo SQL explícito permite corregir campos sin repetir soporte', async () => {
  const f = fixture({rpc:n=>n===1?{error:{code:'P0001',message:'Revisa fecha'}}:{data:{ok:true}}});
  await assert.rejects(f.registro.registrar(datos()));
  await f.registro.registrar(datos({fechaCorte:'2026-09-06'}));
  assert.equal(f.uploads.length,1);
  assert.equal(f.rpcs[1].payload.p_fecha_corte,'2026-09-06');
});

test('no inventa éxito sin confirmación y no repite un registro ya confirmado', async () => {
  const fallido = fixture({rpc:()=>({data:{ok:false}})});
  await assert.rejects(fallido.registro.registrar(datos()), /no confirmó/);
  const exitoso = fixture();
  await exitoso.registro.registrar(datos());
  await exitoso.registro.registrar(datos());
  assert.equal(exitoso.rpcs.length,1);
});

test('formulario usa flujo privado, error inline persistente y capas oficiales KORA', async () => {
  const html = await readFile(new URL('../../creditek/erp/proveedores.html',import.meta.url),'utf8');
  assert.match(html,/proveedores-saldo-inicial\.js\?v=1\.0\.0/);
  assert.match(html,/registroSaldoInicial\.registrar\(datos/);
  assert.match(html,/id="saldo-inicial-estado"[^>]*role="status"/);
  assert.match(html,/#modal-saldo-inicial\s*\{[^}]*--ctk-z-modal, 700/);
  assert.match(html,/#toast\s*\{[^}]*--ctk-z-toast, 900/);
  assert.match(html,/if \(saldoInicialEnCurso\) return/);
  assert.match(html,/resolverSoporte\(path\)/);
  const submit = html.slice(html.indexOf('async function registrarSaldoInicial'), html.indexOf('// FORMULARIO —'));
  assert.doesNotMatch(submit,/\.storage\./);
});
