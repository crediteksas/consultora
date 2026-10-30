# NOVA · SMS excepcional para verificar el celular del cliente

Candidato local, sin publicación, compra, cuenta nueva, llave SMS ni mensajes reales.
96 pruebas aprobadas (42 servidor/proveedor/integración, 21 UI, 28 SQL nativo y 5
carreras de dos conexiones). La suite SQL también pasó 28/28 en PGlite. La base
anterior pasó 8 comprobaciones en Chrome real; el delta de permiso dinámico por
celular está cubierto por 21 pruebas VM, sin afirmar una nueva prueba Chrome.
Óscar autorizó compartir este paquete con Claude, que aprobó el candidato base
sin P1/P2 y reejecutó 55 pruebas. También aprobó el ajuste final de piloto,
reejecutó 42 pruebas de servidor y 21 de UI, verificó hashes y configuración.
Revisó fuentes y recibos SQL, sin reejecutar esas pruebas; las 28 nativas y las
5 carreras fueron ejecutadas por el agente de pruebas. Véase claude-review-final.md.
WhatsApp sigue siendo el botón principal. «No tengo WhatsApp: recibir código por
SMS» aparece únicamente con el feature flag del Worker, llave válida y policy SQL
habilitados para el enlace. No cambia invitaciones a referencias ni su consentimiento.

## Costo y elección provisional

Para uso ocasional elegiría Inalambria Express Starter 500: **19.500 COP con IVA,
500 mensajes de 39 COP, sin vencimiento ni mensualidad**. Es la menor recarga local
completa que pudimos verificar entre los proveedores comparados. No es el menor
precio unitario ni una prueba de ser el proveedor más barato de todo el mercado.

LabsMobile publica Colombia a **0,0019 EUR/SMS**, compra mínima **9 EUR o 10 USD**,
vigencia **18 meses**. Puede resultar más económico con uso constante; falta el
costo final en COP con cambio/impuestos del checkout. Hablame anuncia 6 COP sujeto
a volumen mensual mínimo no publicado; recarga mínima detallada de 50.000 COP.
Véanse `research.md` y `research-additional.md` con fuentes primarias y condiciones.

El piloto comienza cerrado: modo `pilot`, lista de teléfonos vacía y SMS apagado.
Solo después de autorización administrativa se habilita **un único teléfono**,
un origen y **1 reserva SMS al día, 1 al mes y 39 COP**. Otro celular es rechazado
en SQL antes de crear OTP o ledger, aunque ignore la UI. La capacidad pública no
expone la lista: devuelve solo un booleano para el celular consultado.
Una ampliación administrativa requiere nuevo permiso explícito; conserva todos
los intentos y su costo reservado, incluido un fallo, sin reiniciar contadores.

Tras validar el piloto y autorizar `mode=active`, los máximos de operación son
**10 reservas SMS al día, 100 al mes y 3.900 COP al mes**.
Comprar el paquete de 19.500 es un desembolso distinto del consumo máximo mensual
de 3.900. A100/mes dura5meses; si el uso es menor el saldo se conserva. Reservas
fallidas o inciertas retienen su presupuesto, no hay recargas ni reintentos automáticos.
La tarifa de reserva está fijada en39; si el proveedor reporta mayor costo, se
registra lo real y se bloquean nuevos SMS hasta revisión administrativa.

## Medición

`nova_client_otp_metrics(p_from,p_to)` es service_role exclusivamente. Por cohorte
de fecha de reserva y canal informa intentos únicos, aceptados por proveedor,
fallidos, inciertos, todavía reservados, códigos verificados, presupuesto reservado
y costo reportado (con cantidad de costos efectivamente informados).

Evaluar: proporción de solicitudes SMS frente a WA gestionado, verificados/aceptados,
presupuesto reservado/verificados y fallos+inciertos. No se registran teléfonos ni
cédulas en este informe agregado. Con1–9 casos la muestra será insuficiente para
afirmar fiabilidad por operador; comprobar recepción y validación en un piloto
humano autorizado antes de ampliar. Al llegar a25 intentos o30días, usar el consumo
observado para comparar el costo total de mantener Express frente a LabsMobile.

Aceptado/encolado no significa entregado o leído. La API Express documentada no
expone DLR individual de operadora; no se inventa esa métrica. Una verificación
correcta sí confirma que el código correcto llegó a la persona que lo introdujo.
No hay duración de verificación inferida a partir de un booleano sin timestamp.

## Integración y límites de seguridad

`managed-otp.mjs` comparte la reserva entre WA seguro y SMS cuando NOVA_SMS_ENABLED
es true. Cada intento lleva UUID durable; repetirlo nunca autoriza otro envío.
Primero contexto/Turnstile/configuración, después hash y reserva, y solo entonces
transporte. Comprobar TTL y costo reservado antes de gastar. Respuesta ambigua de
reserva, proveedor o persistencia = incierto: consultar el mismo UUID, sin reenviar.
Ausencia momentánea en status tampoco demuestra que una reserva en vuelo no vaya
a confirmar; mantiene incertidumbre y requiere conciliación si nunca aparece.

