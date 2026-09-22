(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CreditekTiendasCanonicas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CAMPOS = 'codigo, nombre, ciudad';

  function validar(tiendas) {
    const filas = Array.isArray(tiendas) ? tiendas : [];
    const codigos = new Set();
    const nombres = new Map();
    for (const tienda of filas) {
      const codigo = String(tienda?.codigo || '').trim();
      const nombre = String(tienda?.nombre || '').trim();
      if (!codigo || !nombre) throw new Error('El catálogo Retail contiene una tienda sin código o nombre.');
      if (codigos.has(codigo)) throw new Error(`Código de tienda duplicado: ${codigo}.`);
      const nombreNormalizado = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (nombres.has(nombreNormalizado) && nombres.get(nombreNormalizado) !== codigo) {
        throw new Error(`Nombre de tienda duplicado entre ${nombres.get(nombreNormalizado)} y ${codigo}: ${nombre}.`);
      }
      codigos.add(codigo);
      nombres.set(nombreNormalizado, codigo);
    }
    return filas;
  }

  async function cargar(supabase) {
    const { data, error } = await supabase
      .from('origenes')
      .select(CAMPOS)
      .eq('tipo', 'propia')
      .eq('activo', true)
      .order('codigo');
    if (error) throw error;
    return validar(data || []);
  }

  return Object.freeze({ CAMPOS, cargar, validar });
});
