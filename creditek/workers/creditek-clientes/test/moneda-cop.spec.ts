import { describe, expect, it } from 'vitest';
import { pesosDesdeCentavos, pesosReporte } from '../src/moneda-cop';
import { prepararReporteDeudaCompacto, renderizarReporteDeuda } from '../src/reporte-deuda-compacto';
import { formatearConfirmacionesDeuda, type CorteDeuda } from '../src/reporte-deuda';

describe('moneda COP de los informes de WhatsApp', () => {
  it.each([
    [0, '$0'], [1234, '$1.234'], [1234.49, '$1.234'], [1234.50, '$1.235'],
    [1234.87, '$1.235'], [-1234.49, '$-1.234'], [-1234.50, '$-1.235'],
    [0.10, 'entre $0 y $1'], [-0.10, 'entre -$1 y $0'],
  ])('presenta %s sin centavos y conserva el signo', (valor, esperado) => {
    expect(pesosReporte(valor)).toBe(esperado);
    expect(pesosDesdeCentavos(Math.round(valor * 100))).toBe(esperado);
  });
  it('rechaza importes inválidos; el legado admite cálculos con precisión flotante', () => {
    for (const n of [NaN, Infinity]) expect(() => pesosReporte(n)).toThrow();
    for (const n of [0.1, Number.MAX_SAFE_INTEGER + 1]) expect(() => pesosDesdeCentavos(n)).toThrow();
    expect(pesosReporte(1234.000000119)).toBe('$1.234');
    expect(pesosReporte(100000000.00000012)).toBe('$100.000.000');
    expect(pesosReporte(0.001)).toBe('entre $0 y $1');
    expect(pesosReporte(Number.MAX_SAFE_INTEGER)).toBe('$9.007.199.254.740.991');
    expect(pesosReporte(-0)).toBe('$0');
  });
  it('aplica el mismo formato a ambos informes sin modificar saldos ni duplicar tiendas', () => {
    const datos: CorteDeuda = { fecha: '2026-11-20', corte: '2026-11-20T20:00:00Z', diarias: [
      { usuario_id: 'ficticio-a', administrador: 'Prueba A', tienda_codigo: 'F-A', tienda: 'Prueba A', confirmacion: { saldo_sistema: 1234.87, saldo_declarado: 1234.87, diferencia: 0, confirmado_at: '2026-11-20T14:00:00Z', revisado_at: null } },
      { usuario_id: 'ficticio-b', administrador: 'Prueba B', tienda_codigo: 'F-B', tienda: 'Prueba B', confirmacion: null },
    ] };
    const copia = structuredClone(datos);
    for (const texto of [renderizarReporteDeuda(prepararReporteDeudaCompacto(datos)), formatearConfirmacionesDeuda(datos)]) {
      expect(texto).toContain('$1.235'); expect(texto).toContain('PENDIENTE');
      expect(texto).not.toMatch(/\$-?[\d.]+,\d/);
    }
    expect(datos).toEqual(copia);
    datos.diarias.push({ ...datos.diarias[0], usuario_id: 'ficticio-c', administrador: 'Prueba C', confirmacion: { ...datos.diarias[0].confirmacion!, saldo_declarado: 1234.86 } });
    const texto = renderizarReporteDeuda(prepararReporteDeudaCompacto(datos));
    expect(texto).toContain('Saldos distintos: por conciliar');
    expect(texto).toContain('TOTAL PENDIENTE');
  });
});
