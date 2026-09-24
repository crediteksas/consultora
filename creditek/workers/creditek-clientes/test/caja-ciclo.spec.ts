import { afterEach, expect, it, vi } from 'vitest';
import { ejecutarReportesDiarios, formatearCorteCaja, obtenerCorteOperativo } from '../src/index';
import { paginarReporte, renderizarPaginaReporte } from '../src/reportes-formato';
const env = { PHONE_NUMBER_ID: 'test', WHATSAPP_TOKEN: 'test', SUPABASE_SERVICE_KEY: 'test', REPORTES_FORMATO_ORDENADO: 'true' } as any;
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('corte sin arqueo no informa contado cero ni caja cuadrada', () => {
  const msg = formatearCorteCaja([{ tienda_codigo: 'A', efectivo_esperado: 123, efectivo_contado: null, diferencia: null }], 'día');
  expect(msg).toContain('Sin contar'); expect(msg).not.toContain('CUADRA'); expect(msg).not.toContain('Contado $0');
});
it('muestra el total contado sin sumar tiendas pendientes y conserva un solo informe legible', () => {
  const contadas = Array.from({ length: 7 }, (_, i) => ({
    tienda_codigo: `T${i}`, origen: { nombre: `Tienda ${i}` },
    efectivo_esperado: 100_000 + i, efectivo_contado: 100_000 + i, diferencia: 0,
  }));
  const pendientes = Array.from({ length: 3 }, (_, i) => ({
    tienda_codigo: `P${i}`, origen: { nombre: `Pendiente ${i}` },
    efectivo_esperado: -100_000 - i, efectivo_contado: null, diferencia: null,
  }));
  const mensaje = formatearCorteCaja([...contadas, ...pendientes], 'miércoles, 23 de septiembre de 2026');
  expect(mensaje).toContain('TOTAL DISPONIBLE CONTADO $700.021 (7 arqueadas; pendientes excluidas)');
  expect(mensaje).toContain('CAJAS SIN ARQUEO (3)');
  const paginas = paginarReporte(mensaje);
  expect(paginas).toHaveLength(1);
  expect(paginas[0].parametros).toHaveLength(9);
  expect(renderizarPaginaReporte(paginas[0]).length).toBeLessThanOrEqual(1024);
  for (const tienda of [...contadas, ...pendientes]) {
    expect(renderizarPaginaReporte(paginas[0])).toContain(tienda.origen.nombre);
  }
});
it('mantiene el corte real de diez tiendas en un mensaje sin pegar cajas contadas', () => {
  const arqueadas = [
    ['Celfiao Tolú', 3_082_700], ['Móvil Shopping', 1_132_864],
    ['Celfiao', 2_745_318], ['Creditel Store', 4_306_090],
    ['Sonivox', 651_800], ['Orocel', 804_000], ['Kredisinu', 125_660],
  ].map(([nombre, valor]) => ({ origen: { nombre }, efectivo_contado: valor, efectivo_esperado: valor, diferencia: 0 }));
  const sinArqueo = [
    ['Chinucell', -526_856], ['Creditel Chinú', -1_237_400], ['Creditel Coveñas', 0],
  ].map(([nombre, esperado]) => ({ origen: { nombre }, efectivo_contado: null, efectivo_esperado: esperado, diferencia: null }));
  const mensaje = formatearCorteCaja([...arqueadas, ...sinArqueo], 'miércoles, 23 de septiembre de 2026');
  expect(mensaje).toContain('TOTAL DISPONIBLE CONTADO $12.848.432');
  expect(mensaje.split('\n').at(-1)).toContain('CAJAS SIN ARQUEO (3)');
  const [pagina] = paginarReporte(mensaje);
  expect(pagina.parametros).toHaveLength(9);
  expect(renderizarPaginaReporte(pagina).length).toBeLessThanOrEqual(1024);
  for (const caja of arqueadas) {
    expect(pagina.parametros.some(p => p.startsWith(`${caja.origen.nombre}: contado`))).toBe(true);
  }
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
