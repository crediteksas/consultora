# Alcance de la evidencia de interfaz

- BASE aprobada antes del delta piloto: SHA256 `3a87f636b8d173d7c883424a58cc97510d4730cf841c41465f55dc2527bf4ce2`.
- Formulario actual con capacidad por celular: SHA256 `0f95fd3046df2e74b607a6f5dd9182c02048a5571e26a2689e73d72e61379c2e`.
- Las 21 pruebas VM actuales pasaron sobre el formulario actual.
- `chrome-browser-results.json`, `browser-summary.json` y las dos capturas
  corresponden solo a Chrome 156 sobre la BASE anterior: ocho comprobaciones,
  todos los datos ficticios y cero llamadas reales de API/proveedor.
- Un suplemento Chrome para el delta terminó por timeout de CUA (31.8 s) y
  reinició su kernel. No hay resultado Chrome aprobado para el delta actual.
  No se repitió en esta integración.

Los JSON y las capturas BASE se conservaron sin modificar sus resultados.
`pilot-ui-delta.patch` contiene el cambio textual BASE→actual para revisión.
No prueba publicación, consumo de APIs reales ni entrega de SMS/WhatsApp.
