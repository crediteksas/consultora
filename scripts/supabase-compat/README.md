# Preparación de compatibilidad de permisos de Supabase

Estas herramientas son **preparatorias y fuera de línea**. No se conectan a
Supabase, no crean permisos y no autorizan una publicación. Los JSON reales de
catálogo no se guardan en Git ni se envían a revisores externos. La suite utiliza
solo PostgreSQL en memoria y datos ficticios, sin envíos externos.

## Inventario reproducible

```sh
node scripts/supabase-compat/inventory.mjs \
  --root /ruta/al/checkout \
  --metadata-dir /ruta/privada/a/catalogos \
  --output-dir /ruta/privada/a/resultados
node --test tests/security/supabase-compatibility.test.mjs
node --test tests/security/supabase-compatibility-catalog.test.mjs
```

Entradas, para cada prefijo `kora` y `aura`:

- `*-snapshot.json`: relaciones/columnas/ACL/RLS, funciones y sus firmas/ACL,
  permisos por defecto, hashes de políticas y configuración API permitida.
- `*-dependencies.json`: ACL de esquemas, dependencias de vistas y políticas,
  secuencias con propietario de columna.
- `*-migration-fingerprints.json`: versiones, nombres y hashes de sentencias;
  nunca sentencias históricas con datos operativos ni identidad del autor.

`catalog-query.sql` y `dependencies-query.sql` son consultas de solo lectura para
obtener esas dos primeras entradas. Incluyen todos los esquemas de aplicación,
también los privados, y el catálogo principal ya incluye `schema_grants` y hashes
de vistas. No exportan filas, cuerpos de funciones/vistas ni configuración
arbitraria; esta última se limita a claves permitidas y una huella completa.

La búsqueda estática produce candidatos para revisión: puede incluir código
muerto/comentarios y no resuelve llamadas dinámicas, roles en tiempo de ejecución
ni firmas sobrecargadas. **Nunca** debe convertirse directamente en un GRANT.
Un hash igual prueba igualdad de contenido, no que sea seguro reejecutarlo.
Las coincidencias de nombre o versión se conservan como no verificadas.
Archivos de mantenimiento, pruebas y reversión no son migraciones para reejecutar.

## Control semántico de publicación

```sh
node scripts/supabase-compat/check-permission-contract.mjs \
  --before /ruta/catalogo-aislado-antes.json \
  --after /ruta/catalogo-aislado-despues.json \
  --contract /ruta/contrato-revisado.json \
  --created /ruta/objetos-nuevos-o-recreados.json
```

Cada catálogo debe incluir `schema_grants` con el contenido de `schemas` del
inventario de dependencias; la ausencia de ACL de esquema hace fallar el control.
El catálogo incluye también adjuntos de triggers de aplicación y sus huellas,
sin guardar argumentos ni cuerpos. Si faltan esos metadatos el control falla;
cambios de triggers necesitan una expectativa exacta revisada como las políticas.
El contrato exige proyecto explícito, propietario, tipo, permisos finitos por
rol, ACL de columnas, protección y prueba de aislamiento de cada objeto nuevo o
recreado. Las firmas de funciones deben ser exactas. Se rechazan cambios de
acceso no declarados, conversiones de invoker a definer, tablas sin RLS y cambios
de políticas/esquemas/defaults no previstos exactamente.

`deploy-kora-production.mjs` espera a `release-gate.mjs` antes de ejecutar
pruebas, build o cargar una versión. Las aprobaciones y el despliegue se
registran por separado; este control no los sustituye.
La integración actual fija el lote exacto desde la baseline40d: el SELECT del
tarifario y el SQL de socios que **ya está aplicado en producción y no se volverá
a ejecutar allí**. Su evidencia incluye actualización/reconstrucción de ese lote
en dos instancias PostgreSQL17.6,42 comprobaciones nativas y reversión efectiva
exacta. El control acepta ese lote; no certifica la reconstrucción mínima global
ni autoriza por sí solo publicar. La baseline permanece igual.

