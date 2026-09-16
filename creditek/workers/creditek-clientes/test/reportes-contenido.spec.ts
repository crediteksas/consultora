import { describe, expect, it } from 'vitest';
import {
  encabezadoEstado,
  formatearCaja,
  formatearGastos,
  formatearVentas,
} from '../src/index';

describe('presentación ejecutiva de cierres por WhatsApp', () => {
  it('pone total y estado antes del detalle de gastos y agrupa por tienda', () => {
    const mensaje = formatearGastos([
      { monto: 20_000, descripcion: 'Mensajería', tienda_codigo: 'CK-02', origen: { nombre: 'Móvil Shopping' }, concepto: { nombre: 'Domicilios' } },
      { monto: 80_000, descripcion: 'Turno tarde', tienda_codigo: 'CK-02', origen: { nombre: 'Móvil Shopping' }, concepto: { nombre: 'Nómina' } },
      { monto: 35_000, tienda_codigo: 'CK-01', origen: { nombre: 'Celfiao' }, concepto: { nombre: 'Servicios' } },
    ], 'miércoles 16 de septiembre de 2026', encabezadoEstado(false, ['Sonivox'], '19:00'));

    const lineas = mensaje.split('\n');
    expect(lineas[0]).toBe('🧾 CIERRE DE GASTOS • miércoles 16 de septiembre de 2026');
    expect(lineas[1]).toBe('RESUMEN • 3 movimientos • TOTAL $135.000');
    expect(lineas[2]).toBe('⚠️ CIERRES DE CAJA • 1 tienda pendiente al corte de las 19:00');
    expect(lineas[3]).toBe('PENDIENTES • Sonivox');
    expect(mensaje).toContain('MÓVIL SHOPPING • 2 gastos • $100.000');
    expect(mensaje).toContain('↳ Nómina · Turno tarde • $80.000');
    expect(mensaje).not.toContain('• •');
  });

  it('resume ventas primero y deja una fila breve por tienda', () => {
    const mensaje = formatearVentas([
      { total: 500_000, tienda_codigo: 'CK-02', origen: { nombre: 'Móvil Shopping' } },
      { total: 300_000, tienda_codigo: 'CK-02', origen: { nombre: 'Móvil Shopping' } },
      { total: 250_000, tienda_codigo: 'CK-01', origen: { nombre: 'Celfiao' } },
    ], 'miércoles 16 de septiembre de 2026');

    expect(mensaje.split('\n')).toEqual([
      '💰 CIERRE DE VENTAS • miércoles 16 de septiembre de 2026',
      'RESUMEN • 3 ventas • TOTAL $1.050.000',
      'CELFIAO • 1 venta • $250.000',
      'MÓVIL SHOPPING • 2 ventas • $800.000',
    ]);
  });

  it('hace explícito lo contado, esperado y la diferencia de cada caja', () => {
    const mensaje = formatearCaja([
      { efectivo_contado: 900_000, efectivo_esperado: 900_000, diferencia: 0, tienda_codigo: 'CK-01', origen: { nombre: 'Celfiao' } },
      { efectivo_contado: 780_000, efectivo_esperado: 800_000, diferencia: -20_000, tienda_codigo: 'CK-02', origen: { nombre: 'Móvil Shopping' } },
    ], 'miércoles 16 de septiembre de 2026');

    expect(mensaje).toContain('RESUMEN • 2 cajas cerradas • EFECTIVO $1.680.000 • 1 con diferencia');
    expect(mensaje).toContain('CELFIAO • Contado $900.000 • Esperado $900.000 • ✅ CUADRA');
    expect(mensaje).toContain('MÓVIL SHOPPING • Contado $780.000 • Esperado $800.000 • ⚠️ DIFERENCIA -$20.000');
  });

  it('explica días sin movimientos sin mostrar listas vacías', () => {
    expect(formatearGastos([], 'fecha', encabezadoEstado(true, [], '18:00')))
      .toContain('SIN GASTOS • No hay movimientos aprobados para este día');
    expect(formatearVentas([], 'fecha'))
      .toContain('SIN VENTAS • No hay operaciones registradas para este día');
    expect(formatearCaja([], 'fecha'))
      .toContain('SIN CIERRES • Ninguna tienda ha cerrado caja');
  });
});
