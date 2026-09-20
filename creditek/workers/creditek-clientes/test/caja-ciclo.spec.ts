import { afterEach, expect, it, vi } from 'vitest';
import { ejecutarReportesDiarios, formatearCorteCaja, obtenerCorteOperativo } from '../src/index';
import { paginarReporte, renderizarPaginaReporte } from '../src/reportes-formato';
const env = { PHONE_NUMBER_ID: 'test', WHATSAPP_TOKEN: 'test', SUPABASE_SERVICE_KEY: 'test', REPORTES_FORMATO_ORDENADO: 'true' } as any;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('corte sin arqueo no informa contado cero ni caja cuadrada', () => {
  const msg = formatearCorteCaja([{ tienda_codigo: 'A', efectivo_esperado: 123, efectivo_contado: null, diferencia: null }], 'día');
  expect(msg).toContain('Sin contar'); expect(msg).not.toContain('CUADRA'); expect(msg).not.toContain('Contado $0');
});
it('valida la forma de la respuesta JSON del RPC', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'not_an_array' }));
  await expect(obtenerCorteOperativo('2026-09-20', env)).rejects.toThrow('invalid_response');
});
it('mantiene todas las tiendas aunque el informe necesite más de un mensaje', () => {
  const filas = Array.from({ length: 20 }, (_, i) => `Tienda ${i} · esperado $1.234.567 · Sin contar · revisión del efectivo pendiente`);
  const paginas = paginarReporte(['CORTE', ...filas].join('\n'));
  expect(paginas.length).toBeGreaterThan(1);
  const mensajes = paginas.map(renderizarPaginaReporte);
  expect(mensajes.every(m => m.length <= 1024)).toBe(true);
  for (const fila of filas) expect(mensajes.join('\n')).toContain(fila);
});
it('un fallo de gastos conserva ventas y caja enviadas sin cierres físicos', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-20T20:00:00Z'));
  const mensajes: string[] = []; const estados: any[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes('graph.facebook.com')) { mensajes.push(String(init?.body)); return Response.json({ messages: [{ id: `test-${mensajes.length}` }] }); }
    if (init?.method === 'PATCH') { estados.push(JSON.parse(String(init.body))); return new Response(null, { status: 204 }); }
    if (u.includes('/rpc/generar_cortes_caja')) return Response.json([{ tienda_codigo: 'A', efectivo_esperado: 100, efectivo_contado: null }]);
    if (u.includes('/reportes_diarios_enviados') && init?.method === 'POST') return Response.json([{ resultados: [] }], { status: 201 });
    if (u.includes('/origenes')) return Response.json([{ codigo: 'A', nombre: 'Tienda A' }]);
    if (u.includes('/ventas?')) return Response.json([{ tienda_codigo: 'A', total: 100 }]);
    if (u.includes('/gastos?')) return new Response('test_failure', { status: 503 });
    return Response.json([]);
  });
  await expect(ejecutarReportesDiarios(env)).rejects.toThrow();
  expect(mensajes).toHaveLength(4);
  expect(mensajes.join(' ')).toContain('VENTAS'); expect(mensajes.join(' ')).toContain('Sin contar');
  expect(estados.at(-1).status).toBe('error');
  expect(estados.at(-1).resultados).toHaveLength(4);
});