`socios-contract.mjs` fija de forma independiente las columnas, permisos y
huellas de cuatro tablas privadas, cinco funciones y cuatro triggers. El emisor
`kora-source-batch-evidence.mjs` comprueba también la procedencia del arnés,
catálogos y SQL; no ejecuta migraciones ni escribe en Supabase. Sus pruebas
rechazan accesos anónimos inesperados, triggers adicionales, fuentes alteradas
y salidas que escapan por symlink. Las pruebas unitarias de procedencia usan
copias sintéticas de la evidencia y no se presentan como ejecuciones nativas.

`config/kora-permission-baseline.json` fija las huellas de 286 archivos SQL del
commit 40d0bbe7. Solo permite identificar cambios de fuentes: no prueba que esas
migraciones estén todas aplicadas, no concilia su historial, no convierte SQL
histórico en instrucciones de replay y no certifica reconstrucción completa.
Se cubren los directorios de migraciones de Supabase y ERP, incluyendo sus carpetas históricas para que un SQL nuevo no evada el control.
Ese seguimiento no autoriza aplicar rollbacks ni históricos. El SQL manual fuera
de estos directorios exige revisión aparte.

Para cada SQL nuevo o modificado, la evidencia revisada debe fijar su SHA-256 y
las entradas de catálogo/contrato/inventario de objetos de **actualización y
reconstrucción aisladas**. Debe enlazar cada contrato con una prueba de aislamiento
incluida en `test:local`, fijar las huellas de esas fuentes y del ejecutor de
pruebas, y cubrir los objetos creados o recreados declarados por el SQL. Los
hashes cambian si se edita después una fuente. Las firmas sobrecargadas requieren
cobertura conservadora de todos los candidatos; no se adivinan. El preflight
rechaza rutas que escapen del checkout, symlinks de migraciones y omisiones de
escenarios. No ejecuta SQL, no hace peticiones de red ni concede permisos.

Los catálogos utilizados para esta evidencia son de instancias desechables y
sin datos operativos. Los respaldos reales siguen fuera de Git y de Claude.
La revisión de código debe verificar la procedencia de la evidencia; sus hashes
no son una firma de confianza ni sustituyen ejecutar las pruebas y revisar los
consumidores. No generar una evidencia vacía para eludir el bloqueo. Todavía se
deben completar la matriz, los contratos revisados y la reconstrucción integral.
No desactivar ni eludir el pipeline actual para publicar.

```sh
node --test tests/security/supabase-compatibility-release-gate.test.mjs
```


## Primer contrato acotado: lectura del tarifario KORA

`20261021161019_kora_compat_select_krediya_price_rules.sql` hace explícito
únicamente SELECT de `authenticated` sobre `public.krediya_price_rules`.
No cambia políticas, funciones, defaults ni permisos de escritura. Rechaza
aplicarse si la tabla no tiene RLS, si sus dos políticas no corresponden al
modelo de revisores, o si faltan USAGE del esquema/EXECUTE del autorizador.

La suite comprueba actualización con SELECT ya existente, reconstrucción de ese
contrato aislado sin grants automáticos, denegaciones y rollback transaccional.
También simula defaults de funciones más restrictivos como defensa adicional;
esto no afirma que Supabase vaya a cambiar esos defaults el 30 de octubre.

Este archivo no completa la adaptación de todos los módulos/proyectos. Antes de
publicarlo hay que renovar el preflight y comparar el catálogo aprobado. En el
estado legado con SELECT directo ya presente y sin cambios de otorgante/opción
de delegación, el GRANT no cambia la ACL y no corresponde revertir con REVOKE.
Si el estado real difiere, detener la publicación y preparar su reversión
específica. La prueba BEGIN/ROLLBACK en memoria no es un down-migration posterior
al commit para un estado diferente.

La reversión posterior al commit de **ese único GRANT aditivo** se prepara con:

