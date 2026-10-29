Reconstrucción histórica desde correo
===================================

Importación autorizada de históricos ALO/PayJoy anteriores al inicio operativo. Solo escribe creditos_historicos_plataforma: inserta faltantes y adjunta evidencias a existentes sin cambiar sus importes. No usa las rutas de pagos/liquidaciones operativas.

Pago declarado por Gerencia no significa conciliación bancaria. No inventar fecha de giro, soporte o receptor. Fuentes discrepantes quedan para revisión; importes existentes no se reemplazan. La comparación con importes KORA se conserva en metadata e informe.

Ejecutar dentro de BEGIN/COMMIT (o ROLLBACK en prueba). Generar JSON UTF8 hexadecimal validado con [0-9a-f]+ y sustituir :payload por convert_from(decode(hex,hex),UTF8)::jsonb; nunca interpolar texto original de correo. Fallar si faltan datos obligatorios de registros nuevos. No almacenar payloads, nombres, cédulas ni cuentas en Git.

Revisión Claude aprobada 2026-10-29. Seis pruebas unitarias y prueba real revertida con idempotencia y fingerprints de tablas operativas sin cambios. Importes conflictivos requieren revisión humana y cruce con extracto. No es un exportador DIAN.
