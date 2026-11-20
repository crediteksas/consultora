/** Presentación COP en pesos enteros; no modifica los importes contables. */
export function pesosDesdeCentavos(valor: number): string {
  if (!Number.isSafeInteger(valor)) throw new Error('deuda_importe_invalido');
  const n = BigInt(valor), absoluto = n < 0n ? -n : n;
  const pesos = (absoluto + 50n) / 100n;
  // Una diferencia real menor a medio peso no se presenta como si fuese cero.
  if (n !== 0n && pesos === 0n) return n < 0n ? 'entre -$1 y $0' : 'entre $0 y $1';
  return '$' + (n < 0n ? '-' : '') + new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(pesos);
}

/** El formato legado acepta importes calculados con cualquier precisión finita. */
export function pesosReporte(valor: number): string {
  if (!Number.isFinite(valor)) throw new Error('deuda_importe_invalido');
  if (valor !== 0 && Math.abs(valor) < 0.5) return valor < 0 ? 'entre -$1 y $0' : 'entre $0 y $1';
  return '$' + new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(valor === 0 ? 0 : valor);
}
