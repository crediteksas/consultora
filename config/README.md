# KORA Environment Configuration — KORA v3.1

Producto: KORA

Empresa: Creditek

Versión productiva oficial: `3.1.0`. El único despliegue autorizado se ejecuta
con `npm run deploy:kora:production`.

Esta infraestructura prepara configuraciones separadas para `development`,
`staging` y `production`. Las pantallas ERP consumen exclusivamente el
artefacto generado mediante `window.__KORA_ENV__`.

## Archivos

- `production-endpoints.js`: única fuente de verdad de hosts productivos.
- `kora-environment.js`: validación e instalación de configuración pública.
- `kora-environment.example.js`: ejemplo estático sin credenciales reales.
- `admin-script-guard.mjs`: guardas para herramientas administrativas.
- `staging-data.example.json`: diseño no ejecutable de datos sintéticos.
- `version.json`: versión formal del componente.
- `CHANGELOG.md`: cambios por versión.

## Variables públicas

Solo estas variables pueden formar parte de `window.__KORA_ENV__`:

- `KORA_ENV`
- `KORA_VERSION`
- `KORA_ENV_LABEL`
- `KORA_ERP_SUPABASE_URL`
- `KORA_ERP_SUPABASE_ANON_KEY`
- `KORA_AGENTS_SUPABASE_URL`
- `KORA_AGENTS_SUPABASE_ANON_KEY`
- `KORA_CLIENTS_WORKER_URL`
- `KORA_GEMINI_WORKER_URL`
- `KORA_PDF_COMBINER_URL`
- `KORA_BOT_WORKER_URL`
- `KORA_AGENTS_AUTH_URL`

Las claves públicas anon permiten identificar el proyecto y no sustituyen RLS.
Nunca deben añadirse al frontend credenciales administrativas, claves privadas,
tokens de proveedores, contraseñas, secretos de firma o claves de despliegue.

## Generación

El generador no carga automáticamente archivos `.env`. Las variables deben
estar presentes en el entorno controlado que ejecuta el comando.

### Development

Copiar `.env.example` a un archivo local ignorado por Git, completar únicamente
valores públicos de recursos locales aislados y exportarlos en la terminal.

```bash
npm run config:generate
```

El archivo queda en `config/generated/kora-environment.js` y no se versiona.
Development permite HTTP solamente para `localhost`, `127.0.0.1` o `::1`.

### Staging

Definir las variables públicas de los proyectos aislados y ejecutar:

```bash
npm run build:environment
```

Esto genera la configuración temporal ignorada por Git, construye el artefacto
y valida `public/config/kora-environment.generated.js`. El proceso falla si falta una variable,
ERP y Agentes usan el mismo origen o alguna URL coincide con un host productivo.

### Production

El propietario debe inyectar las variables públicas desde el sistema seguro de
build. El mismo comando genera el archivo. Los secretos de Workers permanecen
en Wrangler Secrets o en el proveedor correspondiente y nunca pasan a
`window.__KORA_ENV__`.

## Validación

```bash
npm run test:config
npm run config:check
```

Para demostrar que staging no alcanza producción:

1. Ejecutar el generador con `KORA_ENV=staging`.
2. Confirmar que cualquier host registrado en `production-endpoints.js` aborta.
3. Inspeccionar la pestaña Network durante el preview.
4. Verificar que ningún request resuelva hacia los hosts productivos.
5. Confirmar que ERP y Agentes usan proyectos distintos.

## Reversión

Esta fase no tiene consumidores, así que revertir el commit elimina la
infraestructura sin cambiar conexiones activas.

En una integración posterior:

1. Retirar la referencia al archivo generado en la pantalla migrada.
2. Restaurar la constante anterior mediante el commit aislado de esa pantalla.
3. Ejecutar el build normal.
4. Confirmar que no se publica `public/config/kora-environment.generated.js`.

## Salud del proyecto ERP

La comprobación pública del proyecto usa únicamente endpoints operativos:

```bash
npm run health:kora
```

- Auth: `/auth/v1/settings`.
- REST/RLS: consulta de `perfiles` con `limit=0`.
- RPC: llamada anónima segura a `es_central`.

`GET /rest/v1/` no se usa como health check porque corresponde al esquema
OpenAPI y puede exigir una clave privilegiada aunque Auth, RLS y RPC estén sanos.

