# COBRA · Calidad KrediYA — candidato local

Versión de revisión de 25/11/2026. Sin integración, escritura productiva ni despliegue.

## Uso

Desde esta carpeta: `node serve-preview.cjs 8789 /ruta/privada/reference-kora-live.json`.
Abrir http://127.0.0.1:8789/ en el mismo equipo. Sin referencia funciona el ejemplo ficticio y la lectura del archivo deja el cruce pendiente.

La referencia privada NO forma parte del paquete. No copiar datos reales al repositorio. El servidor solo escucha en 127.0.0.1; rechaza otros Host, otros métodos y rutas no permitidas. No hay conexión a Supabase, claves, proxy ni endpoints de escritura. El Excel se procesa en memoria del navegador.

## Funcionalidad acotada

- Exportación KrediYA .xlsx con creación textual, frecuencia 15 días, estados firmado/aprobado y contadores completos. Valores ausentes/inválidos, duplicados y fórmulas bloquean el archivo entero.
- Cálculo nominal en centavos, mostrado en pesos: suma de cuotas atrasadas × cuota / suma de cuotas cicladas × cuota. Es ESTIMADO: no reproduce abonos parciales ni ajustes monetarios del proveedor.
- Filtros de mes/tienda afectan el alcance; búsqueda/prioridad solo afectan la cola.
- Cruce con operaciones existentes por plataforma/contrato y comprobación de identidad, fecha, tienda e importe. No se crean créditos ni liquidaciones.
- Perfiles con conteos observados y enlaces disponibles; sin score, objetivo personal o decisiones automáticas de Nova.
- Comparar dos cortes, incluso el mismo día, sin fabricar pagos por diferencias o ausencias.
- Borradores de gestión solo en memoria; no sobreviven a limpiar/recargar. Provisión solo como explicación del flujo, sin saldo utilizable supuesto.

## Validación

`node --test tests/erp/cobra-krediya-quality.test.mjs` desde la raíz del checkout.
Pruebas de dominio con identidades e importes ficticios. Las comprobaciones con el Excel real y la referencia KORA permanecen fuera del repositorio. SheetJS 0.20.3 está fijado localmente con licencia y procedencia; no se modificó la dependencia de otras aplicaciones.

## Persistencia preparada por separado

`supabase/migrations/` contiene dos migraciones creadas por CLI, solo como propuesta. Guardan cortes inmutables y enlazan gestiones a operaciones existentes. `quality-persistence.js` prepara solicitudes/reintentos y verifica recibos. `quality-connection.js` reutiliza la sesión del shell y recupera guardados inciertos. `integration/` contiene el HTML completo candidato, la nueva pestaña y el diff del lector anterior; no están aplicados. `db-tests/` usa PostgreSQL 17 y PostgREST aislados, sin red ni puertos publicados en el contenedor. El servidor de pruebas de navegador escucha solo en loopback y utiliza un endpoint Auth ficticio; nunca se publica.

Importar exige gestión de cartera y la capacidad de revisar liquidaciones. La capacidad de gestión propuesta permite leer observaciones canónicas validadas y registrar eventos, sin acceso general al origen. Es una ampliación explícita de datos de seguimiento pendiente de aprobación. El cruce elige únicamente operaciones reconocidas; una ambigüedad detiene el corte. No se impone unicidad a las fuentes: se conservan anulaciones y evidencia del mismo contrato. La visibilidad completa del origen para el importador es una dependencia que debe verificarse localmente antes de integrar, sin enviar ACL reales a revisores externos. Ninguna asignación de permisos de personas está incluida ni aplicada.

El rollback es únicamente para instalación vacía, bloquea tablas antes de comprobarlo y rechaza borrar historial. Con datos se requiere corrección hacia adelante. La vista previa no carga este cliente ni tiene un botón que ejecute las migraciones o RPC.

## Antes de integrar

El candidato conectado ya tiene pruebas de sesión ficticia, API, reintentos, pestañas, cargas de 10.000 filas y convivencia con el consumidor anterior. Consultar `integration/README.md` para sus límites y orden de aplicación. El cliente, la integración y la construcción recibieron PASS acotado R6, tras resolver reintentos/avisos y cambios concurrentes de archivos. El SQL optimizado y rollback exactos recibieron PASS acotado en revisión separada; no se reutilizó la aprobación anterior a la optimización. Se validó previamente la sesión de Óscar en lectura, no los RPC candidatos. Restan revisión/autorización del usuario y controles del entorno antes de cualquier aplicación. El fondo requiere conciliar constitución, usos y caja antes de aprobar dinero. La conexión analítica a Nova y el historial multimes siguen pendientes.

No usar esta vista previa como sistema productivo ni como calidad oficial certificada.
