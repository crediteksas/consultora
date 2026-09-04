(function (global) {
  'use strict';

  global.AURA_MODULES = Object.freeze({
    sofia: Object.freeze({
      id: 'sofia',
      name: 'Sofía',
      path: '/creditek/agentes/creditek-agente-respuestas.html',
      appId: 'sofia',
      permission: 'sofia.use',
    }),
    agent1: Object.freeze({
      id: 'agent-1',
      name: 'Piezas comerciales',
      path: '/creditek/agentes/creditek-agente-redes.html',
      appId: 'sofia',
      permission: 'sofia.use',
    }),
    agent3: Object.freeze({
      id: 'agent-3',
      name: 'Publicación y métricas',
      path: '/creditek/agentes/agente3-meta-ads.html',
      appId: 'meta_ads',
      permission: 'meta_ads.read',
    }),
    agent4: Object.freeze({
      id: 'agent-4',
      name: 'Calendario de contenido',
      path: '/creditek/agentes/creditek-agente-calendario.html',
      appId: 'sofia',
      permission: 'sofia.use',
    }),
    finanzas: Object.freeze({
      id: 'finanzas',
      name: 'Inversiones',
      path: '/creditek/agentes/aura-finanzas.html',
      appId: 'finanzas',
      permission: 'finanzas.read',
    }),
  });
})(typeof window !== 'undefined' ? window : globalThis);
