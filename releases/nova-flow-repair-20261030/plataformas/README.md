# CONS01 / CONSULTA01

Implementación acotada sobre el snapshot NOVA SHA256 `232513ce40c043e43c530ebad9bb9b3dbfc7d8061cae109f07fd82f841c411fb`.

`transform.mjs` exporta `transformNova(source)` y `transformClientes(source)`. El segundo agrega exclusivamente el nombre `nova_retail_consent_current` a la allowlist RPC del gateway privado. No abre GET clientes ni cambia permisos públicos.

CONS01 consulta el consentimiento general actual, conserva el histórico y bloquea acciones nuevas, fotos, invitaciones y avisos tras revocación. La propuesta SQL `../sql/kora-consent-repair.sql` crea un booleano invoker exclusivo de service_role, bloquea review/request_queries/confirm_delivery y hace que save invalide autorizaciones cacheadas tras revocación. El helper toma locks compartidos cliente→source durante la transacción de la acción. No usa la vigencia del permiso de consultas como revocación general. Los cuatro predecesores y sus ACL están en predecessor-functions.json; las definiciones exactas y rollback permiten comprobar restitución. El integrador debe generar el nombre de migración con CLI y preservar el SQL aprobado.

CONSULTA01 recupera únicamente jobs Aló/PayJoy queued, sin inputs y del query_request_id actual. Vuelve a comprobar la fuente y el consentimiento específico vigente antes de reponer los locators en el mismo batch. No crea solicitudes, reservas, envíos ni llamadas a proveedores; tampoco habilita KrediYA. Un job terminado o de otro batch no se rearma. Una renovación recibida no equivale a resultados de proveedores resueltos.

Pruebas sin red:

```sh
node --test plataformas/flow-repair.test.mjs
PGLITE_MODULE=/ruta/local/@electric-sql/pglite/dist/index.js node --test plataformas/sql.test.mjs
```

La suite Worker acepta `NOVA_REPAIR_CANDIDATE=/ruta/al/bundle/completo.mjs` para comprobar la composición final. La suite SQL acepta `CONSENT_MIGRATION=/ruta/a/la/migracion.sql` para probar el archivo CLI final, sin duplicar ni alterar su contenido.

Pruebas PostgreSQL nativo, solo dentro de un contenedor local desechable creado por el integrador cuyo nombre empiece `nova-flow-sql-`. Los scripts no inician VM, no crean contenedores, no publican puertos y acceden únicamente con docker exec/psql. Ejecutar secuencialmente: la fixture recrea el schema public del contenedor en cada caso.

```sh
NOVA_SQL_NATIVE_CONTAINER=nova-flow-sql-SUFIJO node --test plataformas/sql.test.mjs
NOVA_SQL_NATIVE_CONTAINER=nova-flow-sql-SUFIJO node plataformas/native-concurrency.mjs
```

La suite SQL prueba nueve casos, incluida ACL service-only, revocación general/source, invalidez de cache, independencia del TTL de consultas, drift de predecesor y rollback exacto. El runner concurrente prueba cuatro carreras en dos sesiones reales: cada revocación antes de aprobar, y cada revocación esperando a una aprobación previa; después verifica invalidación de la autorización conservando el evento histórico. PGlite por sí solo no certifica contención entre sesiones.

Si otro transform reemplaza sendNotices completo, debe conservar el guard de consentimiento o aplicarse antes de este transform. Los reemplazos tienen anclas únicas y fallan ante replay/drift. No se modifican bindings, secretos, despliegues, políticas RLS, registros de clientes ni resultados de proveedores durante la preparación.
