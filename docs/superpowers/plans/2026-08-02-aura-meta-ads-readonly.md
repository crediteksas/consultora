# AURA Meta Ads Intelligence — modo lectura seguro

**Objetivo:** reactivar Agente 3 únicamente en modo lectura mediante un Worker dedicado, permisos propios y datos reales de Meta, sin restaurar credenciales ni llamadas sensibles en el navegador.

## Alcance aprobado

- Rama aislada `codex/aura-meta-ads-readonly`.
- Worker `aura-meta-ads-api` con autenticación AURA, autorización por `app_id`, permisos, usuario activo, rate limiting y auditoría.
- Tokens de Meta y servicios internos solo como secretos del Worker.
- Dashboard de lectura con métricas, campañas, tendencias, alertas y filtros.
- Sin endpoints de escritura y sin acceso directo a KORA.
- El banner seguirá bloqueado hasta validar datos reales. Solo entonces mostrará “Meta Ads disponible en modo lectura.”

## Tareas

1. Crear pruebas negativas y positivas del Worker y del artefacto público.
2. Implementar autenticación AURA y permisos exclusivos `meta_ads.*`.
3. Implementar rate limiting duradero, auditoría obligatoria y errores sanitizados.
4. Implementar gateway de solo lectura a Meta Graph y normalización de métricas.
5. Implementar atribución mediante contrato interno opcional, sin consultas directas a KORA.
6. Sustituir el cliente histórico inseguro por un cliente de lectura que solo envía la sesión AURA al Worker.
7. Añadir migración aditiva y rollback para la aplicación y permisos de Meta Ads.
8. Ejecutar pruebas del Worker, seguridad, build y escaneo de secretos.
9. Configurar secretos sin exponerlos, aplicar permisos y desplegar primero el Worker.
10. Validar datos reales y conciliación con Meta; solo después publicar el cliente en modo lectura.
11. Documentar deployment, auditoría y rollback con evidencia sanitizada.

## Criterio de parada segura

Si faltan secretos, acceso a Meta o funciones AURA requeridas, el Worker debe fallar cerrado y el banner productivo permanecer bloqueado. No se simularán datos ni se publicará una falsa habilitación.
