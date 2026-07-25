# Automatización de alta de aliados — Plan de implementación

> **Subskill requerida para ejecutar:** usar `superpowers:executing-plans` si se trabaja en esta tarea de forma continua. Si el usuario solicita delegación explícita, usar `superpowers:subagent-driven-development`.

**Objetivo:** Cuando un ejecutivo complete correctamente el formulario de convenio, mantener intacta la creación actual de carpeta y documentos, registrar automáticamente la tienda y sus vendedores en las hojas maestras, crear o reutilizar un único enlace privado de registro por tienda y mostrar ese enlace listo para copiar.

**Arquitectura:** El Apps Script actual sigue siendo el coordinador del convenio y conserva el flujo documental existente. Después de crear el convenio, llama a un endpoint interno del Worker `creditek-clientes`; el Worker valida la petición, deriva de forma determinista un token opaco a partir del radicado, registra tienda, vendedores y hash del enlace mediante una operación atómica en Supabase, y devuelve el enlace. Apps Script actualiza las dos hojas maestras mediante upserts protegidos con bloqueo. El navegador recibe únicamente el enlace final, nunca secretos internos.

**Tecnologías:** HTML/JavaScript, Google Apps Script, Cloudflare Workers/TypeScript, Supabase/PostgreSQL, Google Sheets, Vitest.

---

## Contrato funcional que no puede cambiar

- El formulario de convenios sigue creando la carpeta y los documentos que ya crea hoy.
- El formato M3 y los documentos solicitados por las financieras no se modifican.
- Existe un solo enlace privado por tienda.
- Al abrir el enlace, la tienda queda fija y solo aparecen sus vendedores activos.
- Los vendedores nuevos se crean activos con tipo `TERCERO`.
- Un reintento con el mismo radicado devuelve el mismo enlace y no duplica tienda ni vendedores.
- Los enlaces existentes no se revocan ni se reemplazan silenciosamente.
- El token en texto completo no se almacena en Supabase.
- Las hojas maestras son:
  - Archivo `1pzO8hyVpbu-MCnDbEZA2ISxCkqmJrzVK82uV8jKRjYE`
  - Hoja `Links_Registro_Creditek`, gid `1846710786`
  - Hoja `VENDEDORES`, gid `1907429947`
- Si falla la automatización posterior a la creación documental, la respuesta conserva el radicado y permite reintentar sin volver a crear registros duplicados.

## Controles de seguridad

- El endpoint de aprovisionamiento es servidor a servidor y no publica CORS.
- Apps Script se autentica con `ALLY_PROVISION_SECRET`.
- La derivación del token usa otro secreto independiente: `ALLY_TOKEN_DERIVATION_SECRET`.
- El hash consultable del enlace continúa usando `TOKEN_HASH_SECRET`.
- Ningún secreto, token completo ni documento personal se escribe en logs.
- El Worker rechaza diferencias entre un enlace activo existente y el enlace reconstruido para el mismo radicado con HTTP 409; no regenera ni revoca.
- El navegador no recibe ni conoce los secretos de aprovisionamiento.

---

## Tarea 1: Capturar y versionar el Apps Script que realmente está desplegado

**Archivos:**

- Crear: `creditek/convenios/apps-script/Code.gs`
- Crear: `creditek/convenios/apps-script/appsscript.json`
- Crear: `creditek/convenios/apps-script/README.md`

**Pasos:**

- [ ] Abrir el proyecto de Apps Script vinculado al formulario de convenios que usa el endpoint terminado en `...BpQp5AmWUM/exec`.
- [ ] Confirmar qué hoja contiene el proyecto activo entre:
  - `Control Comercial Convenios`, ID `1UAmh1A9TnvoBKpAsdc9aQKEvGm36SanvNp5JcJXoFTA`
  - `Control Comercial Convenios · CREDITEK`, ID `1ts8VLSEUPMxv2_0BBlDIV5BizBZ7qSDYxO9w8xDajlM`
