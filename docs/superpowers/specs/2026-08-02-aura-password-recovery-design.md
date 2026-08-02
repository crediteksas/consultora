# Recuperación de contraseña dentro de AURA

## Objetivo

Completar el acceso individual de Supabase Auth dentro de `https://registro.crediteksas.com/creditek/agentes/`, manteniendo una sola sesión para AURA y Portal B2B y sin modificar KORA.

## Experiencia

La misma página tendrá tres estados: inicio de sesión, solicitud de recuperación y creación/restablecimiento de contraseña. El login será claro, estilo macOS, con tarjeta blanca, fondo gris claro, identidad `AURA · by Creditek`, azul `#0B1E3D` y turquesa `#00C4CC`. Incluirá mostrar/ocultar contraseña, mensajes accesibles y diseño responsive.

## Flujo de recuperación

`Olvidé mi contraseña` solicita a Supabase `/auth/v1/recover` un correo con `redirect_to=https://registro.crediteksas.com/creditek/agentes/`. La respuesta visible será neutra para no revelar si el correo existe.

Al regresar, AURA procesará enlaces implícitos (`type=recovery|invite`, `access_token`, `refresh_token`) y PKCE (`code`). Los tokens se transforman en la sesión canónica `aura_supabase_session_v1`; luego la URL se limpia mediante `history.replaceState`. AURA muestra nueva contraseña y confirmación, valida mínimo 10 caracteres y coincidencia, llama `PUT /auth/v1/user`, limpia tokens y permite continuar con los permisos existentes.

## Seguridad

No se consultan ni muestran contraseñas. No se hardcodean credenciales. Los mensajes de recuperación son neutros. Un token inválido o vencido limpia el estado sensible y ofrece solicitar un enlace nuevo. Mayte y Andrea usan el mismo flujo de invitación. KORA conserva su autenticación separada.

## Verificación

Pruebas automatizadas cubrirán UI, recuperación, enlaces implícitos, PKCE, actualización, limpieza de URL, errores, permisos y aislamiento de KORA. En producción se verificará el aspecto visual, la redirección y la recepción del correo de Óscar. La creación de la nueva contraseña será completada por Óscar porque requiere una credencial privada.
