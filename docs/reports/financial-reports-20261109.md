# Informes financieros de lectura

Administración → Información exógena e informes. Acceso de los responsables financieros existentes; consultas bajo la sesión y las políticas RLS existentes. No se agrega SQL, RPC, permiso ni escritura operativa.

- Libro: registros de banco, variaciones por saldos registrados, aperturas/ajustes/reversos identificados, contrapartes, cuentas, facturas, órdenes, soporte y fuentes. Saldo de control no certifica extracto conciliado.
- Conciliación: esperado neto activo, aplicaciones activas contra abonos activos, diferencia; estimaciones y anulados separados; abonos completos con aplicado de todos los cortes y evidencia.
- Exógena: base anual para revisión, no formato DIAN. Pagos por identificación, detalle, históricos declarados por Gerencia, registros incompletos y exclusiones. Cliente del crédito nunca se usa como beneficiario. Titular snapshot prioritario; ficha actual se rotula. Sin fecha bancaria, histórico por fecha de crédito. Sin fecha conocida queda pendiente sin certificar año. Tiendas propias y compensaciones no se asumen giros a terceros.
- Antiduplicación: historial con mismo identificador exacto de plataforma/crédito cubierto por orden pagada se conserva como exclusión; movimientos de Tesorería ligados a órdenes no se suman de nuevo. Casos proveedores de Tesorería quedan pendientes de cruce con Banco.
- Cobertura: paginación completa con cuenta exacta, fallo de una fuente bloquea exportación. No certifica que todos los archivos originales del año estén cargados. Cambios de fecha invalidan la descarga preparada.
- Exportación XLSX: números numéricos, cuentas y documentos como texto, celdas string sin fórmula; hojas fuentes para rastrear documentos.

Validación: `node --test tests/erp/reportes-financieros.test.mjs`; suite `npm run test:local`; build/pipeline oficial. El ejecutor de suite no se altera: su huella está sellada por el control de publicación de permisos. Pruebas nuevas se corren además de la suite. Revisión Claude del código anonimizado aprobada; no se transmitieron filas reales.
