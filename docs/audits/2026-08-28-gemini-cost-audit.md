# Auditoría de uso y apagado de Gemini — AURA

Fecha: 28 de agosto de 2026  
Alcance: inventario de llamadas Gemini/Vertex y controles de gasto.  
Estado: solo auditoría; no se eliminaron claves, APIs ni versiones productivas.

## Resumen ejecutivo

La causa de gasto más clara está en el Publicador que hoy sigue en producción: Gemini y GPT Image 2 aparecen seleccionados simultáneamente. Cada clic normal en generar puede ejecutar dos generaciones pagadas en paralelo. La candidata Recraft ya preparada corrige ese comportamiento, pero todavía no tiene tráfico.

El Calendario de contenido conserva un segundo flujo activo de dos pasos: una imagen Gemini para crear la fotografía y una imagen GPT para componer texto y logo. Cada clic en “Aprobar y generar imagen” consume ambos motores.

No se encontró una automatización programada que genere imágenes Gemini por sí sola. El botón Reel está deshabilitado y el Worker productivo no expone actualmente la ruta `/veo/generate`.

## Hallazgos

### P0 — Publicador productivo genera con dos motores por defecto

- Pantalla: `creditek/agentes/creditek-agente-redes.html` actualmente publicada.
- `chk-gemini` y `chk-dalle` están ambos marcados por defecto.
- La función de generación toma todos los motores marcados y ejecuta sus llamadas.
- Resultado: un clic normal puede producir una llamada Gemini y una llamada GPT.
- La comparación A/B y el pipeline antiguo agregan otras rutas dobles, aunque no son necesarias para el flujo normal.

### P0 — Calendario mantiene Gemini → GPT

- Pantalla: `creditek/agentes/creditek-agente-calendario.html`.
- Botón: “Aprobar y generar imagen”.
- Paso 1: `/generate` produce la fotografía con Gemini.
- Paso 2: `/openai/responses` usa GPT para agregar titular y logo.
- Resultado: cada pieza aprobada genera dos imágenes pagadas.

### P1 — El endpoint `/generate` conserva dos proveedores Google

- Primero intenta `gemini-3.1-flash-image-preview` mediante `GEMINI_API_KEY`.
- Si ese intento falla de ciertas maneras, pasa a `gemini-3-pro-image` en Vertex AI.
- Por tanto, una solicitud puede tocar AI Studio y después Vertex. Un error previo no garantiza costo cero.

### P2 — Enriquecimiento manual de catálogo

- Script: `catalogo_creditek.py`.
- Modelo: `gemini-2.5-flash` mediante `generativelanguage.googleapis.com`.
- Hace aproximadamente una consulta por referencia procesada y contiene pausas de cinco segundos.
- Se observaron ejecuciones históricas de 211 referencias.
- No se encontró cron, trigger de Cloudflare ni tarea del repositorio que lo ejecute automáticamente; el riesgo aparece cuando alguien corre el script manualmente.

### Sin evidencia de gasto Gemini actual

- Reel/Veo: el control está deshabilitado en la interfaz y el Worker actual no acepta `/veo/generate`.
- Sofía: sus rutas operativas no llaman a Gemini para conversar, asignar asesores ni enviar informes.
- KORA transaccional: no se encontró un flujo automático de Gemini ligado a ventas, caja o inventario. La referencia `KORA_GEMINI_WORKER_URL` es configuración de endpoint, no una llamada por sí sola.
- Rutas `/anthropic/messages` y `/openai/responses`: viven en el Worker llamado `gemini-proxy`, pero utilizan Claude y OpenAI respectivamente; el nombre del Worker no significa que esas llamadas consuman Google.

## Plan seguro de apagado

1. Desplegar las candidatas ya verificadas del Publicador y del proxy. Esto elimina Gemini del flujo visible del Publicador y deja GPT como opción predeterminada y Recraft como alternativa explícita.
2. Modificar Calendario para usar un solo motor por pieza: Recraft o GPT, con confirmación y costo visible. No dejar una cadena automática de dos motores.
3. Bloquear `/generate` en el Worker con respuesta controlada y retirar esa ruta de los clientes AURA. Este es el cortacircuito técnico que impide nuevas imágenes Google aunque sobreviva un botón antiguo en caché.
4. Observar registros durante 24–48 horas y confirmar cero eventos `GEMINI-IMAGE`.
5. Crear una nueva versión sin `GEMINI_API_KEY`, `GCP_WIF_PRIVATE_KEY`, `GCP_WIF_PUBLIC_JWK` y `GCP_WIF_KEY_ID`. No eliminar secretos de una versión productiva antes de completar los pasos 1–4.
6. Revocar la API key de Gemini en Google y deshabilitar, en el proyecto `creditek-imagen`, Generative Language API y Vertex AI API solo después de verificar que ningún servicio externo las comparte.
7. Mantener alertas de presupuesto, pero no tratarlas como tope: Google advierte que un presupuesto de alertas no detiene automáticamente el uso.

## Candidatas disponibles, aún sin tráfico

- Motor Recraft: `a8b050a3-ca81-41f3-8c69-ce545112b665`.
- Interfaz AURA: `ad3d1659-db70-49ab-9bc2-1abe36a80b9e`.
- Producción del motor continúa en `fc979b66-0a35-4d52-9018-27c1115fa5d6`.
- Producción AURA continúa en `bd8d7fcc-fbf9-46d9-b050-53329a0f46de`.

## Conclusión

La evidencia del código permite explicar gasto elevado sin asumir una filtración de credenciales: el diseño productivo actual multiplica generaciones por clic. El apagado debe hacerse primero en los consumidores (Publicador y Calendario), después en el endpoint, y por último en las claves y APIs de Google.