- [ ] Verificar el ID del despliegue, la versión activa, “ejecutar como” y quién tiene acceso.
- [ ] Exportar el código exacto y el manifiesto del proyecto activo a `creditek/convenios/apps-script/`.
- [ ] Revisar que el código exportado corresponda al flujo real de creación de carpeta, documentos y M3.
- [ ] Documentar en `README.md` el ID del proyecto, el ID de la hoja vinculada y el procedimiento de despliegue sin incluir secretos.
- [ ] Ejecutar:

```bash
rg -n "doPost|BpQp5AmWUM|DriveApp|SpreadsheetApp" creditek/convenios/apps-script
git diff --check
```

- [ ] Confirmar que el código local `creditek/portal/Code.gs` no se sustituye ni se mezcla con este proyecto.
- [ ] Crear commit:

```bash
git add creditek/convenios/apps-script
git commit -m "chore: versionar backend activo de convenios"
```

---

## Tarea 2: Crear primero la prueba SQL del aprovisionamiento atómico

**Archivos:**

- Crear: `creditek/erp/tests/smoke_test_alta_aliados_automatica.sql`

**Pasos:**

- [ ] Escribir una prueba transaccional que cree una tienda de prueba con dos vendedores y un hash ficticio.
- [ ] Comprobar que la primera llamada:
  - crea o activa `origenes` con `tipo = 'aliado'`;
  - crea dos `captadores` activos con `tipo = 'tercero'`;
  - crea un solo `enlaces_registro` de tienda, con `captador_id IS NULL`;
  - nunca contiene el token en texto completo.
- [ ] Repetir la llamada con el mismo código, vendedores y hash, y comprobar que no aumenta ningún conteo.
- [ ] Repetir con diferencias de mayúsculas, espacios y acentos en nombres de vendedores y comprobar la deduplicación normalizada.
- [ ] Intentar un segundo hash activo para la misma tienda y comprobar que la operación falla sin revocar el enlace actual.
- [ ] Ejecutar la prueba contra una base de pruebas antes de crear la migración y confirmar que falla porque la función aún no existe.

---

## Tarea 3: Implementar la migración SQL y dejarla idempotente

**Archivos:**

- Crear: `creditek/erp/migrations/20260724_alta_aliados_automatica.sql`
- Modificar: `creditek/erp/tests/smoke_test_alta_aliados_automatica.sql`

**Pasos:**

- [ ] Añadir validaciones previas de las columnas requeridas en `origenes`, `captadores` y `enlaces_registro`.
- [ ] Crear un índice único parcial que permita como máximo un enlace de tienda activo:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS enlaces_registro_un_enlace_tienda_activo_uidx
ON public.enlaces_registro (origen_codigo)
WHERE captador_id IS NULL
  AND activo = true
  AND revoked_at IS NULL;
```

- [ ] Crear `public.aprovisionar_aliado_registro(...)` como función `SECURITY DEFINER`, con `search_path` fijo.
- [ ] Recibir código, nombre comercial, vendedores JSON, hash y sufijo del token.
- [ ] Validar que el JSON sea un arreglo no vacío y que cada vendedor tenga nombre válido.
- [ ] Insertar o actualizar la tienda como aliado activo.
- [ ] Normalizar vendedores con `btrim`, espacios consecutivos y comparación sin distinguir mayúsculas; usar la misma regla compatible con el índice único existente.
- [ ] Insertar o reactivar vendedores con `tipo = 'tercero'` y `activo = true`.
- [ ] Bloquear la tienda durante la resolución del enlace.
- [ ] Reutilizar el enlace activo cuando su hash coincida.
- [ ] Crear el enlace cuando no exista ninguno activo.
- [ ] Lanzar una excepción identificable si ya existe otro hash activo.
- [ ] Devolver `codigo`, `link_id`, `enlace_creado` y cantidad de vendedores procesados.
- [ ] Revocar ejecución pública y concederla solo a `service_role`.
- [ ] Ejecutar en una base de pruebas:

```bash
psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 \
  -f creditek/erp/migrations/20260724_alta_aliados_automatica.sql
