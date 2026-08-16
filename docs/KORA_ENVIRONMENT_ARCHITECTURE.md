# KORA Environment Configuration

Producto: KORA

Empresa: Creditek

Versión: 1.0.0

Estado: preparación implementada, sin consumidores ni conexiones activas

## Arquitectura actual

KORA es una aplicación HTML multipágina publicada como recursos estáticos. El
ERP y el portal de Agentes consumen proyectos Supabase cloud distintos. Las
URLs y claves públicas están declaradas directamente en archivos frontend, por
lo que un build local continúa apuntando a los destinos activos.

Los Workers tienen configuración independiente mediante Wrangler. No existe
Supabase CLI, proyecto local, staging, fixtures de sesión ni selección central
de entorno.

## Arquitectura objetivo

La configuración se dividirá en dos capas:

1. `config/kora-environment.js`: adaptador estable consumible por páginas HTML.
2. `window.__KORA_ENV__`: valores públicos inyectados durante build o preview.

El adaptador no contendrá valores reales. Validará la configuración antes de
entregarla y distinguirá:

- `development`;
- `staging`;
- `production`.

Esta fase crea el adaptador y sus contratos, pero no sustituye las constantes
actuales ni cambia conexiones activas.

La implementación se encuentra en `config/` y se valida con
`npm run test:config` y `npm run config:check`.

## Separación ERP y Agentes

Cada dominio mantiene una configuración independiente:

- ERP: Supabase URL y clave pública anon.
- Agentes: Supabase URL y clave pública anon.
- Workers: endpoint público por servicio.

Una configuración no puede reutilizar implícitamente credenciales del otro
dominio. La coincidencia de proyectos ERP y Agentes se rechazará fuera de los
casos expresamente permitidos por una futura decisión arquitectónica.

## Variables públicas requeridas

- `KORA_ENV`
- `KORA_ERP_SUPABASE_URL`
- `KORA_ERP_SUPABASE_ANON_KEY`
- `KORA_AGENTS_SUPABASE_URL`
- `KORA_AGENTS_SUPABASE_ANON_KEY`
- `KORA_CLIENTS_WORKER_URL`
- `KORA_GEMINI_WORKER_URL`
- `KORA_PDF_COMBINER_URL`
- `KORA_BOT_WORKER_URL`
- `KORA_AGENTS_AUTH_URL`
- `KORA_ENV_LABEL`

Nunca deben exponerse en frontend variables service role, claves privadas,
tokens administrativos o credenciales de proveedores.

## Flujo de promoción

### Development

Usa servicios locales o recursos sintéticos aislados. No puede apuntar a
destinos clasificados como producción.

### Staging

Usa proyectos cloud separados, esquema versionado y datos exclusivamente
sintéticos. El build debe fallar si encuentra un destino registrado como
productivo.

### Production

Usa únicamente configuración aprobada durante el proceso de despliegue. La
promoción debe partir del mismo artefacto validado o de una reconstrucción
reproducible con variables productivas protegidas.

## Guardas de seguridad

- Lista explícita de hosts productivos, almacenada sin claves.
- Rechazo de staging o development conectado a hosts productivos.
- Rechazo de claves con características de service role.
- Validación de variables obligatorias y URLs HTTPS.
- Separación obligatoria entre proyectos ERP y Agentes.
- Redacción de claves, tokens, IDs y URLs al construir mensajes de error.
- Escaneo de material sensible y credenciales hardcodeadas.
- Scripts administrativos en dry-run por defecto.
- Ejecución administrativa solo con entorno y proyecto objetivo explícitos.
- Confirmación adicional para cualquier destino productivo.

## Inventario externo resumido

| Conexión | Uso | Estado actual | Estrategia |
| --- | --- | --- | --- |
| Supabase ERP | Auth, datos ERP y almacenamiento | Cloud, fijada en frontend | Variables públicas ERP |
| Supabase Agentes | Sesión y datos de agentes | Cloud, fijada en frontend | Variables públicas Agentes |
| Worker Clientes | Registro y documentos | Cloud | Endpoint por entorno |
| Worker Gemini | Capacidades de IA | Cloud | Endpoint por entorno |
| PDF Combiner | Procesamiento de PDF | Cloud | Endpoint por entorno |
| Auth Agentes | Creación de sesión del portal | Cloud | Endpoint por entorno |
| APIs de Meta y Gemini | Integraciones especializadas | Workers/backend | Secretos solo en backend |
| Google Fonts y Lucide | Recursos visuales públicos | CDN fijado | Mantener versión y documentar disponibilidad |

El inventario detallado en `config/README.md` solo mostrará nombres de variables
y destinos enmascarados.

## Estado del esquema para staging

Disponible:

- migraciones aditivas recientes para caja, utilidad, proveedores y clientes;
- pruebas que describen parte de las reglas financieras;
- código frontend que evidencia tablas, vistas y RPC consumidos.

Parcial:

- funciones y políticas RLS incluidas en algunas migraciones;
- configuración de Workers;
- definición de permisos por rol.

Ausente:

- esquema base completo;
- historial completo de tablas, constraints, índices, vistas, funciones y
  triggers;
- políticas RLS completas;
- definición versionada de buckets y políticas de Storage;
- configuración reproducible de Supabase Auth;
- catálogos maestros mínimos neutros.

Staging requiere una extracción segura de esquema sin datos desde el proyecto
propietario, revisión y versionado antes de aplicar migraciones.

## Datos sintéticos

Se preparará un paquete no ejecutable marcado
`STAGING ONLY — DATOS SINTÉTICOS`, con:

- una tienda ficticia;
- perfiles ficticios de gerencia y tienda;
- referencias y productos ficticios;
- inventario, ventas y movimientos financieros ficticios;
- identificadores reservados claramente reconocibles.

No contendrá correos utilizables, teléfonos, documentos, nombres o transacciones
reales. La creación de usuarios Auth quedará como paso manual del propietario.

## Pasos manuales para crear staging

1. Crear proyectos cloud separados para ERP y Agentes.
2. Registrar sus hosts como staging, sin copiar claves productivas.
3. Exportar y revisar el esquema propietario sin filas.
4. Completar y versionar las definiciones faltantes.
5. Aplicar el esquema revisado en staging.
6. Configurar Auth y Storage manualmente según la definición aprobada.
7. Crear usuarios ficticios mediante el panel seguro de staging.
8. Cargar datos sintéticos mínimos.
9. Construir el preview con variables públicas de staging.
10. Ejecutar pruebas de aislamiento antes de validar visualmente.

## Estrategia de migración

1. Crear y probar el adaptador sin consumidores.
2. Aprovisionar staging.
3. Migrar primero una pantalla piloto en un commit aislado.
4. Comparar comportamiento y red con la versión anterior.
5. Migrar las otras dos pantallas piloto.
6. Validar navegación, autenticación, permisos y ausencia de tráfico productivo.
7. Migrar el resto de pantallas por grupos pequeños.

## Reversión

Mientras ninguna pantalla consuma el adaptador, revertir esta fase solo requiere
revertir su commit.

Durante la migración posterior, cada pantalla conservará un commit aislado. La
reversión será restaurar el consumidor anterior y reconstruir el artefacto. No
se eliminarán configuraciones ni proyectos hasta confirmar la estabilidad.

## Limitaciones

- Esta versión no crea ni configura servicios.
- No valida un staging real porque todavía no existe.
- No reconstruye el esquema ausente.
- No conecta las pantallas actuales.
- No sustituye controles de autorización o RLS.
