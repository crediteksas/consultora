import { afterEach, describe, expect, it, vi } from 'vitest';
import { enviarReporteATodos } from '../src/index';

afterEach(() => vi.restoreAllMocks());
const env = { PHONE_NUMBER_ID: 'test-phone', WHATSAPP_TOKEN: 'test-token', SUPABASE_SERVICE_KEY: 'test-key', REPORTES_FORMATO_ORDENADO: 'true' } as any;
const mensaje = ['VENTAS — fecha de prueba', ...Array.from({ length: 17 }, (_, i) => `Tienda ${i}: $100`)].join('\n');

function simular(fallaEn = -1) {
  const enviados: any[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).includes('graph.facebook.com')) {
      enviados.push(JSON.parse(String(init?.body)));
      if (enviados.length === fallaEn) return new Response('{}', { status: 400 });
      return Response.json({ messages: [{ id: `wamid.test-${enviados.length}` }] });
    }
    return new Response(null, { status: 204 });
  });
  return enviados;
}

describe('entrega del reporte ordenado', () => {
  it('confirma cada página para cada destinatario y no la repite', async () => {
    const enviados = simular();
    const resultados: any[] = [];
    await enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', mensaje, resultados, env);
    expect(enviados).toHaveLength(6);
    expect(resultados).toHaveLength(6);
    expect(new Set(resultados.map(r => `${r.plantilla}:${r.destinatario}`)).size).toBe(6);
    await enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', mensaje, resultados, env);
    expect(enviados).toHaveLength(6);
  });
  it('retoma el contenido original después de un fallo parcial', async () => {
    const enviados = simular(2);
    const resultados: any[] = [];
    await expect(enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', mensaje, resultados, env)).rejects.toThrow('meta_template_rejected');
    expect(resultados).toHaveLength(1);
    await enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', 'VENTAS\nTienda nueva: $999', resultados, env);
    expect(enviados).toHaveLength(7);
    expect(JSON.stringify(enviados)).not.toContain('Tienda nueva');
    expect(resultados).toHaveLength(6);
  });
  it('no vuelve a enviar reportes confirmados con el formato anterior', async () => {
    const enviados = simular();
    const resultados = ['oscar', 'mayte'].map(destinatario => ({ plantilla: 'reporte_ventas_diario', destinatario, meta_message_id: 'old', confirmado_at: 'old' }));
    await enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', mensaje, resultados, env);
    expect(enviados).toHaveLength(0);
  });
  it('conserva el envío anterior mientras Meta revisa las nuevas plantillas', async () => {
    const enviados = simular();
    await enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', 'VENTAS\nTienda: $100', [], { ...env, REPORTES_FORMATO_ORDENADO: undefined });
    expect(enviados).toHaveLength(2);
    expect(enviados[0].template.name).toBe('reporte_ventas_diario');
    expect(enviados[0].template.components[0].parameters).toEqual([{ type: 'text', text: 'VENTAS · Tienda: $100' }]);
  });
  it('no confunde gastos con ventas aunque usen el mismo tamaño de plantilla', async () => {
    const enviados = simular();
    const resultados: any[] = [];
    await enviarReporteATodos('2026-09-11', 'reporte_ventas_diario', 'VENTAS\nTienda: $100', resultados, env);
    await enviarReporteATodos('2026-09-11', 'reporte_gastos_diario', 'GASTOS\nTienda: $20', resultados, env);
    expect(enviados).toHaveLength(4);
  });
});