```sh
node scripts/supabase-compat/tariff-rollback.mjs \
  --before /ruta/privada/catalogo-anterior.json \
  --after /ruta/privada/catalogo-posterior.json
node --test tests/security/supabase-compatibility-rollback.test.mjs
```

Solo genera un plan/SQL, no se conecta ni ejecuta nada. Si SELECT ya existía,
conserva la autorización (no-op). Si solo se agregó el SELECT revisado, permite
retirar exactamente ese permiso, con bloqueo acotado de la tabla y comparación
del catálogo antes y después dentro de una transacción. Rechaza otros cambios
de permisos, políticas, funciones, defaults o esquema. Si hay ACL de columnas y
se necesita REVOKE de tabla, se detiene: exige restauración separada revisada,
no las adivina. También rechaza desviaciones posteriores al respaldo. Las
pruebas ejecutan esta reversión después de un commit ficticio. No certifican
concurrencia real, una reconstrucción completa ni el resto de permisos.
Si falla una guarda, la transacción queda abortada: ejecutar `ROLLBACK` o cerrar
la conexión antes de reutilizar esa sesión. No intentar continuar con otro GRANT.

## Subconjunto aislado de Sofía: campañas y evidencia de entrega

```sh
node --test tests/security/supabase-compatibility-sofia-campaign.test.mjs
```

`aura-campaign-contract.mjs` prepara únicamente un **borrador fuera de línea**
para siete tablas y cinco funciones invoker del programador de campañas y sus
recibos. No es una migración, no completa la matriz de Sofía/NOVA ni está
autorizado para producción. Conserva permisos existentes más amplios. Sus
guardas comprueban firma, propietario, RLS y el hash exacto de cada una de las
cinco funciones contra `functionDefinitions`, una entrada obligatoria revisada
independientemente. No generar esos pins copiándolos sin revisión del mismo
catálogo que se intenta autorizar. La prueba los fija al crear su fixture
ficticio y luego altera una función real en PGlite para comprobar el rechazo.
El cambio de firma de esta herramienta es intencional: llamadas antiguas sin
pins fallan cerrado y deben renovarse, no recibir un valor automático.

```js
const plan = campaignGrantPlan(snapshot, { functionDefinitions: reviewedPins });
```

Las pruebas ejecutan los cuerpos SQL de dos migraciones verificadas por contenido,
con tablas mínimas y filas ficticias. Sustituyen únicamente el reloj por uno de
prueba; no instancian el Worker, PostgREST ni clientes de envío. Comprueban también
el permiso EXECUTE de un helper invocado indirectamente, los filtros de
consentimiento y la evidencia append-only. No prueban la reconstrucción completa
del esquema ni los demás procesos comerciales.

El reintento reconoce las ACL simples de columnas del rol `service_role`
otorgadas por `postgres`, sin opciones de delegación; añade solo las columnas
que faltan. Tras aplicar el plan, un reintento devuelve cero adiciones. También
puede continuar una aplicación interrumpida. La reversión usa el **plan original
conservado antes de aplicar**, no el nuevo plan vacío del reintento, y las pruebas
comprueban que conserva los permisos de columnas preexistentes tras commits
ficticios. No retira permisos más amplios ni modifica sus otorgantes.

ACL de otros roles/otorgantes o con opciones de delegación siguen requiriendo
revisión separada. También se rechaza añadir una autorización de tabla completa
si su retirada borraría permisos previos de columnas. El SQL de reversión aún
no incluye las guardas completas de deriva y concurrencia necesarias para
producción. No ejecutar este plan en un proyecto real ni interpretar sus pruebas
como certificación integral de AURA, del Worker o de PostgREST.

## Reversión general

Conservar el respaldo anterior de ACL de tabla, columna, secuencia, vista,
función, esquema y valores por defecto, incluidos propietario, otorgante y opción
de delegación. Verificar que el estado actual siga siendo el esperado antes de
revertir. Un `REVOKE SELECT ON tabla` también elimina SELECT de sus columnas:
la reversión debe reconstruir esas ACL a partir del respaldo, no solo retirar
el GRANT de tabla. Comparar permisos efectivos normalizando ACL nulas con
`acldefault`; no editar catálogos PostgreSQL para restaurar su representación
interna byte por byte.

