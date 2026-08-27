# AURA 2 — NOVA Authorization Conversation Sandbox V1

## Alcance certificado

NOVA atiende exclusivamente identidades internas ficticias autorizadas de Retail, Aliados, gestión de autorizaciones y administración. Una identidad desconocida se bloquea antes de consultar clientes y se deriva a atención humana.

El flujo sandbox cubre cliente existente, registro mínimo con consentimiento, historial CREDITEK, ventas Retail/Aliados, snapshot aislado de Cartera, PayJoy mediante el adaptador read-only existente y recomendación reversible. ALO, Addi y Krediya permanecen en `PENDING_ADAPTER`; el sistema no fabrica resultados.

## Separación entre señal y decisión

```text
GREEN  -> CONTINUE
YELLOW -> MANUAL_REVIEW
RED    -> DO_NOT_AUTHORIZE_WITHOUT_REVIEW
```

Estas salidas son recomendaciones. `final_decision` siempre permanece en `null`. Los casos que requieren intervención generan un `AuthorizationReviewCase` en estado `OPEN`; el sandbox no aprueba ni niega solicitudes.

## Pantallas AURA NOVA

1. Resumen
2. Solicitudes
3. Pendientes de revisión
4. Clientes
5. Validaciones
6. Historial
7. Configuración

## Seguridad y aislamiento

- Cero mensajes reales de WhatsApp.
- Cero webhook Meta productivo.
- Cero despliegues.
- Sofía no se importa ni se modifica.
- NOVA consume únicamente el contrato `CollectionsCustomerSnapshot`; no importa lógica interna de Cartera.
- Auditoría sin PII en metadata.
- PayJoy conserva su adaptador independiente y server-side.

Ejecutar el simulador con `npm run nova:conversation-demo`.