psql "$SUPABASE_TEST_DB_URL" -v ON_ERROR_STOP=1 \
  -f creditek/erp/tests/smoke_test_alta_aliados_automatica.sql
```

- [ ] Confirmar que la prueba termina con rollback y no deja datos.
- [ ] Crear commit:

```bash
git add creditek/erp/migrations/20260724_alta_aliados_automatica.sql \
  creditek/erp/tests/smoke_test_alta_aliados_automatica.sql
git commit -m "feat: aprovisionar aliados de forma atomica"
```

---

## Tarea 4: Escribir las pruebas del endpoint interno del Worker

**Archivos:**

- Crear: `creditek/workers/creditek-clientes/test/aliado-provision.spec.ts`

**Casos obligatorios:**

- [ ] Rechaza una petición sin secreto o con secreto incorrecto.
- [ ] Rechaza radicado, tienda, municipio, teléfono o vendedores inválidos.
- [ ] Acepta entre uno y cinco vendedores.
- [ ] Normaliza espacios y caracteres permitidos sin perder tildes en el nombre visible.
- [ ] Genera el mismo token para el mismo radicado y contexto.
- [ ] Genera códigos de tienda estables y resuelve colisiones con un sufijo derivado del radicado.
- [ ] Envía a Supabase únicamente `token_hash` y `token_sufijo`, nunca el token completo.
- [ ] Reutiliza un enlace existente cuando su hash coincide.
- [ ] Devuelve 409 cuando hay un enlace activo incompatible.
- [ ] Devuelve 503 cuando Supabase no está disponible.
- [ ] No expone detalles internos ni secretos en los errores.
- [ ] Ejecutar y comprobar que inicialmente falla:

```bash
cd creditek/workers/creditek-clientes
npm test -- aliado-provision.spec.ts
```

---

## Tarea 5: Implementar el aprovisionamiento seguro en el Worker

**Archivos:**

- Crear: `creditek/workers/creditek-clientes/src/aliado-provision.ts`
- Modificar: `creditek/workers/creditek-clientes/src/index.ts`
- Modificar: `creditek/workers/creditek-clientes/wrangler.toml`

**Interfaces:**

```ts
export interface AllyProvisionEnv extends RegistrationContextEnv {
  ALLY_PROVISION_SECRET: string;
  ALLY_TOKEN_DERIVATION_SECRET: string;
}

export interface ProvisionAllyRequest {
  radicado: string;
  nombre_comercial: string;
  municipio: string;
  responsable: string;
  telefono: string;
  ejecutivo: string;
  vendedores: Array<{ nombres: string; apellidos: string }>;
  enlace_existente?: string;
}

export interface ProvisionAllySuccess {
  ok: true;
  codigo: string;
  enlace: string;
  vendedores: number;
  enlace_creado: boolean;
}
```

**Pasos:**

- [ ] Implementar comparación de tiempo constante para `X-Creditek-Provision-Secret`.
- [ ] Limitar método a `POST` y tamaño del cuerpo a un máximo explícito suficiente para cinco vendedores.
- [ ] Validar y limpiar el contrato de entrada sin aceptar campos adicionales como fuente de autoridad.
- [ ] Crear un código de tienda legible a partir del nombre comercial; añadir un sufijo estable del radicado cuando sea necesario.
- [ ] Derivar un token base64url de 43 caracteres con HMAC-SHA-256 usando `ALLY_TOKEN_DERIVATION_SECRET`, el radicado y un contexto versionado.
- [ ] Calcular `token_hash` mediante HMAC con `TOKEN_HASH_SECRET`.
- [ ] Si llega `enlace_existente`, extraer el token, verificar su dominio/ruta y comprobar que su hash coincide.
- [ ] Llamar a la RPC `aprovisionar_aliado_registro` con la llave de servicio.
- [ ] Traducir la excepción de enlace incompatible a HTTP 409.
- [ ] Traducir indisponibilidad de Supabase a HTTP 503 sin incluir mensajes internos.
- [ ] Construir el enlace público desde el token solo en memoria.
- [ ] Registrar la ruta `POST /api/interno/aliados/aprovisionar` antes del 404 general.
- [ ] No añadir encabezados CORS a esta ruta.
- [ ] Documentar en `wrangler.toml`, solo como nombres de secretos:
  - `ALLY_PROVISION_SECRET`
  - `ALLY_TOKEN_DERIVATION_SECRET`
- [ ] Ejecutar:

```bash
cd creditek/workers/creditek-clientes
npm test -- aliado-provision.spec.ts
npm test
npm run typecheck
```

- [ ] Crear commit:

```bash
git add creditek/workers/creditek-clientes/src/aliado-provision.ts \
  creditek/workers/creditek-clientes/src/index.ts \
  creditek/workers/creditek-clientes/test/aliado-provision.spec.ts \
  creditek/workers/creditek-clientes/wrangler.toml
