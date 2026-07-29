import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const appsScriptPath = new URL('../../creditek/portal/Code.gs', import.meta.url);
const portalPath = new URL('../../creditek/portal/index.html', import.meta.url);

const extractFunction = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No existe ${name}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      opened = true;
    } else if (source[index] === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No fue posible extraer ${name}`);
};

test('todos los pedidos generados usan el prefijo AURA-B2B', async () => {
  const appsScript = await readFile(appsScriptPath, 'utf8');
  const portal = await readFile(portalPath, 'utf8');

  assert.match(portal, /return'AURA-B2B-'/);
  assert.match(appsScript, /return 'AURA-B2B-'/);
  assert.doesNotMatch(`${portal}\n${appsScript}`, /KORA-B2B/);
});

test('el valor total se formatea siempre como moneda colombiana', async () => {
  const source = await readFile(appsScriptPath, 'utf8');
  const context = {};
  vm.runInNewContext(extractFunction(source, 'formatearCOP_'), context);

  assert.equal(context.formatearCOP_(500000), '$500.000');
  assert.equal(context.formatearCOP_(1250000), '$1.250.000');
  assert.equal(context.formatearCOP_(2000000), '$2.000.000');
});

test('la confirmación conserva la estructura y los datos dinámicos aprobados', async () => {
  const source = await readFile(appsScriptPath, 'utf8');
  const context = {};
  vm.runInNewContext(extractFunction(source, 'formatearCOP_'), context);
  vm.runInNewContext(extractFunction(source, 'construirMensajeConfirmacion_'), context);

  assert.equal(
    context.construirMensajeConfirmacion_('Aliado de prueba', 'AURA-B2B-20260729-001', 3, 1250000),
    [
      'Pedido confirmado – AURA B2B',
      '',
      'Hola, Aliado de prueba 👋',
      '',
      'Tu pedido ha sido registrado exitosamente.',
      '',
      '📋 Número de pedido: AURA-B2B-20260729-001',
      '📦 Unidades: 3',
      '💰 Valor total: $1.250.000',
      '',
      'Nuestro equipo lo procesará en las próximas horas. Gracias por confiar en Creditek.',
    ].join('\n'),
  );
});

test('el portal bloquea el doble envío y conserva el identificador al reintentar', async () => {
  const source = await readFile(portalPath, 'utf8');

  assert.match(source, /id="btnConfirmarPedido"/);
  assert.match(source, /if\(pedidoEnEnvio\)return/);
  assert.match(source, /pedidoIdEnCurso\|\|generarNumeroPedidoLocal\(\)/);
  assert.match(source, /btn\.disabled=true/);
  assert.match(source, /pedidoIdEnCurso=''/);
});
