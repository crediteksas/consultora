(function (global) {
  'use strict';

  function texto(valor) { return String(valor ?? '').trim(); }
  function numero(valor) {
    if (typeof valor === 'number') return valor;
    const limpio = texto(valor).replace(/[$\s]/g, '').replace(/,/g, '');
    return limpio === '' ? NaN : Number(limpio);
  }
  function tipoProducto(tipo, imei) {
    return texto(tipo).toUpperCase() === 'CELULAR' || texto(imei) ? 'serializado' : 'cantidad';
  }
  function categoria(tipo) {
    const valor = texto(tipo).toUpperCase();
    return valor === 'PARLANTE' ? 'PARLANTES' : valor || 'OTRO';
  }
  function leerLibro(XLSX, contenido) {
    const libro = XLSX.read(contenido, { type: 'array' });
    const hoja = libro.Sheets['Inventario inicial'];
    if (!hoja) throw new Error('El archivo debe contener la hoja “Inventario inicial”.');
    const originales = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
    if (!originales.length) throw new Error('La hoja “Inventario inicial” está vacía.');
    const filas = originales.map((fila, indice) => {
      const codigo = texto(fila['Código de producto'] || fila['Tienda código']);
      const nombre = texto(fila['Referencia o producto']);
      const imei = texto(fila['IMEI o serial']);
      const cantidad = numero(fila.Cantidad);
      const costo = numero(fila['Costo unitario']);
      const precio = numero(fila['Precio de tienda']);
      if (!codigo || !nombre) throw new Error(`Fila ${indice + 2}: falta código o nombre de producto.`);
      if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error(`Fila ${indice + 2}: la cantidad debe ser un entero mayor que cero.`);
      if (!Number.isFinite(costo) || costo < 0) throw new Error(`Fila ${indice + 2}: el costo no es válido.`);
      if (!Number.isFinite(precio) || precio <= 0) throw new Error(`Fila ${indice + 2}: el precio de tienda no es válido.`);
      const tipo = tipoProducto(fila.Tipo, imei);
      if (tipo === 'serializado' && (!imei || cantidad !== 1)) throw new Error(`Fila ${indice + 2}: un celular requiere IMEI y cantidad 1.`);
      if (tipo === 'cantidad' && imei) throw new Error(`Fila ${indice + 2}: un producto por cantidad no debe traer IMEI.`);
      return {
        producto_codigo: codigo, producto_nombre: nombre, categoria: categoria(fila.Tipo), tipo,
        imei, cantidad, costo, precio, observacion: texto(fila.Observación),
      };
    });
    const codigos = new Map();
    const imeis = new Set();
    filas.forEach((fila) => {
      const firma = `${fila.producto_nombre}\u0000${fila.tipo}`;
      if (codigos.has(fila.producto_codigo) && codigos.get(fila.producto_codigo) !== firma) {
        throw new Error(`El código ${fila.producto_codigo} está asignado a productos diferentes.`);
      }
      codigos.set(fila.producto_codigo, firma);
      if (fila.imei && imeis.has(fila.imei)) throw new Error(`El IMEI ${fila.imei} está repetido.`);
      if (fila.imei) imeis.add(fila.imei);
    });
    return filas;
  }

  global.CreditekInventarioImport = Object.freeze({ leerLibro, numero, tipoProducto });
})(typeof window !== 'undefined' ? window : globalThis);