git commit -m "feat: agregar alta interna segura de aliados"
```

---

## Tarea 6: Probar primero las reglas de actualización de las hojas maestras

**Archivos:**

- Crear: `creditek/convenios/apps-script/Provisioning.gs`
- Crear: `creditek/convenios/apps-script/test/Provisioning.test.mjs`

**Pasos:**

- [ ] Crear un arnés Node que cargue `Provisioning.gs` en un contexto controlado y reemplace `SpreadsheetApp`, `LockService`, `PropertiesService` y `UrlFetchApp` por dobles de prueba.
- [ ] Probar que `normalizarNombre_` elimina espacios duplicados y compara sin distinguir mayúsculas.
- [ ] Probar que `upsertLinksRow_`:
  - inserta una tienda nueva;
  - actualiza la misma tienda por código;
  - conserva una fila única;
  - escribe el enlace devuelto por el Worker.
- [ ] Probar que `upsertVendedores_`:
  - inserta una fila por tienda y nombre normalizado;
  - asigna `TERCERO`;
  - asigna `SÍ`;
  - deja enlace personal y observaciones vacíos;
  - actualiza sin duplicar.
- [ ] Probar que un segundo procesamiento del mismo radicado no duplica filas y devuelve el mismo enlace.
- [ ] Probar que el bloqueo se libera incluso ante una excepción.
- [ ] Ejecutar y confirmar que las pruebas de comportamiento aún no implementado fallan:

```bash
node --test creditek/convenios/apps-script/test/Provisioning.test.mjs
```

---

## Tarea 7: Integrar el aprovisionamiento en el Apps Script sin alterar documentos

**Archivos:**

- Modificar: `creditek/convenios/apps-script/Code.gs`
- Modificar: `creditek/convenios/apps-script/Provisioning.gs`
- Modificar: `creditek/convenios/apps-script/README.md`
- Modificar: `creditek/convenios/apps-script/test/Provisioning.test.mjs`

**Funciones:**

```js
function aprovisionarAliado_(payload, enlaceExistente) {}
function actualizarHojasMaestras_(payload, provision) {}
function upsertLinksRow_(sheet, payload, provision) {}
function upsertVendedores_(sheet, payload, provision) {}
function normalizarNombre_(value) {}
function obtenerEnlaceExistente_(sheet, codigo) {}
```

**Pasos:**

- [ ] Leer propiedades:
  - `ALLY_PROVISION_URL`
  - `ALLY_PROVISION_SECRET`
  - `LINKS_SPREADSHEET_ID`
- [ ] Ejecutar primero el flujo documental existente sin modificar sus llamadas ni nombres de carpetas.
- [ ] Tras el éxito documental, adquirir `LockService.getScriptLock()` para la reconciliación de hojas.
- [ ] Buscar por código de tienda si ya hay enlace y enviarlo al Worker como `enlace_existente`.
- [ ] Llamar al endpoint interno desde `UrlFetchApp` con el secreto en encabezado.
- [ ] Validar de forma estricta la respuesta del Worker.
- [ ] Abrir el archivo maestro por ID.
- [ ] Detectar columnas por sus encabezados, no por posiciones rígidas.
- [ ] Hacer upsert en `Links_Registro_Creditek` por código.
- [ ] Hacer upsert en `VENDEDORES` por código de tienda y nombre normalizado.
- [ ] Mantener activos los vendedores recibidos, sin desactivar automáticamente vendedores que no estén en el formulario.
- [ ] Devolver al navegador:

```json
{
  "ok": true,
  "radicado": "valor-estable",
  "enlaceRegistro": "https://registro.crediteksas.com/creditek/erp/registro?t=token"
}
```

- [ ] Si falla el aprovisionamiento después de crear documentos, devolver `ok: false`, el radicado y un mensaje que indique que los documentos quedaron creados pero el enlace necesita reintento.
- [ ] No registrar el payload completo, cédulas, documentos, secreto ni enlace completo.
- [ ] Ejecutar:

```bash
node --test creditek/convenios/apps-script/test/Provisioning.test.mjs
git diff --check
```

- [ ] Crear commit:

```bash
git add creditek/convenios/apps-script
git commit -m "feat: sincronizar aliados y vendedores desde convenios"
```

---

## Tarea 8: Mostrar el enlace listo para copiar en el formulario

**Archivos:**

- Modificar: `creditek/convenios/index.html`
- Crear: `creditek/convenios/test/convenio-success.spec.mjs`

**Pasos:**

- [ ] Escribir una prueba DOM para una respuesta exitosa con `enlaceRegistro`.
- [ ] Comprobar que la prueba exige:
  - enlace visible;
  - botón `Copiar enlace`;
  - confirmación `Enlace copiado`;
  - ausencia de construcción de tokens en el navegador.
- [ ] Comprobar el estado de error parcial con radicado visible y sin afirmar que el enlace está listo.
- [ ] Implementar un bloque de éxito accesible con campo de solo lectura y enlace clicable.
- [ ] Implementar copia con `navigator.clipboard.writeText`.
- [ ] Añadir alternativa basada en selección/copia para navegadores donde Clipboard API no esté disponible.
- [ ] Mantener el diseño móvil y la confirmación actual del convenio.
- [ ] Ejecutar:

```bash
node --test creditek/convenios/test/convenio-success.spec.mjs
git diff --check
```

- [ ] Crear commit:

```bash
git add creditek/convenios/index.html \
  creditek/convenios/test/convenio-success.spec.mjs
