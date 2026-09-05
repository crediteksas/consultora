# Krediya: tarifario y diferencias

Fuente autorizada por Oscar: `PAGAMOS Y COSTOS DE EQUIPOS .xlsx`, Hoja1,
filas 2–53. PVP columna L; Pagamos columna N. El Excel original no se modifica.
SHA-256: `5af1c4d5cd0eea4b09f3d794bfc576e1fc74549cb0b828ffa5c5ea2eacfc1f68`.

Se cargan 52 referencias. La vigencia inicial 2026-09-01 se corrigió hasta
2026-08-12, primera venta del lote pendiente para el que Oscar entregó el archivo.
El corte operativo del informe no determina la vigencia del tarifario.
Cada regla conserva en auditoría archivo, huella y celdas de origen. No se
sobrescriben reglas existentes ni liquidaciones aprobadas. La referencia se
normaliza únicamente en espacios, puntuación y mayúsculas; no se fusionan
capacidades, RAM o nombres diferentes que comparten código de modelo.

El editor sustituye el prompt USAR/CORREGIR/ERROR y presenta PVP y Pagamos
guardados, recibidos y diferencia. Permite aceptar el PVP recibido, conservar
la tarifa o corregir exclusivamente el crédito. Muestra utilidad bruta,
provisión del 28% y neta, sin inventar bonos cuya vigencia no esté definida.
No altera el archivo fuente ni el tarifario maestro y no autoriza pagos.

Los precios coincidentes y bonos vigentes se concilian al abrir una liquidación
editable. Las diferencias reales permanecen pendientes de decisión. Las ventas
del lote pendiente de agosto también reconocen la fuente entregada. La reparación
de vigencia no recalcula ni modifica operaciones aprobadas.

Verificación: pruebas unitarias del editor y fuente; prueba transaccional en
Postgres con rollback de conservación del original, precio efectivo, ausencia
de pagos nuevos y rechazo de precio inválido, congelados y acceso anónimo.

Regla de cálculo confirmada: PVP = columna L, nunca Precio Sug (G).
Pagamos = columna N antes de inicial. Giro al aliado = Pagamos − inicial.
Utilidad bruta = PVP − Pagamos − $20.000 de bonos; provisión = bruta × 28%.
La inicial no se descuenta otra vez de la utilidad. Si el importe reportado por
Krediya difiere del PVP, se muestra la comparación sin adoptar ese importe.

## Referencias recuperadas del manual y presentación de operaciones

La copia `SEMANA K DEL 24 AL AGOSTO 2026.xlsx` tiene columnas distintas:
Hoja1 J=PVP, K=PAGAMOS. SHA256:
`48263902ee56de66ecdd007bdd1826dad090962e4a81408cd6cedc5b9dcc55f2`.

- J54/K54: REDMI A7 PRO 64GB 4RAM, $492.800/$369.600; fila adicional omitida.
- J49/K49: TECNO SPARK GO 3 4GB RAM 64GB, $591.500/$443.625.
  Alias explícito para la misma referencia importada con sufijo REGULAR,
  TECNO KN3, 64GB y 4GB RAM. No se enlaza con la variante de 128GB.
- K55: INFINIX HOT 60 PRO+ 256GB 8+8RAM, Pagamos $890.000,
  comprobado también en LIQUIDACION!AJ2. J55=0 por costo I55 vacío:
  se conserva evidencia parcial para cob6uk5; NO se crea una tarifa ni
  se acepta automáticamente el precio recibido de $1.199.000.
- MOTOROLA EDGE 50 FUSION 5G 256GB 8RAM: dos créditos sin tarifa
  en las fuentes revisadas. No se inventa un precio ni se usa otro modelo.

Resultado comprobado: 43 operaciones reconocidas, 40 con PVP de tarifa,
41 con Pagamos respaldado; 0 alertas abiertas de bonos y 0 órdenes de pago del lote.
Las diferencias de PVP siguen requiriendo una decisión específica del revisor.

La vista muestra referencia completa, comercio, cliente, IMEI y fecha por
operación, con PVP guardado/recibido, Pagamos e inicial en una cuadrícula
adaptable. El giro previo al cálculo está identificado como estimado.
Los cálculos guardados conservan prioridad, incluidos ceros reales.
La lista y el resumen cuentan los datos importados y no simulan $0 cuando
el cálculo no existe. El botón abre directamente el editor de esa operación.

Seguridad: consulta por lote SECURITY INVOKER, RLS conservado, revisión
de capacidad y acceso anónimo revocado. El asesor marca la función de contexto
preexistente por ser SECURITY DEFINER accesible a authenticated; conserva
auth.uid(), capacidad revisor, search_path fijo y prohibición de anon.
Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