El bloqueo del servidor cubre cualquier OTP vigente del mismo celular, incluso
WA antiguo marcado FAILED por su helper booleano. Cinco minutos de espera evitan
usar un timeout como pretexto para duplicar por SMS. Un trigger aditivo cubre el
caller WA viejo en vuelo, incluso si se pausa la policy después de reservar SMS.
No almacena código SMS en texto: reutiliza el hash y el verificador seguro original.
Estado accepted requiere ID del proveedor; uncertain no altera aceptación ni fallo.

La producción actual mantiene ALLOW_LEGACY_REGISTRATION_LINKS=true. Se conserva.
Las dos copias de verify y registro legado quedan limitadas a OTP sin codigo_hash
ni enlace_registro_id. Así no gastan intentos de un SMS seguro ni reutilizan su
verificación para un registro sin sesión. El envío WA plaintext previo conserva
su handler/body; Request.clone evita consumir el body que ese handler necesita.

El constructor fija el SHA del Worker real inspeccionado y verifica8anclajes.
Verificador seguro, hash, sesiones, recuperación, siembra de fotos, consentimientos,
envío a NOVA, AI, reportes y cron siguen sus implementaciones originales. El HTML
conserva nodos File, objetos File, campos y cachés al cambiar de canal. El permiso
SMS se reconsulta por celular con 350 ms de espera y protección de respuestas
antiguas. Perder ese permiso oculta SMS pero mantiene el intento gestionado,
su UUID, consulta y verificación; no vuelve al flujo legado en medio de un envío.
No inventa sesión al detectar un OTP ya verificado en otra pestaña: indica
continuar allí.

## Archivos y validación

- `production-base.mjs`, `form-base.html`: dos módulos reales descargados antes de modificar.
- `build.mjs`:8anclajes, bundle completo `index.mjs` y mismo HTML externo/embebido.
- `managed-otp.mjs`, `inalambria-express.mjs`: servidor y transporte sin efecto al importar.
- `../../supabase/migrations/20261030165534_nova_client_sms_otp_budget.sql`: migración CLI, deshabilitada inicialmente, RLS y SECURITY INVOKER.
- `sql-tests/`, `ui-tests/`: pruebas reproducibles con datos ficticios; recibos de PG nativo y Chrome real.
- `wrangler.jsonc`: 30 bindings actuales conservados, 1 flag nuevo=false; secretos heredados por nombre, nunca incluidos. Mantiene 3 cron, AI, rate limit y 2 servicios actuales. `build.mjs` genera `deploy/` con solo index y form, idénticos a la raíz; Wrangler no adjunta fixtures, bases ni pruebas. `baseline-settings-sanitized.json` contiene solo nombres/tipos para 12 secretos y permite cotejar los demás valores; `verify-package.mjs` comprueba el paquete sin red.

```sh
node releases/nova-client-sms-20261030/build.mjs
node --experimental-vm-modules --test releases/nova-client-sms-20261030/*.test.mjs
node --test releases/nova-client-sms-20261030/ui-tests/form-candidate.test.mjs
```

El harness SQL usa PGlite ya instalado o PostgreSQL nativo aislado. Las pruebas
nativas usaron PostgreSQL17.11 local, sin red, puertos publicados, datos reales ni
montajes del Mac; 28 casos funcionales y 5 carreras de dos conexiones. No son pruebas
contra producción. No ejecutar tests con un DSN remoto.

## Activación pendiente de aprobación concreta

1. Claude revisa código, migración y pruebas; commit local del paquete aprobado.
2. Óscar autoriza push/publicación según REGLAS.md, y el gasto concreto de19.500COP
   si elige Express; definir un número propio autorizado para prueba de recepción.
3. Antes de aplicar, refrescar código/configuración/esquema; abortar ante drift.
4. Aplicar solo esta migración por el flujo de migraciones existente, verificar RLS,
   privilegios y policy deshabilitada. No `db push` indiscriminado de migraciones históricas.
5. Cuenta/recarga autorizadas; guardar llave solo como secret del Worker. Ningún
   secreto en navegador, Git, chat o recibos. No delegar el OTP al proveedor.
6. Publicar este Worker con SMS inicialmente apagado; verificar bytes/settings,
   rutas públicas sin enviar códigos,3cron y30bindings previos, sesiones/fotos.
7. Configurar en policy el único teléfono propio autorizado, un solo origen y los
   topes 1/día, 1/mes, 39 COP en modo `pilot`. Luego habilitar policy y flag por separado.
   Envío humano explícito; comprobar 1 cargo, recepción y verificación.
8. Solo tras ese resultado y otro OK ampliar a `mode=active`, caps autorizados y
   los orígenes aplicables dentro CK-01…CK-09.

No existe aún autorización de gasto ni una prueba real de recepción. La aprobación
de código no equivale a SMS activo. Para pausa, deshabilitar policy primero (WA
gestionado sigue funcionando); no borrar filas ni liberar reservas inciertas.