git commit -m "feat: mostrar enlace de tienda al crear convenio"
```

---

## Tarea 9: Aplicar cambios en producción en orden reversible

**Archivos:**

- Modificar: `creditek/convenios/apps-script/README.md`
- Crear: `docs/operations/alta-aliados-rollout-2026-07-24.md`

**Pasos:**

- [ ] Registrar versiones actuales del Worker, Apps Script y página estática antes de desplegar.
- [ ] Aplicar la migración SQL en Supabase y guardar evidencia de:
  - función creada;
  - índice único activo;
  - permisos limitados a `service_role`.
- [ ] Configurar los secretos del Worker mediante entrada interactiva:

```bash
cd creditek/workers/creditek-clientes
npx wrangler secret put ALLY_PROVISION_SECRET
npx wrangler secret put ALLY_TOKEN_DERIVATION_SECRET
```

- [ ] Desplegar el Worker:

```bash
cd creditek/workers/creditek-clientes
npm run deploy
```

- [ ] Probar que el endpoint rechaza una llamada sin secreto y no contiene CORS público.
- [ ] Configurar en Apps Script Properties:
  - `ALLY_PROVISION_URL=https://creditek-clientes.comercial-853.workers.dev/api/interno/aliados/aprovisionar`
  - `ALLY_PROVISION_SECRET` con el mismo valor configurado interactivamente en Worker
  - `LINKS_SPREADSHEET_ID=1pzO8hyVpbu-MCnDbEZA2ISxCkqmJrzVK82uV8jKRjYE`
