# NOVA: flujo completo para los tres aliados autorizados

Alcance exacto: Distritoys, Club Seven BM e Izzy Móvil, además de conservar las nueve tiendas propias actuales. Completa filtros de código/OTP, fotos, registro y recuperación, referencias, consultas de las tres plataformas y decisión. El gateway interno obtiene el enlace únicamente del comercio del actor autenticado. No habilita otros aliados ni acceso a KORA.

Seguridad: se conservan roles, RLS, ACL, propietario, security invoker/definer y search_path existentes. Los aliados ven solo sus expedientes en trámite. El cierre conserva un recibo mínimo temporal sin reabrir el cliente. No se exponen plataformas ni datos financieros al comercio.

Pruebas: 28, con datos ficticios. Incluyen Postgres aislado con funciones reales de reserva OTP, registro verificado, tres fotos, dos referencias, encolado/claim de tres consultas y decisión guardada; pruebas de regla restrictiva, comercio ajeno, cierre, tokens firmados, revocación e idempotencia. Las respuestas externas se simularon: no es una prueba de entrega real de SMS ni consulta real de clientes.

Despliegue: migración KORA en supabase/migrations; migración AURA en db-aura/supabase/migrations (proyecto distinto). Solo amplían listas exactas en diez funciones por proyecto y dos CHECK de KORA. Solo se modifica allowed_origins de la política SMS; conservar su hash del resto de la configuración. SET LOCAL lock_timeout 5s.

Luego ejecutar explícitamente provision-three-origins.sql contra KORA de producción. Es un script de datos aislado de las migraciones, atómico e idempotente, con validación de los nombres/contactos ya autorizados. Conserva enlaces activos y vendedores existentes. Para entradas nuevas utiliza nr1.id.HMAC del Worker; token_hash/sufijo son identificadores opacos sin token legado recuperable y nunca se emiten en registros. El sufijo se usa solo como identificación administrativa.

Publicar ambos Workers con versiones, preservando rutas/cron/bindings/secretos, y comprobar live-guard.py postflight. Validación posterior de metadatos SQL, CHECK, configuración SMS, miembros activos, enlaces/vendedores y opciones OTP sin enviar mensajes.

Rollback: no-op automático para datos. Ante fallo, parar publicación y revisar. Restaurar código previo mediante versiones y revisar definiciones capturadas antes de restaurar SQL. No borrar clientes, vendedores ni enlaces ni reactivar enlaces revocados. No reducir CHECK si ya existen expedientes con nuevos orígenes: requiere revisión manual de compatibilidad, sin eliminar sus datos.
