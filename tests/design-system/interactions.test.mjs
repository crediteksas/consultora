import assert from 'node:assert/strict';
import test from 'node:test';

const interactionsUrl = new URL(
  '../../design-system/components/interactions.mjs',
  import.meta.url,
);

test('navega tabs con flechas y respeta los extremos', async () => {
  const { getNextTabIndex } = await import(interactionsUrl);
  assert.equal(getNextTabIndex(0, 4, 'ArrowRight'), 1);
  assert.equal(getNextTabIndex(3, 4, 'ArrowRight'), 0);
  assert.equal(getNextTabIndex(0, 4, 'ArrowLeft'), 3);
  assert.equal(getNextTabIndex(2, 4, 'Home'), 0);
  assert.equal(getNextTabIndex(2, 4, 'End'), 3);
});

test('mantiene la pestaña actual para teclas no relacionadas', async () => {
  const { getNextTabIndex } = await import(interactionsUrl);
  assert.equal(getNextTabIndex(2, 4, 'Enter'), 2);
  assert.equal(getNextTabIndex(0, 0, 'ArrowRight'), 0);
});

test('marca botones como loading sin perder su estado previo', async () => {
  const { setButtonLoading } = await import(interactionsUrl);
  const attributes = new Map();
  const button = {
    disabled: false,
    getAttribute: name => attributes.get(name) ?? null,
    hasAttribute: name => attributes.has(name),
    removeAttribute: name => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, String(value)),
  };

  setButtonLoading(button, true);
  assert.equal(button.disabled, true);
  assert.equal(attributes.get('aria-busy'), 'true');

  setButtonLoading(button, false);
  assert.equal(button.disabled, false);
  assert.equal(attributes.has('aria-busy'), false);
});
