# AURA Finanzas

Worker independiente para entregar por WhatsApp los informes de inversión de las carteras **JA** y **Óscar**. No comparte lógica, cron, destinatarios ni secretos con NOVA/KORA.

## Flujo

1. La automatización genera el informe con las carteras JA y Óscar separadas.
2. Envía el resultado autenticado a `POST /dispatch`.
3. El Worker guarda el informe completo durante 45 días y crea un enlace privado no enumerable.
4. Envía la plantilla activa `sofia_informe_financiero` con el resumen y el enlace a ambos destinatarios.
5. KV `REPORT_STATE` evita duplicados por fecha y sesión.

## Pendientes antes de desplegar

- Confirmar que la plantilla activa `sofia_informe_financiero` (`es_CO`) continúa disponible en la WABA de AURA. Usa `{{1}}` para el nombre y `{{2}}` para resumen y enlace.
- Configurar secretos `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID` y `DISPATCH_TOKEN`.
- Conectar la automatización con `POST /dispatch`.
- Mantener `portfolios.json` actualizado después de cada operación.

No desplegar mientras el número nuevo continúe en estado pendiente en Meta.
