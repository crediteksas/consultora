# AURA 2 — Nueva línea y Channel Router Sandbox V1

## Inventario seguro de la línea

No existe en el repositorio metadata verificable de una nueva línea NOVA/Cartera. Por esa razón no se atribuye propiedad ni se reutiliza información de Sofía.

| Metadata | Estado |
|---|---|
| Número | PENDING |
| `phone_number_id` | PENDING |
| WABA | PENDING |
| Meta Business | PENDING |
| Estado | PENDING |
| Display name | PENDING |
| Verificación | PENDING |
| Webhooks existentes | PENDING |
| App asociada | PENDING |
| Propiedad CREDITEK | PENDING DE VERIFICACIÓN EN META BUSINESS |

El repositorio sí contiene el Worker productivo `creditek-bot` de Sofía y otro Worker histórico que documenta reutilización del mismo `PHONE_NUMBER_ID`. Esa infraestructura no se usa ni se modifica. La nueva línea requiere identificadores, secretos, webhook handler, logs y métricas propios.

## Configuración preparada

`config/aura-channel-router-sandbox.example.json` contiene únicamente placeholders y nombres de bindings nuevos. No contiene número, token, secreto, webhook real ni datos de Meta. `real_messages_enabled` permanece en `false`.

```text
NUEVA LÍNEA (pendiente)
  -> Worker/canal independiente (pendiente; no compartir creditek-bot)
  -> mensaje normalizado
  -> AURA Channel Router
       -> NOVA      solo identidad interna autorizada
       -> CARTERA   solo cliente externo en flujos cliente
       -> HUMAN     solicitud humana o identidad no permitida
       -> UNKNOWN   canal/intención no reconocidos y línea de Sofía
```

## Identidad y permisos

El sandbox usa IDs ficticios en allowlist. NOVA acepta `retail_agent`, `ally_agent` y `authorization_manager`. Un cliente externo que intenta acceder a NOVA escala a `HUMAN`. Cartera acepta clientes externos; una tienda o aliado que intenta entrar al flujo cliente escala a revisión humana hasta que exista una regla operativa explícita.

## Flujos

NOVA simula búsqueda, ventas, check de plataforma, señal y recomendación. La respuesta nunca contiene una decisión final automática. Un error de PayJoy degrada a `YELLOW / REVISIÓN REQUERIDA`.

Cartera simula consulta de obligación, estado, elegibilidad y acción. “Ya pagué” crea `PaymentReport` pendiente y abre conciliación; `balance_modified` siempre queda en `false`.

## Menús sandbox

NOVA: Solicitar autorización, Consultar cliente, Revisar autorización y Hablar con soporte.

Creditek Pagos: Consultar cuota, Ya pagué, Medios de pago y Hablar con asesor.

## Activación real pendiente

1. Confirmar en Meta Business que la línea pertenece a CREDITEK.
2. Registrar de forma controlada número, `phone_number_id`, WABA, display name, verificación, app y webhooks existentes.
3. Crear una app/Worker independiente de `creditek-bot`; no compartir handler ni Durable Object de Sofía.
4. Crear secretos server-side propios `AURA_CHANNEL_VERIFY_TOKEN` y `AURA_CHANNEL_WHATSAPP_TOKEN`.
5. Definir URL de webhook independiente, validación de firma, idempotencia, rate limits y retención de logs sin PII.
6. Aprobar allowlist corporativa real y proceso de alta/baja de agentes.
7. Ejecutar pruebas en número de test Meta antes de registrar webhook productivo.
8. Aprobar métricas, observabilidad, opt-outs y escalamiento humano.

Esta fase no inspeccionó ni modificó Meta, no creó Worker, no registró webhook y no envió mensajes.
