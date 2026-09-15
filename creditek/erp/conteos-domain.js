(function (global) {
  'use strict';
  function conciliar(sistemaAlCorte, reportadoAlCorte, actual) {
    for (const n of [sistemaAlCorte, reportadoAlCorte, actual]) {
      if (!Number.isSafeInteger(n) || n < 0) throw new Error('Las cantidades deben ser enteros no negativos.');
    }
    const diferencia = reportadoAlCorte - sistemaAlCorte;
    return { diferencia, propuesto: actual + diferencia };
  }
  function leerLibro(XLSX, libro) {
    if (!libro.Sheets.Resumen || !libro.Sheets.Conteo) throw new Error('Usa el archivo único descargado desde Conteos. Los archivos antiguos requieren conciliación asistida.');
    const resumen = XLSX.utils.sheet_to_json(libro.Sheets.Resumen, { header: 1 });
    if (resumen[0]?.[1] !== 'KORA-CONTEO-2') throw new Error('Descarga nuevamente este corte: el archivo debe reportar cantidades reconstruidas al corte (formato 2).');
    const corte = String(resumen[1]?.[1] || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(corte)) throw new Error('Falta el identificador del corte.');
    const raw = XLSX.utils.sheet_to_json(libro.Sheets.Conteo, { defval: '', raw: true });
    const encabezados = XLSX.utils.sheet_to_json(libro.Sheets.Conteo, { header: 1 })[0] || [];
    if (!['Código producto','IMEI / serial','Cantidad reportada al corte'].every(h => encabezados.includes(h))) throw new Error('No cambies los encabezados del archivo.');
    const seen = new Set();
    const filas = raw.map((r, i) => {
      const codigo = String(r['Código producto'] || '').trim();
      const imei = String(r['IMEI / serial'] || '').trim();
      if (!codigo) throw new Error(`Fila ${i + 2}: falta código de producto.`);
      const cantidad = r['Cantidad reportada al corte'];
      if (cantidad === '' || typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 0) throw new Error(`Fila ${i + 2}: escribe la cantidad reconstruida al corte; vacío no equivale a cero.`);
      const key = `${codigo}|${imei}`;
      if (seen.has(key)) throw new Error(`Fila ${i + 2}: producto/IMEI duplicado.`);
      seen.add(key);
      return { codigo, imei, cantidad, nota: String(r.Observación || '').trim() };
    });
    return { corte, filas };
  }
  global.KoraConteos = Object.freeze({ conciliar, leerLibro });
})(typeof window === 'undefined' ? globalThis : window);
