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

/** Conserva cada línea y cada importe; solo compacta espacios dentro de un campo. */
export function paginarReporte(mensaje: string): PaginaReporte[] {
  const lineas = mensaje.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const titulo = lineas.shift();
  if (!titulo || !lineas.length) throw new Error('empty_report');
  // Una descripción excepcionalmente larga continúa, nunca se recorta con slice(0, 1024).
  const filas = lineas.flatMap(linea => {
    let restante = linea.replace(/^•\s*/, '');
    const partes: string[] = [];
    while (restante.length > 400) {
      const espacio = restante.lastIndexOf(' ', 400);
      const corte = espacio > 200 ? espacio : 400;
      partes.push(restante.slice(0, corte));
      restante = restante.slice(corte).trimStart();
    }
    if (restante) partes.push(restante);
    return partes;
  });
  const grupos: string[][] = [];
  let grupo: string[] = [];
  for (const fila of filas) {
    const prueba = [...grupo, fila];
    // Reserva para el indicador de página antes de conocer el total de páginas.
    const tamano = renderizarPaginaReporte({ plantilla: '', parametros: [titulo + ' — Parte 999/999', ...prueba.slice(0, MAX_FILAS_REPORTE)] }).length;
    if (grupo.length && (prueba.length > MAX_FILAS_REPORTE || tamano > 1000)) {
      grupos.push(grupo);
      grupo = [];
    }
    grupo.push(fila);
  }
  if (grupo.length) grupos.push(grupo);
  return grupos.map((filas, i) => {
    const pagina = {
      plantilla: `reporte_cierre_ordenado_${filas.length}_v2`,
      parametros: [titulo + (grupos.length > 1 ? ` — Parte ${i + 1}/${grupos.length}` : ''), ...filas],
    };
    if (renderizarPaginaReporte(pagina).length > 1024) throw new Error('report_page_too_long');
    return pagina;
  });
}
