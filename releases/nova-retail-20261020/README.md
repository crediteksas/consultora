# Piloto NOVA retail — 20 de octubre de 2026

Desplegado y activo exclusivamente para CK-01 a CK-09.

Panel: https://aura.crediteksas.com/creditek/agentes/nova-supervision.html

## Producción

- NOVA: `22a71f83-2aba-4bc9-843e-901ce3dc86d3`.
- Registro: `e04152ad-6988-4097-9488-75c69d7b0110`.
- Ambos con NOVA_RETAIL_ENABLED=true y exactamente CK-01..CK-09.
- Registro conserva los dos horarios de reportes previos y añade despacho cada cinco minutos; al completar documentos también despacha inmediatamente.
- NOVA conserva Durable Objects, canal de entrada y conexiones anteriores. Reconciliación cada minuto.
- Las claves quedan en secretos de Workers. Kora se consulta mediante el binding privado NovaRetailDatabaseGateway, con recurso y operación permitidos explícitamente. No se publica la clave.

## Flujo

Revisión de legibilidad por foto, instrucciones específicas, hasta cuatro intentos fallidos por foto; luego revisión manual. Fallo de IA también pasa a Andrea. No compara rostros ni autentica identidades con el modelo.

Dos referencias: familiar y personal, números distintos entre sí y del cliente. Invitación directa aprobada por WhatsApp. Diez minutos desde entrega confirmada; negativa exige reemplazar solo esa referencia. Respuestas contradictorias pasan a Andrea. Las negativas se conservan para auditoría y exclusión de contacto, no para cobranza.

Dos plataformas concluyentes de tres. Cero pagos confirmados en cualquier obligación activa rechaza durante quince días, sin excepción manual. Al día con algún pago permite continuar; una o dos vencidas requieren cuatro cuotas pagadas; más vencidas o información incompleta requieren Andrea. Aplica siempre la decisión más restrictiva. Vigencia quince días, renovación en la misma solicitud y reconsulta para entregar el celular.

Solo Andrea decide las revisiones con observación obligatoria, nombre y fecha. Óscar ve todas; cada tienda solo sus casos. La tienda no recibe motivos internos de rechazo. WhatsApp solo a tienda y Andrea; sin resultado al cliente.

## Límites comprobados

Los adaptadores actuales no siempre certifican cuotas pagadas. No se deducen de importes ni eventos. En esos casos no hay autorización automática: queda revisión de Andrea. Krediya sigue deshabilitada; no se considera una consulta correcta. No afirmar que todas las solicitudes se tramitarán automáticamente.

Se verificó en vivo el acceso de Óscar por Aura, listado, detalle, historial y visor privado de soportes. Los dos casos previos quedaron en revisión; no se crearon clientes ni se aprobaron créditos para probar. Meta aceptó los dos avisos a Andrea; aceptación no equivale a entrega.

## Pruebas

28 pruebas automatizadas del motor, fotos, sesión, aislamiento entre tiendas, gateway privado y plantillas. Dos pruebas integrales locales del Worker de registro y conservación de enlaces. Pruebas SQL con rollback: aprobación justificada, solo Andrea, dos referencias, rechazo cero pagos, quince días, cronómetro desde entrega y reemplazo sin perder la otra referencia. Se comprobó el reclamo de avisos con rol service_role y rollback.

Supabase Advisors: los nuevos objetos privados tienen RLS y sin políticas públicas intencionalmente; acceso exclusivo del servicio. No aparecieron avisos de seguridad nuevos de mayor nivel para estos objetos.

## Migraciones y construcción

Kora (`jfkmiyvcdfbsbwchyvol`): nuevas migraciones `20261020224427` a `20261020233947` en `supabase/migrations`, excepto las de Aura.
Aura (`ditiwpndvmyuqcagupea`): cuatro migraciones separadas en `migrations/aura`. Ya aplicadas; no ejecutarlas en Kora.

`form.html` y `retail-portal.html` son fuentes de interfaz. `build.mjs` genera los módulos incorporados. El Worker de registro se compone con `../nova-registro-repair-20261020` para preservar reportes y enlaces anteriores.

Despliegue: wrangler deploy --config releases/nova-retail-20261020/wrangler.jsonc; luego wrangler deploy --config releases/nova-retail-20261020/wrangler-clientes.jsonc.

## Reversión

Desactivar NOVA_RETAIL_ENABLED en ambos Workers para suspender el nuevo flujo. Conservar registros de auditoría y migraciones; no eliminar tablas ni carpetas. La versión anterior de registro era `82c6fa1c-8fa9-49c5-a24e-74b07b8c41c8`. El modo legacy=1 mantiene la vista anterior de conexiones. Cambios posteriores deben verificar la versión actualmente activa antes de reemplazarla.

Corrección de presentación: nombre oficial de origen obtenido de Kora para listado, búsqueda e identidad de tienda. Los códigos quedan solo como identificadores internos de autorización.
