# Devolución de gastos

Gestión y Gerencia pueden elegir «Devolver para corrección» en un gasto registrado. El motivo es obligatorio. «Rechazar» conserva el rechazo definitivo: no habilita corrección.

En Gastos, la tienda filtra «Devuelto para corrección» y pulsa «Corregir y reenviar». Puede corregir fecha, concepto, monto y descripción; no cambia tienda ni autor original. Se actualiza el mismo ID y vuelve a registrado, pendiente de aprobación, incluso si el concepto es preautorizado. No se insertan gastos duplicados.

El historial de cada gasto conserva antes/después, fecha y usuario de cada actualización desde esta implementación. Su lectura se restringe explícitamente a Gestión/Gerencia o a la administración de la misma tienda. No habilita edición directa de gastos a las tiendas. No modifica retroactivamente los rechazados ni los aprobados.

El flag correccion_pendiente distingue la devolución del rechazo definitivo sin sumar un nuevo estado a los cálculos existentes. La corrección exige revisión vigente, perfil activo, motivo/descripción, monto positivo, concepto activo y fechas fuera de períodos cerrados. Se bloquea el registro durante el cambio para evitar doble envío.

Pruebas locales de PostgreSQL: autorización central, acceso cruzado denegado, historial aislado por tienda, edición directa denegada, identidad/autor preservados, doble envío rechazado, revisión desactualizada, período cerrado y usuario sin sesión. No se devolvió ni modificó ningún gasto real durante el despliegue.
