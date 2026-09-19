import { describe, expect, it } from 'vitest';
import { cuerpoPlantillaReporte, paginarReporte, renderizarPaginaReporte } from '../src/reportes-formato';

describe('informes WhatsApp separados por tienda', () => {
  it('mantiene una separación real entre tiendas fuera de las variables', () => {
    const [p] = paginarReporte('VENTAS — 11 septiembre\n\n• Celfiao: 9 ventas — $2.847.000\n• Sonivox: 1 venta — $246.500\n\nTotal: $3.093.500');
    expect(p.plantilla).toBe('reporte_cierre_ordenado_3_v2');
    expect(renderizarPaginaReporte(p)).toContain('Celfiao: 9 ventas — $2.847.000\n\n• Sonivox: 1 venta — $246.500');
    expect(p.parametros.every(p => !/[\r\n\t]/.test(p))).toBe(true);
  });
  it('conserva todas las tiendas y genera exactamente un mensaje', () => {
    const filas = Array.from({ length: 12 }, (_, i) => `Tienda ${i}: $${i + 1}.000`);
    const paginas = paginarReporte(['GASTOS — 11 septiembre', ...filas, 'Total del día: $703.000'].join('\n'));
    expect(paginas).toHaveLength(1);
    const renderizado = renderizarPaginaReporte(paginas[0]);
    for (const fila of filas) expect(renderizado).toContain(fila);
    expect(renderizado).toContain('Total del día: $703.000');
    expect(renderizado).not.toContain('Parte ');
    expect(renderizado.length).toBeLessThanOrEqual(1024);
  });
  it('rechaza un informe imposible de enviar completo en un solo mensaje', () => {
    const largo = 'concepto ' .repeat(220).trim();
    expect(() => paginarReporte(`GASTOS\n${largo}\nTotal: $1.000`))
      .toThrow('report_too_long_for_single_message');
  });
  it('permite informes sin operaciones sin inventar tiendas', () => {
    const [p] = paginarReporte('CAJA\nNinguna caja cerrada aún.\nTotal efectivo: $0');
    expect(p.parametros).toEqual(['CAJA', 'Ninguna caja cerrada aún.', 'Total efectivo: $0']);
  });
  it('define variantes con variables consecutivas y sin filas de relleno', () => {
    for (let n = 1; n <= 8; n++) {
      expect([...cuerpoPlantillaReporte(n).matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])))
        .toEqual(Array.from({ length: n + 1 }, (_, i) => i + 1));
    }
    expect(() => cuerpoPlantillaReporte(0)).toThrow();
    expect(() => cuerpoPlantillaReporte(9)).toThrow();
  });
});
