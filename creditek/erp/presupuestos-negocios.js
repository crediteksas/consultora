(function (global) {
  'use strict';
  const negocios = [
    { id: 'retail', label: 'Retail', href: 'presupuestos.html' },
    { id: 'b2b', label: 'B2B', href: 'presupuestos.html?negocio=b2b' },
    { id: 'aliados', label: 'Aliados', href: 'aliados-presupuesto.html' },
  ];
  function negocioActual(location) {
    if (/\/aliados-presupuesto(?:\.html)?$/.test(location.pathname)) return 'aliados';
    return new URLSearchParams(location.search).get('negocio') === 'b2b' ? 'b2b' : 'retail';
  }
  function permitidos(perfil) {
    if (!perfil?.activo || !['gerencia', 'auditoria'].includes(perfil.rol)) return [];
    return negocios.filter(n => n.id !== 'aliados' || perfil.rol === 'gerencia' || perfil.es_operador_aliados === true);
  }
  function montar(container, perfil) {
    if (!container) return;
    const central = global.creditekSidebar?.perfil;
    if (central?.id === perfil?.id) perfil = central;
    const actual = negocioActual(global.location);
    container.className = 'presupuestos-negocios';
    container.setAttribute('aria-label', 'Presupuestos por negocio');
    container.innerHTML = permitidos(perfil).map(n =>
      `<a href="${n.href}"${n.id === actual ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  }
  global.KoraPresupuestosNav = Object.freeze({ montar, negocioActual, permitidos });
  global.document?.addEventListener('kora-sidebar-ready', () => {
    for (const container of global.document.querySelectorAll('[data-presupuestos-negocios]')) {
      montar(container, global.creditekSidebar?.perfil);
    }
  });
})(window);
