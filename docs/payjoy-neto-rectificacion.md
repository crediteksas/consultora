# PayJoy: ingreso neto y utilidad (2026-09-21)

Rectificación autorizada por Oscar: el importe `purchaseAmount / owed by PayJoy`
es la base de PAGAMOS; la inicial `purchaseOutOfPocket / owed by CREDITEK S.A.S.`
ya está en la tienda. El neto esperado de la plataforma es base menos inicial.
La utilidad de liquidación es ese neto menos giro pactado menos bonos.
No corresponde a utilidad de inventario retail.

Ejemplo: 544.000 − 81.600 = 462.400 esperado; giro 331.840;
utilidad 130.560. PAGAMOS permanece 413.440.

Se verificaron 96 operaciones / 24 lotes: 39 utilidades corregidas,
57 ya correctas. Total utilidad anterior 23.254.460, corregido 17.544.570.
Valor comercial también deja de sumar la inicial por segunda vez.
No había cobros esperados PayJoy confirmados: se corrige la propuesta de cada
corte, sin crear confirmaciones ni abonos bancarios.

Auditoría: `liquidation_adjustments`, `audit_log` y respaldo privado
`kora_private.rectificaciones_payjoy_neto`. RLS sin políticas y privilegios
revocados son deliberados: este respaldo no es una API de usuario.
Las protecciones originales de lotes aprobados se restauran dentro de la misma
transacción. No cambia estado, congelación, giros, bonos, órdenes ni movimientos.

Verificación: migración ejecutada en PGlite con copia de 96 operaciones y sus
cálculos, invariantes de importes/estados y rechazo posterior a edición aprobada;
consultas productivas sin diferencias de fórmula ni cambios fuera de alcance;
pruebas de dominio para PayJoy con/sin bonos y regresión ALO.
