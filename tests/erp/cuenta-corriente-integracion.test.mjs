import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../../creditek/erp/cuenta-corriente.html', import.meta.url),
  'utf8',
);

test('cuenta corriente integra el dominio anterior con el shell KORA', () => {
  assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
  assert.match(html, /<script src="cuenta-corriente-domain\.js"><\/script>/);
  assert.match(html, /<script src="kora-access-control\.js\?v=2\.0\.15"><\/script>/);
  assert.match(html, /cuentaDomain\.calcularResumenPorTienda/);
  assert.match(html, /cuentaDomain\.prepararHistorial/);
  assert.match(html, /cuentaDomain\.estadoAbono/);
});

test('conserva los eventos del historial, instrucciones y comprobantes', () => {
  for (const id of [
    'historialDias',
    'btnNuevaInstruccion',
    'btnCancelarInstruccion',
    'btnGuardarInstruccion',
    'instruccionTipo',
    'instruccionTienda',
    'instruccionFecha',
    'btnCancelarComprobante',
    'comprobanteFoto',
    'btnEnviarComprobante',
  ]) {
    assert.match(html, new RegExp(`getElementById\\('${id}'\\)\\.addEventListener`));
  }
});

test('el abono directo solo se muestra a central y conserva estado y destino', () => {
  assert.match(html, /btnAbrirAbono'\)\.style\.display = esCentral\(\) \? 'inline-block' : 'none'/);
  assert.match(html, /const estadoHtml = estado === 'verificado'/);
  assert.match(html, /\$\{escapeHtml\(m\.concepto\)\}\$\{estadoHtml\}/);
  assert.match(html, /escapeHtml\(m\.destino \|\| '—'\)/);
  assert.doesNotMatch(html, /class="link-chico" data-cc=/);
  assert.doesNotMatch(html, /\$\{estadoHtml\}[\s\S]{0,220}Marcar verificado/);
});

test('registra mediante la RPC atómica, cierra con KORA y usa mensaje neutral', () => {
  assert.match(html, /sb\.rpc\('registrar_abono_cuenta_corriente'/);
  assert.doesNotMatch(html, /sb\.rpc\('registrar_abono_pendiente'/);
  for (const campo of [
    'p_fecha',
    'p_tipo_movimiento',
    'p_tercero',
    'p_concepto',
    'p_monto',
    'p_fuente_fondos',
    'p_observacion',
    'p_soporte_path',
    'p_idempotency_key',
  ]) assert.match(html, new RegExp(`${campo}:`));
  assert.match(html, /cerrarModal\('modalAbono'\)/);
  assert.match(html, /Abono de \$\{fmtCOP\(monto\)\} registrado correctamente\./);
  assert.doesNotMatch(html, /Queda pendiente de verificación y todavía no afecta el saldo/);
});
