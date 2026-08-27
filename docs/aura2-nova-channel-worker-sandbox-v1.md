# AURA 2 — NOVA Channel Worker Sandbox V1

Este componente prepara localmente la frontera de entrada de la nueva línea sin crear ni desplegar infraestructura.

```text
Meta (no conectado)
  -> Worker independiente (solo contrato local)
  -> validación de firma inyectable
  -> normalización mínima
  -> idempotencia por message_id
  -> AURA Channel Router
       -> NOVA
       -> CARTERA
       -> HUMAN
```

## Guardas activas

- Los mensajes reales están deshabilitados y el resultado siempre reporta `real_messages_sent: 0`.
- No existe cliente HTTP, token, `phone_number_id`, URL de Graph API ni configuración Wrangler.
- El Worker de Sofía no se importa ni se modifica.
- La verificación de firma es una dependencia obligatoria; una firma inválida se rechaza antes de procesar el contenido.
- La idempotencia evita procesar dos veces el mismo `message_id`.
- El módulo no persiste PII, payloads crudos ni secretos.

## Activación pendiente

La implementación real exige una fase separada y autorización explícita para crear infraestructura, configurar webhook, almacenar secretos corporativos y realizar pruebas con el número Meta. Este sandbox no autoriza ninguno de esos pasos.
