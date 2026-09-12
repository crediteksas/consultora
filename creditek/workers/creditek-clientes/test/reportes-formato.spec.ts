import { describe, expect, it } from 'vitest';
import { cuerpoPlantillaReporte, paginarReporte, renderizarPaginaReporte } from '../src/reportes-formato';

describe('informes WhatsApp separados por tienda', () => {
  it('mantiene una separación real entre tiendas fuera de las variables', () => {
    const [p] = paginarReporte('VENTAS — 11 septiembre\n\n• Celfiao: 9 ventas — $2.847.000\n• Sonivox: 1 venta — $246.500\n\nTotal: $3.093.500');
    expect(p.plantilla).toBe('reporte_cierre_ordenado_3_v2');
    expect(renderizarPaginaReporte(p)).toContain('Celfiao: 9 ventas — $2.847.000\n\n• Sonivox: 1 venta — $246.500');
    expect(p.parametros.every(p => !/[\r\n\t]/.test(p))).toBe(true);
  });
  it('conserva todas las tiendas, gastos, alertas y total al paginar', () => {
    const filas = Array.from({ length: 37 }, (_, i) => `Tienda ${i}: $${i + 1}.000 — concepto ${i}`);
    const paginas = paginarReporte(['GASTOS — 11 septiembre', ...filas, 'Total del día: $703.000'].join('\n'));
    expect(paginas.length).toBeGreaterThan(1);
    expect(paginas.flatMap(p => p.parametros.slice(1))).toEqual([...filas, 'Total del día: $703.000']);
    expect(paginas.every(p => renderizarPaginaReporte(p).length <= 1024)).toBe(true);
    expect(paginas[0].parametros[0]).toContain(`Parte 1/${paginas.length}`);
  });
  it('no elimina descripciones largas', () => {
    const largo = 'concepto ' .repeat(220).trim();
    const paginas = paginarReporte(`GASTOS\n${largo}\nTotal: $1.000`);
    expect(paginas.flatMap(p => p.parametros.slice(1)).join(' ')).toBe(`${largo} Total: $1.000`);
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
