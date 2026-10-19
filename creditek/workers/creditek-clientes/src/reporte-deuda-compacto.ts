import type { CorteDeuda } from './reporte-deuda';
import type { PaginaReporte } from './reportes-formato';

const limpio = (s: string) => String(s || '').replace(/[\r\n\t*_~`]/g, ' ').replace(/\s+/g, ' ').trim();
const moneda = (centavos: number) => {
  const n = BigInt(centavos), absoluto = n < 0n ? -n : n;
  return '$' + (n < 0n ? '-' : '') + new Intl.NumberFormat('es-CO').format(absoluto / 100n)
    + ',' + String(absoluto % 100n).padStart(2, '0');
};
const hora = (s: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s));

function centavos(valor: number): number {
  const n = Number(valor), c = Math.round(n * 100);
  if (typeof valor !== 'number' || !Number.isFinite(n) || !Number.isSafeInteger(c) || Math.abs(n - c / 100) > 0.0000001) throw new Error('deuda_importe_invalido');
  return c;
}

/** Saltos de línea fijos en Meta: cada tienda ocupa una variable, nunca se pega a otra. */
export function cuerpoPlantillaDeuda(tiendas: number): string {
  if (!Number.isInteger(tiendas) || tiendas < 1 || tiendas > 20) throw new Error('deuda_cantidad_tiendas_invalida');
  return '*DEUDA CON CREDITEK*\nFecha y hora del corte: {{1}}\nEstado de confirmaciones recibidas: {{2}}\n\n'
    + '*Detalle por tienda · Responsable · Saldo declarado · Hora*\n'
    + Array.from({ length: tiendas }, (_, i) => `• {{${i + 3}}}`).join('\n')
    + `\n\n*Consolidado de saldos de las tiendas: {{${tiendas + 3}}}*\n`
    + 'Valores en pesos colombianos, informados por los responsables de cada tienda al momento de confirmar.';
}

export function renderizarReporteDeuda(pagina: PaginaReporte): string {
  return cuerpoPlantillaDeuda(pagina.parametros.length - 3)
    .replace(/\{\{(\d+)\}\}/g, (_, n: string) => pagina.parametros[Number(n) - 1]);
}

/** Una sola plantilla. No altera el corte ni confirma, compensa o cobra saldos. */
export function prepararReporteDeudaCompacto(corte: CorteDeuda): PaginaReporte {
  const grupos = new Map<string, CorteDeuda['diarias']>();
  for (const fila of corte.diarias) {
    const clave = fila.tienda_codigo || `sin-tienda:${fila.usuario_id}`;
    const grupo = grupos.get(clave) || [];
    grupo.push(fila); grupos.set(clave, grupo);
  }
  const filas: string[] = [];
  let total = 0, tiendasConSaldo = 0;
  for (const grupo of grupos.values()) {
    const saldos = new Set<number>();
    const administradores = grupo.map(f => {
      const c = f.confirmacion;
      if (!c) return `${limpio(f.administrador)}: PENDIENTE`;
      const declarado = centavos(c.saldo_declarado);
      saldos.add(declarado);
      const detalle = `${limpio(f.administrador)}: ${moneda(declarado)} (${hora(c.confirmado_at)})`;
      if (centavos(c.diferencia) === 0) return detalle;
      return `${detalle} · DIFERENCIA ${moneda(centavos(c.diferencia))} · KORA ${moneda(centavos(c.saldo_sistema))} · ${c.revisado_at ? 'Revisada' : 'Por revisar'}`;
    });
    filas.push(`${limpio(grupo[0].tienda)} · ${administradores.join('; ')}${saldos.size > 1 ? ' · Saldos distintos: por conciliar' : ''}`);
    // Una tienda se suma una sola vez. Saldos distintos no se eligen arbitrariamente.
    if (saldos.size === 1) {
      total += saldos.values().next().value!; tiendasConSaldo++;
      if (!Number.isSafeInteger(total)) throw new Error('deuda_total_fuera_de_rango');
    }
  }
  const confirmados = corte.diarias.filter(f => f.confirmacion && centavos(f.confirmacion.diferencia) === 0).length;
  const diferencias = corte.diarias.filter(f => f.confirmacion && centavos(f.confirmacion.diferencia) !== 0).length;
  const pendientes = corte.diarias.length - confirmados - diferencias;
  const resumen = `${confirmados} confirmadas sin diferencia · ${diferencias} con diferencia · ${pendientes} pendientes`;
  const tiendasTotal = `${grupos.size} ${grupos.size === 1 ? 'tienda' : 'tiendas'}`;
  const etiquetaTotal = !tiendasConSaldo ? 'TOTAL PENDIENTE: sin saldos confirmados'
    : tiendasConSaldo < grupos.size ? `TOTAL PARCIAL (${tiendasConSaldo}/${grupos.size} tiendas): ${moneda(total)}`
    : `TOTAL (${tiendasTotal}): ${moneda(total)}`;
  const pagina: PaginaReporte = {
    plantilla: `reporte_deuda_compacto_${Math.max(1, filas.length)}_v1`,
    parametros: [`${corte.fecha.split('-').reverse().join('/')} · Corte 3:00 p. m. Colombia`, resumen,
      ...(filas.length ? filas : ['Sin administradores activos en el corte.']), etiquetaTotal],
  };
  // No partir ni truncar silenciosamente un informe excepcionalmente largo.
  if (renderizarReporteDeuda(pagina).length > 1024) throw new Error('deuda_reporte_compacto_supera_1024');
  return pagina;
}
