# AURA 2 — Límites de módulos V1

## Decisión

AURA conserva tres frentes separados: **Sofía**, **NOVA Autorizaciones** y **Cartera**. NOVA y Cartera solo intercambian `customer_id` y el contrato inmutable `PlatformFinancialSnapshot`; no importan lógica interna entre sí. Sofía mantiene sus entrypoints existentes y no depende de ninguno de los dos módulos nuevos.

```text
Línea actual de Sofía ───────────────────────────────> SOFÍA

Línea futura AURA -> AURA Channel Router (diseño) --+-> NOVA
                                                     +-> CARTERA
                                                     +-> HUMANO

NOVA -------- customer_id + PlatformFinancialSnapshot -------- CARTERA
   \                         contrato compartido                /
    +---------------- integrations/payjoy ---------------------+
```

La línea futura solo transportará mensajes. No contendrá reglas de autorización, cobranza ni conversación. El router de esta fase es un diseño local sin WhatsApp, Meta, webhooks o envíos.

## Inventario canónico

| Área | Código actual | Responsabilidad | Límite |
|---|---|---|---|
| Sofía | `creditek/agentes/creditek-agente-respuestas.html` y páginas relacionadas del shell AURA | Conversación comercial actual | Intacta; no importa NOVA ni Cartera |
| NOVA dominio/aplicación | `src/nova/domain`, `src/nova/application`, `src/nova/rules`, `src/nova/platform-checks` | Cliente, validación precrédito, señal y recomendación reversible | No decide rechazo definitivo; no importa Cartera |
| NOVA repositorios/auditoría | `src/nova/repositories`, `src/nova/audit`, `src/nova/sandbox` | Repositorios y fixtures ficticios, auditoría sin PII | Sandbox local; sin persistencia productiva |
| NOVA UI | `creditek/agentes/aura-nova.html`, `.js`, `.css`, `src/nova/ui` | Buscar/crear, perfil, ventas, validaciones y enlace a ficha de obligación | No contiene API key ni localizadores PayJoy |
| Cartera dominio/fachada | `src/cartera/domain`, `src/cartera/application`, `src/cartera/repositories`, `src/cartera/integrations`, `src/cartera/ui` | Límite formal y consumo de snapshots | No importa NOVA |
| Cartera UI | `creditek/agentes/aura-cartera.html`, `.js`, `.css` | 11 pantallas operativas | Conserva comportamiento y diseño actuales |
| Cartera sandbox | `scripts/aura-cartera-sandbox-db.mjs`, `creditek/agentes/aura-cartera-supabase-repositories.mjs`, `supabase/` | 48 fixtures, migraciones y RLS sandbox | Sin datos reales ni producción |
| Conciliación/KORA | `lib/cartera/kora-readonly-adapters.mjs` | Adaptadores read-only por plataforma | KORA es fuente; no es dueño de Cartera |
| Compartido | `src/shared/customer`, `sale`, `platform`, `audit`, `contracts` | Identificadores y contratos puros | Sin reglas NOVA/Cartera |
| PayJoy | `src/integrations/payjoy` | Cliente, adapter, mapper, errores, tipos y proveedor server-side | Independiente y reutilizable; secreto fuera del navegador |

## Capacidades actuales

NOVA V1 declara 7 capacidades: buscar cliente, crear cliente sandbox, perfil, ventas asociadas, validaciones de plataforma, semáforo y recomendación precrédito. PayJoy está disponible read-only; ALO, Addi y Krediya permanecen explícitamente futuras. Las salidas son `GREEN`, `YELLOW` o `RED SIGNAL` y las recomendaciones son orientativas; no existe rechazo automático definitivo.

Cartera conserva 11 capacidades: Resumen, Gestión del día, Segmentos, Clientes, Conciliaciones, Promesas, Pagos reportados, Conversaciones, Opt-outs, KPIs y Configuración.

## Contrato de comunicación

- Clave común: `customer_id`.
- Dato financiero común: `PlatformFinancialSnapshot` inmutable.
- NOVA puede producir o consultar un snapshot para evaluación.
- Cartera puede leer un snapshot persistido para enriquecer saldo e historial.
- Ningún módulo conoce repositorios, reglas, UI o entrypoints internos del otro.
- PayJoy entrega datos normalizados; no toma decisiones NOVA ni ejecuta gestión Cartera.

## Permisos

| NOVA | CARTERA |
|---|---|
| `retail_agent` | `cartera_advisor` |
| `ally_agent` | `cartera_manager` |
| `authorization_manager` | `cartera_auditor` |
| `auditor` | — |

Los conjuntos son independientes y no se heredan automáticamente.

## AURA Channel Router futuro

Entrada: línea, remitente, tipo de usuario e intención. Salida: `NOVA`, `CARTERA`, `SOFÍA` o `HUMANO`. La línea actual de Sofía siempre conserva su destino. Autorización/precrédito de Retail o Aliado va a NOVA; pagos, mora, promesas o “ya pagué” va a Cartera; lo ambiguo escala a Humano.

## Guardas

Las pruebas verifican imports en ambas direcciones, independencia de PayJoy, contratos compartidos sin lógica específica, permisos separados, ausencia de ciclos y aislamiento ante fallos de NOVA, Cartera y PayJoy. Esta consolidación no configura canales, no conecta servicios externos y no modifica producción.
