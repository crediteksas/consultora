# Utilidad automática de Krediya

Reemplaza el botón añadido en b77dc38: consultar la utilidad no requiere una acción del usuario.

- El RPC de contextos devuelve matemática en cada consulta para lotes editables; no escribe operaciones, bonos, órdenes ni autorizaciones.
- Usa PVP recibido y PAGAMOS pactado por vigencia, bonos operativos y ejecutivo según esquema, manuales aprobados, financiero 0,4% y provisión 28% según el motor vigente.
- Conserva utilidades negativas. PVP KORA es comparativo, no bloquea el cálculo.
- No duplica el universal de Gestión ni genera override de otros ejecutivos en Krediya.
- Datos ausentes no son cero: cada operación informa su faltante; el resumen identifica expresamente los importes parciales.
- Tras guardar una tarifa se consulta nuevamente y actualiza automáticamente tarjetas y resumen.
- Lotes congelados/aprobados conservan su cálculo guardado.
- La revisión humana usa «Revisar y enviar a aprobación». Su flujo existente persiste la liquidación; no se ejecuta al consultar.

Validación: 417 pruebas locales, consulta READ ONLY de operaciones reales en KORA y revisión de privilegios/advisors. Migración aplicada: 20260910211449. No se modificaron importes ni aprobaciones reales.
