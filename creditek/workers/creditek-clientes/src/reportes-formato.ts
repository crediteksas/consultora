/** Saltos de línea en el texto FIJO de Meta, nunca en sus parámetros. */
export const MAX_FILAS_REPORTE = 8;

export function cuerpoPlantillaReporte(filas: number): string {
  if (!Number.isInteger(filas) || filas < 1 || filas > MAX_FILAS_REPORTE) throw new Error('invalid_report_rows');
  return 'Creditek informa el cierre operativo solicitado.\n\n{{1}}\n\n*Detalle por tienda y movimientos*\n\n'
    + Array.from({ length: filas }, (_, i) => `• {{${i + 2}}}`).join('\n\n')
    + '\n\nEste informe es para control de Gerencia. Los valores y las alertas corresponden al corte indicado.';
}

export type PaginaReporte = { plantilla: string; parametros: string[] };

export function renderizarPaginaReporte(pagina: PaginaReporte): string {
  return cuerpoPlantillaReporte(pagina.parametros.length - 1)
    .replace(/\{\{(\d+)\}\}/g, (_, n: string) => pagina.parametros[Number(n) - 1]);
}

function unirHastaOchoFilas(filasOriginales: string[]): string[] {
  const filas = [...filasOriginales];
  while (filas.length > MAX_FILAS_REPORTE) {
    let indice = 0;
    let menorLongitud = Number.POSITIVE_INFINITY;
    for (let i = 0; i < filas.length - 1; i++) {
      const longitud = filas[i].length + filas[i + 1].length;
      if (longitud < menorLongitud) {
        menorLongitud = longitud;
        indice = i;
      }
    }
    filas.splice(indice, 2, `${filas[indice]} · ${filas[indice + 1]}`);
  }
  return filas;
}

/**
 * Cada cierre debe ser un único mensaje. Conserva todas las filas y las agrupa
 * dentro de las ocho variables aprobadas en Meta; nunca crea «Parte 1/…».
 */
export function paginarReporte(mensaje: string): PaginaReporte[] {
  const lineas = mensaje.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const titulo = lineas.shift();
  if (!titulo || !lineas.length) throw new Error('empty_report');
  const filas = unirHastaOchoFilas(lineas.map(linea => linea.replace(/^•\s*/, '')));
  const pagina = {
    plantilla: `reporte_cierre_ordenado_${filas.length}_v2`,
    parametros: [titulo, ...filas],
  };
  if (renderizarPaginaReporte(pagina).length > 1024) throw new Error('report_too_long_for_single_message');
  return [pagina];
}
