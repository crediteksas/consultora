import { describe, expect, it } from 'vitest';
import { cuerpoPlantillaDeuda, prepararReporteDeudaCompacto, renderizarReporteDeuda } from '../src/reporte-deuda-compacto';
import type { CorteDeuda } from '../src/reporte-deuda';

const corte = (): CorteDeuda => ({ fecha: '2026-10-19', corte: '2026-10-19T20:00:00Z', diarias:
  Array.from({ length: 9 }, (_, i) => ({
    usuario_id: `usuario-ficticio-${i}`, administrador: `Administradora Prueba ${i + 1}`, tienda_codigo: `PRUEBA-${i}`,
    tienda: `Tienda prueba ${i + 1}`, confirmacion: {
      saldo_sistema: 1000.10, saldo_declarado: 1000.10, diferencia: 0,
      confirmado_at: '2026-10-19T14:15:00Z', revisado_at: null,
    },
  })),
});

describe('informe compacto de deuda en un único mensaje', () => {
  it('conserva nueve tiendas, nombres completos, saldos, horas y total exacto sin agrupar filas', () => {
    const datos = corte(), copia = structuredClone(datos), pagina = prepararReporteDeudaCompacto(datos);
    const texto = renderizarReporteDeuda(pagina);
    expect(pagina.plantilla).toBe('reporte_deuda_compacto_9_v1');
    expect(pagina.parametros).toHaveLength(12);
    expect(texto.match(/^• /gm)).toHaveLength(9);
    for (let i = 1; i <= 9; i++) expect(texto).toContain(`• Tienda prueba ${i} · Administradora Prueba ${i}: $1.000,10 (09:15)`);
    expect(texto).toContain('9 confirmadas sin diferencia · 0 con diferencia · 0 pendientes');
    expect(texto).toContain('TOTAL (9 tiendas): $9.000,90');
    expect(texto).toContain('19/10/2026 · Corte 3:00 p. m. Colombia');
    expect(texto.length).toBeLessThanOrEqual(1024);
    expect(texto).not.toMatch(/Parte |Creditek informa el cierre operativo|Este informe es para control/);
    expect(pagina.parametros.every(p => !/[\r\n\t]/.test(p))).toBe(true);
    expect(datos).toEqual(copia);
  });
  it('preserva las diferencias, su revisión y los pendientes, sin inventar saldos cero', () => {
    const datos = corte(); datos.diarias = datos.diarias.slice(0, 3);
    datos.diarias[1].confirmacion = null;
    Object.assign(datos.diarias[2].confirmacion!, { saldo_sistema: 1000, saldo_declarado: 999.90, diferencia: -0.10 });
    const texto = renderizarReporteDeuda(prepararReporteDeudaCompacto(datos));
    expect(texto).toContain('1 confirmadas sin diferencia · 1 con diferencia · 1 pendientes');
    expect(texto).toContain('Administradora Prueba 2: PENDIENTE');
    expect(texto).toContain('DIFERENCIA $-0,10 · KORA $1.000,00 · Por revisar');
    expect(texto).toContain('TOTAL PARCIAL (2/3 tiendas): $2.000,00');
    datos.diarias[2].confirmacion!.revisado_at = '2026-10-19T16:00:00Z';
    expect(renderizarReporteDeuda(prepararReporteDeudaCompacto(datos))).toContain('· Revisada');
  });
  it('dos administradores de la misma tienda no duplican su deuda y siguen visibles en una fila', () => {
    const datos = corte(); datos.diarias = datos.diarias.slice(0, 2);
    datos.diarias[1].tienda_codigo = datos.diarias[0].tienda_codigo;
    const texto = renderizarReporteDeuda(prepararReporteDeudaCompacto(datos));
    expect(texto.match(/^• /gm)).toHaveLength(1);
    expect(texto).toContain('Administradora Prueba 1'); expect(texto).toContain('Administradora Prueba 2');
    expect(texto).toContain('TOTAL (1 tienda): $1.000,10');
    datos.diarias[1].confirmacion!.saldo_declarado = 1001;
    expect(renderizarReporteDeuda(prepararReporteDeudaCompacto(datos))).toContain('Saldos distintos: por conciliar');
    expect(renderizarReporteDeuda(prepararReporteDeudaCompacto(datos))).toContain('TOTAL PENDIENTE');
  });
  it('conserva signo y centavos; no presenta un cero como total si nadie confirmó', () => {
    const datos = corte(); datos.diarias = datos.diarias.slice(0, 1);
    datos.diarias[0].confirmacion!.saldo_declarado = -1234.56;
    expect(renderizarReporteDeuda(prepararReporteDeudaCompacto(datos))).toContain('TOTAL (1 tienda): $-1.234,56');
    datos.diarias[0].confirmacion = null;
    const texto = renderizarReporteDeuda(prepararReporteDeudaCompacto(datos));
    expect(texto).toContain('TOTAL PENDIENTE: sin saldos confirmados'); expect(texto).not.toContain('$0,00');
    datos.diarias = [];
    expect(renderizarReporteDeuda(prepararReporteDeudaCompacto(datos))).toContain('Sin administradores activos');
  });
  it('rechaza importes inválidos y exceso de longitud sin truncar ni generar partes', () => {
    const datos = corte(); datos.diarias[0].confirmacion!.saldo_declarado = Number.NaN;
    expect(() => prepararReporteDeudaCompacto(datos)).toThrow('deuda_importe_invalido');
    datos.diarias[0].confirmacion!.saldo_declarado = 0.001;
    expect(() => prepararReporteDeudaCompacto(datos)).toThrow('deuda_importe_invalido');
    datos.diarias[0].confirmacion!.saldo_declarado = 1000;
    datos.diarias[0].administrador = 'Nombre ficticio '.repeat(100);
    expect(() => prepararReporteDeudaCompacto(datos)).toThrow('deuda_reporte_compacto_supera_1024');
  });
  it('la plantilla tiene variables consecutivas y saltos fijos, sin tiendas de relleno', () => {
    for (const n of [1, 3, 9, 12, 20]) {
      expect([...cuerpoPlantillaDeuda(n).matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])))
        .toEqual(Array.from({ length: n + 3 }, (_, i) => i + 1));
      expect(cuerpoPlantillaDeuda(n).match(/^• /gm)).toHaveLength(n);
    }
    expect(() => cuerpoPlantillaDeuda(0)).toThrow(); expect(() => cuerpoPlantillaDeuda(21)).toThrow();
  });
});