- [ ] Crear una nueva versión de Apps Script manteniendo la configuración actual de ejecución y acceso.
- [ ] Actualizar el endpoint del frontend solo si Apps Script genera una URL de despliegue diferente.
- [ ] Publicar `creditek/convenios/index.html` mediante el flujo Cloudflare/GitHub ya usado por el sitio.
- [ ] Documentar IDs de versiones y hora de despliegue, sin secretos, en `docs/operations/alta-aliados-rollout-2026-07-24.md`.

---

## Tarea 10: Prueba integral controlada y verificación de no duplicación

**Pasos:**

- [ ] Crear un convenio de prueba claramente identificado, con una tienda y dos vendedores autorizados.
- [ ] Verificar que siguen creándose la carpeta, documentos y M3 exactamente como antes.
- [ ] Verificar en Supabase:
  - un origen aliado activo;
  - dos vendedores activos;
  - un enlace activo de tienda;
  - ningún token en texto completo.
- [ ] Verificar en `Links_Registro_Creditek` una sola fila con tienda, ciudad, responsable, teléfono, ejecutivo y enlace.
- [ ] Verificar en `VENDEDORES` dos filas, tipo `TERCERO`, activo `SÍ`, sin enlace personal.
- [ ] Abrir el enlace en una sesión privada y comprobar:
  - tienda fija correcta;
  - solo los dos vendedores activos;
  - ningún otro aliado visible.
- [ ] Reprocesar exactamente el mismo radicado.
- [ ] Confirmar el mismo enlace y los mismos conteos en Supabase y Sheets.
- [ ] Registrar evidencia sanitizada y resultado de cada control en el documento de despliegue.
- [ ] Ejecutar la batería final:

```bash
cd creditek/workers/creditek-clientes
npm test
npm run typecheck
cd ../../..
node --test creditek/convenios/apps-script/test/Provisioning.test.mjs
node --test creditek/convenios/test/convenio-success.spec.mjs
git diff --check
git status --short
```

---

## Tarea 11: Reversa y cierre

**Pasos:**

- [ ] Si falla el Worker, volver a la versión anterior desde Cloudflare; el endpoint nuevo es aditivo y las rutas actuales permanecen iguales.
- [ ] Si falla Apps Script, seleccionar el despliegue anterior; el flujo documental queda disponible en su versión previa.
- [ ] Si falla la página, desplegar el commit estático anterior.
- [ ] No eliminar automáticamente tiendas, vendedores o enlaces creados durante una prueba fallida; revisarlos por radicado antes de cualquier corrección.
- [ ] Mantener la migración SQL si solo se revierte la interfaz, porque el índice y la RPC son aditivos; revertir la función únicamente mediante una migración nueva y revisada.
- [ ] Confirmar que no existen secretos o tokens completos en git:

```bash
rg -n "ALLY_PROVISION_SECRET\s*=|ALLY_TOKEN_DERIVATION_SECRET\s*=|Bearer [A-Za-z0-9_-]{20,}" \
  creditek docs --glob '!node_modules/**'
```

- [ ] Crear commit de documentación final:

```bash
git add docs/operations/alta-aliados-rollout-2026-07-24.md \
  creditek/convenios/apps-script/README.md
git commit -m "docs: registrar despliegue de alta automatica de aliados"
```

## Criterios de aceptación finales

- Un convenio exitoso conserva toda la documentación actual.
- La tienda aparece una sola vez en la hoja de enlaces.
- Cada vendedor aparece una sola vez en la hoja de vendedores.
- Se crea o reutiliza exactamente un enlace por tienda.
- El enlace solo muestra vendedores activos de esa tienda.
- Mayte puede copiar el enlace desde la confirmación final.
- Repetir el mismo radicado no cambia el enlace ni duplica información.
- Fallas parciales son recuperables por radicado.
- Los secretos y tokens completos no quedan en Supabase, Sheets, repositorio ni logs.
- Las rutas actuales del ERP, Sofía y los demás agentes permanecen sin cambios.
