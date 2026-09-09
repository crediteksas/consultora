import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('creditek-clientes baseline', () => {
  it('routes internal provisioning without enabling browser access', async () => {
    const response = await exports.default.fetch(new Request('https://worker.test/api/interno/aliados/aprovisionar', { method: 'POST', headers: { Origin: 'https://registro.crediteksas.com' } }));
    expect(response.status).toBe(403);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });
  it('keeps unknown routes closed', async () => {
    const response = await exports.default.fetch(
      new Request('https://worker.test/no-existe'),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Ruta no encontrada',
    });
  });
});
