import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/remisiones.html', import.meta.url),
  'utf8',
);

test('remisiones conserva shell KORA y presentación detallada de fotos', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="producto-foto\.js"><\/script>/);
  assert.match(html, /<script src="\/config\/kora-environment\.generated\.js"><\/script>/);
  assert.match(html, /kora-access-control\.js/);
  assert.match(html, /class="foto-recepcion"/);
  assert.match(html, /class="foto-recepcion-ayuda"/);
  assert.match(html, /capture="environment"/);
  assert.match(html, /JPG, PNG o WEBP\. Máximo 5 MB\./);
});

test('recepción usa foto canónica y la RPC específica antes de confirmar', () => {
  const fotoPath = html.indexOf('const path = `canonicas/${it.producto_id}`');
  const fotoRpc = html.indexOf("rpc('registrar_foto_producto_recepcion'");
  const confirmarRpc = html.indexOf("rpc('confirmar_recepcion_remision'");
  const recibirInicio = html.indexOf('async function confirmarRecepcion()');
  const recibirFin = html.indexOf('// ─── Escáner', recibirInicio);
  const confirmarRecepcion = html.slice(recibirInicio, recibirFin);

  assert.ok(fotoPath >= 0, 'debe construir la ruta canónica');
  assert.ok(fotoRpc > fotoPath, 'debe registrar la foto después de subirla');
  assert.ok(confirmarRpc > fotoRpc, 'debe confirmar la recepción después de asociar fotos');
  assert.match(confirmarRecepcion, /productoFoto\.validarArchivo\(archivo\)/);
  assert.doesNotMatch(confirmarRecepcion, /productoFoto\.subirFotoSegura/);
});

test('precio vacío o cero bloquea guardado y recepción antes de escribir', () => {
  const guardarInicio = html.indexOf('async function guardarRemision()');
  const insertarItems = html.indexOf("from('remision_items')", guardarInicio);
  const guardarPrecio = html.indexOf('!Number.isFinite(precio_remision) || precio_remision <= 0', guardarInicio);

  const recibirInicio = html.indexOf('async function confirmarRecepcion()');
  const confirmarRpc = html.indexOf("rpc('confirmar_recepcion_remision'", recibirInicio);
  const recibirPrecio = html.indexOf('!Number.isFinite(precioRemision) || precioRemision <= 0', recibirInicio);

  assert.ok(guardarPrecio > guardarInicio && guardarPrecio < insertarItems);
  assert.ok(recibirPrecio > recibirInicio && recibirPrecio < confirmarRpc);
});