Referencias oficiales:

- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/api/securing-your-api

El cambio del proveedor elimina concesiones automáticas futuras; no elimina
permisos de objetos ya existentes. No usar esta adaptación para abrir acceso
general a `anon`/`authenticated`, ni para retirar accesos existentes sin revisión.

## Reporte diario de presupuesto KORA: fuente recuperada y prueba acotada

```sh
node --test tests/security/supabase-compatibility-kora-budget.test.mjs
```

`tests/fixtures/supabase-compat/kora-budget-report.sql` es una copia **solo de
código, sin semillas ni filas operativas**, de la migración aplicada
`20261023181550_reporte_presupuesto_diario`. Su MD5 completo y las definiciones
nativas de las dos funciones se comprobaron contra metadatos reales el 25 de
octubre. No es una nueva migración ni una instrucción de replay. No se
incorporaron destinatarios reales, teléfonos, presupuestos, ventas ni saldos.

Las seis pruebas ejecutan ambos RPC invoker en PGlite con siete tablas previas
mínimas, dos tiendas ficticias y sin transporte de WhatsApp. Conservan primero
las huellas de las funciones nativas; sustituyen solamente `now()` en el
reservador por un reloj controlado para comprobar su horario y reintentos.
Cubren actualización de defaults conservando ACL anteriores de tablas y una
secuencia real de la fixture, y denegación de secuencias futuras, y reconstrucción de
este subconjunto sin permisos automáticos; los permisos explícitos de sus dos
nuevas tablas no sustituyen SELECT sobre las siete tablas previas. Se verifica
la dependencia EXECUTE entre los dos RPC, denegación de navegador, error atómico,
separación de resultados por tienda y retención de intentos ambiguos sin reenvío.

Los mínimos se ejercitan con columnas finitas de seis tablas previas y SELECT
de servicio sobre `ventas`: el `v.*` de la función original requiere también
columnas que no aparecen en el resultado final. La prueba lo demuestra con una
columna ficticia, no concede acceso a navegadores ni retira accesos existentes.
Las tablas nuevas ya declaran SELECT/INSERT/UPDATE de servicio en su fuente;
no hay una nueva concesión aplicada o propuesta para producción en esta unidad.

Las tablas previas de esta fixture son mínimas: no reproducen sus triggers,
políticas ni todos los consumidores del ERP. No se ejecuta un Worker, PostgREST,
cron ni envío. Estas pruebas no certifican el esquema completo, la entrega real
del informe ni la reversión de toda la adaptación. Ese trabajo sigue pendiente.

## Evidencia nativa del tarifario, 26 de octubre

`tests/fixtures/supabase-compat/tariff-native17-20261026/` contiene únicamente
metadatos de bases locales desechables, sin filas ni credenciales. Se instancia
el esquema nativo anonimizado y el espejo finito legado con roles y helpers Auth
originales; en reconstrucción se omiten exclusivamente los21grants no-owner
del target antes de aplicar el SELECT explícito. El autorizador nativo conserva
su hash independiente y consulta perfiles/operadores ficticios activos; no es
un stub de capacidad. El resto del esquema conserva ACL legadas y NO certifica
permisos mínimos globales. No se ejecutan otras migraciones históricas.

Las39comprobaciones incluyen actualización sin cambios de ACL ya existentes,
reconstrucción mínima de solo ese target, denegaciones a no revisores/inactivos,
metadata de cliente forjada, escrituras directas, guardas que abortan sin cambios
parciales y reversión posterior al commit con comparación completa del catálogo.
La reversión también rechaza una deriva ficticia ajena antes de retirar SELECT.
Las fuentes de pruebas de seguridad fijadas en el preflight siguen siendo acotadas a
este contrato; los casos HTTP previos y el resto de módulos requieren su propia
evidencia. El resultado offline no autoriza cambiar la rama o eludir el pipeline.