## Inventario de conexiones

Los destinos se muestran enmascarados. La clasificación “producción aparente”
se basa en que el código productivo actual los consume o Wrangler los declara
como `production`.

| Conexión | Archivos principales | Propósito | Credencial | Hardcodeada | Clasificación | Riesgo y externalización |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase ERP `jfk***.supabase.co` | `sidebar.js`, páginas ERP, Workers Clientes | Auth, datos y Storage ERP | anon pública en frontend; administrativa en Worker/script | Sí | Producción aparente | Separar URL/anon por entorno; administrativa solo backend |
| Supabase Agentes `dit***.supabase.co` | `agentes/index.html`, Respuestas, Calendario | Sesión y datos de agentes | pública/sesión | Sí | Producción aparente | Variables Agentes independientes |
| Worker Clientes `cre***-clientes…` | `registro.html`, Worker Clientes | Registro y documentos | endpoint público; secretos en Worker | Sí | Producción aparente | `KORA_CLIENTS_WORKER_URL` |
| Worker Gemini `cre***-gemini…` | agentes y Worker Gemini | IA e imágenes | endpoint público; GCP/Gemini backend | Sí | Producción aparente | `KORA_GEMINI_WORKER_URL`; secretos solo Worker |
| Worker Bot `cre***-bot…` | Respuestas y Meta Ads | Integración de agentes | endpoint público | Sí | Producción aparente | Añadir variable específica cuando se migre ese agente |
| PDF Combiner | Worker PDF | Composición de documentos | endpoint público | Configuración Worker | Producción aparente | `KORA_PDF_COMBINER_URL` |
| Auth Agentes | `agentes/index.html` | Crear sesión del portal | endpoint público y sesión | Sí | Producción aparente | `KORA_AGENTS_AUTH_URL` |
| Meta Graph | portal, Clientes y agentes | WhatsApp, Messenger y Ads | tokens privados | Parcial | Producción aparente | Mantener llamadas privilegiadas en Workers |
| Anthropic/OpenAI | agentes | Texto e IA | claves privadas | Existen referencias frontend | Producción aparente | Mover toda llamada autenticada a Workers |
| Google Vertex/AI Studio | Worker Gemini | Modelos e identidad federada | credenciales GCP | Worker | Producción aparente | Wrangler Secrets/WIF por entorno |
| Apps Script | portal y convenios | Integraciones heredadas | URL ejecutable | Sí | Producción aparente | Endpoint por entorno o reemplazo backend |
| Turnstile | registro/Clientes | Protección antiabuso | site key pública; secreto Worker | Sí | Producción aparente | Variables separadas por entorno |
| CDNs y fuentes | HTML, Design System | Librerías, Lucide y tipografía | ninguna | Sí | Público compartido | Versiones fijadas y política CSP |

## Script `crear_admins.mjs`

El script ahora:

- usa dry-run por defecto;
- exige entorno, URL y proyecto objetivo;
- exige repetir el identificador del proyecto;
- bloquea hosts productivos desde entornos no productivos;
- bloquea production salvo `--allow-production`;
- exige `--confirm-production=KORA_PRODUCTION_ADMIN_WRITE`;
- solo solicita la credencial administrativa después de superar las guardas;
- evita mostrar nombres o correos durante el progreso.

Ejemplo seguro sin escrituras:

```bash
node creditek/erp/scripts/crear_admins.mjs \
  --environment=staging \
  --target-url=https://erp-staging.example.invalid \
  --target-project=erp-staging \
  --confirm-project=erp-staging \
  --dry-run
```

No ejecutar `--execute` hasta que el propietario haya revisado proyecto,
entorno, usuarios objetivo y rollback.

## Material histórico sensible

Git conserva una ruta histórica con forma
`.env[REDACTED_CREDENTIAL_LIKE_SUFFIX]`. El archivo no está presente ni
rastreado en el árbol actual, pero su nombre pudo contener una clave.

Recomendación separada:

1. Identificar el proveedor de la clave sin imprimirla.
2. Comprobar su estado desde el panel del proveedor.
3. Rotarla o revocarla.
4. Revisar accesos y uso histórico.
5. Planificar limpieza de historia únicamente con autorización y coordinación
   de todos los clones.
