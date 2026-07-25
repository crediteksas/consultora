# Automatización del alta de aliados y enlace de registro

**Fecha:** 24 de julio de 2026

**Estado:** Diseño aprobado por Oscar Pacheco

**Sistemas afectados:** formulario de convenios, Google Apps Script de
convenios, Worker `creditek-clientes`, Supabase y Google Sheets
`Links_Registro_Creditek`

## 1. Objetivo

Al enviar correctamente el formulario de convenio de un aliado, completar de
forma automática todo lo necesario para que Mayte pueda copiar y enviar el
enlace de registro de la tienda sin intervención técnica:

1. conservar la creación actual de la carpeta, documentos, convenio y M3;
2. registrar o actualizar el aliado y sus vendedores en Supabase;
3. generar o reutilizar un enlace privado de tienda;
4. actualizar las hojas `Links_Registro_Creditek` y `VENDEDORES`;
5. mostrar el enlace en la confirmación final con un botón para copiarlo.

El cambio no modifica el formulario de clientes, Sofía, ventas, créditos,
cartera, inventario ni los enlaces privados que ya están funcionando.

## 2. Estado actual confirmado

El formulario de convenios ya recopila y envía:

- radicado;
- ejecutivo responsable;
- nombre comercial;
- municipio y departamento;
- responsable, teléfono y correo;
- uno o más vendedores;
- documentos del aliado y de los vendedores.

El Google Apps Script actual crea la carpeta del aliado, los documentos, el
convenio y el formato M3. Sin embargo, no actualiza automáticamente las hojas
centrales ni aprovisiona el aliado en Supabase. La generación segura de enlaces
se realiza actualmente mediante una herramienta separada del Worker.

Los aliados Celu-Center, Lachescel, Izzy Móvil y Celuaccesorios de Colombia
demuestran esa separación: sus carpetas y M3 existen, pero no fueron agregados
automáticamente a las dos hojas centrales.

## 3. Decisiones aprobadas

1. Habrá un solo enlace privado por tienda.
2. El enlace mostrará únicamente los vendedores activos de esa tienda.
3. Los vendedores enviados en el convenio quedarán activos inmediatamente.
4. La tienda quedará bloqueada por el enlace; si hay varios vendedores, la
   persona escogerá uno dentro de la lista autorizada.
5. El token completo no se guardará en Supabase. Supabase conservará únicamente
   su hash y sufijo, según el diseño de enlaces seguros existente.
6. El proceso será idempotente: reenviar o reintentar un mismo radicado no
   duplicará aliado, vendedores, filas ni enlaces.
7. Los enlaces actuales no se regenerarán ni revocarán.

## 4. Arquitectura recomendada

### 4.1 Google Apps Script

El Apps Script seguirá siendo responsable de Google Workspace porque ya posee
los permisos necesarios para crear carpetas, documentos, M3 y editar las hojas.

Después de completar el flujo actual, enviará al Worker una solicitud privada
de aprovisionamiento con:

- radicado como clave de idempotencia;
- código estable del aliado;
- nombre comercial;
- municipio;
- responsable y teléfono;
- ejecutivo;
- vendedores normalizados.

Cuando el Worker responda con el enlace, Apps Script actualizará las dos hojas y
devolverá el enlace al navegador.

### 4.2 Worker `creditek-clientes`

Se agregará un endpoint interno de aprovisionamiento. Este endpoint:

1. exigirá autenticación servidor a servidor mediante un secreto independiente;
2. validará y normalizará el payload;
3. creará o actualizará el origen en Supabase;
4. creará o actualizará los vendedores de ese origen con `activo = true`;
5. reutilizará el enlace activo de tienda cuando Apps Script ya conserve su URL;
6. creará un token opaco nuevo solamente cuando el aliado aún no tenga enlace;
7. almacenará únicamente el hash del token;
8. devolverá el enlace completo al Apps Script para su registro interno.

El navegador nunca recibirá el secreto de aprovisionamiento ni podrá invocar
directamente este endpoint.

### 4.3 Google Sheets

Apps Script realizará escrituras por clave, no por posición fija.

#### Hoja `Links_Registro_Creditek`

Una fila por tienda:

- `CÓDIGO`;
- `TIENDA`;
- `TIPO = ALIADO`;
- `CIUDAD`;
- `ADMIN / CONTACTO`;
- `TELÉFONO`;
- `EJECUTIVO`;
- `LINK DE REGISTRO`.

Si el código ya existe, se actualizará la fila existente sin crear otra.

#### Hoja `VENDEDORES`

Una fila por vendedor y tienda:

- código de tienda;
- nombre de tienda;
- nombre completo del vendedor;
- `TIPO = TERCERO`;
- `ACTIVO = SÍ`;
- enlace personal vacío;
- observaciones vacías.

La deduplicación usará tienda más nombre normalizado. Un vendedor ya existente
será actualizado y activado, no duplicado.

## 5. Código del aliado

El código será una versión estable del nombre comercial:

- minúsculas;
- sin tildes;
- espacios y signos convertidos a guiones;
- sin guiones repetidos.

Antes de crear el código, el proceso buscará coincidencias por radicado y por
nombre comercial normalizado. Si el código calculado ya pertenece a otro
aliado, se agregará un sufijo corto derivado del radicado. El código asignado
quedará persistido y no cambiará si posteriormente se corrige la presentación
del nombre.

## 6. Flujo completo

1. El ejecutivo y el aliado completan el formulario.
2. El formulario valida documentos y al menos un vendedor.
3. Apps Script ejecuta la creación actual de Drive, convenio y M3.
4. Apps Script solicita al Worker el aprovisionamiento seguro.
5. El Worker confirma o crea origen, vendedores y enlace.
6. Apps Script actualiza ambas hojas centrales.
7. El backend responde con `ok`, radicado y enlace.
8. La pantalla final muestra:
   - confirmación del convenio;
   - enlace de registro;
   - botón `Copiar enlace`.

El botón copiará exactamente la URL devuelta por el servidor y mostrará una
confirmación visible. No se construirá el enlace en el navegador.

## 7. Idempotencia y reintentos

El radicado será la clave principal del proceso. Además:

- Supabase impedirá dos orígenes con el mismo código;
- un origen tendrá como máximo un enlace de tienda activo;
- el nombre normalizado del vendedor será único dentro de su tienda;
- las hojas se actualizarán buscando la clave antes de insertar;
- una respuesta repetida devolverá el mismo resultado del aprovisionamiento.

Para poder reconstruir el mismo enlace después de un fallo entre Supabase y
Google Sheets sin guardar el token completo, los tokens nuevos se derivarán con
HMAC-SHA-256 a partir de un secreto exclusivo de aprovisionamiento y del
radicado estable. El resultado seguirá siendo opaco e imposible de predecir sin
el secreto. Supabase conservará únicamente el segundo hash usado por el flujo
de registro.

Apps Script conservará el enlace exitoso en la hoja interna. En reintentos
posteriores lo enviará al Worker como contexto de reconciliación; el Worker
verificará que corresponda al enlace activo antes de aceptarlo. Si el primer
intento alcanzó Supabase pero falló antes de escribir la hoja, repetir el mismo
radicado permitirá reconstruir exactamente el mismo token.

## 8. Manejo de errores

El flujo conservará el trabajo ya realizado y distinguirá:

- fallo al crear Drive/M3: no se intenta aprovisionar;
- Drive/M3 creado y fallo en Supabase: se informa estado parcial y se permite
  reintentar con el mismo radicado;
- Supabase completado y fallo al escribir Sheets: se reintenta únicamente la
  sincronización de hojas;
- hojas completadas y fallo de respuesta al navegador: un nuevo intento
  devuelve el mismo resultado sin duplicados.

La interfaz no mostrará secretos, hashes, respuestas internas ni detalles de
Supabase. Un error parcial mostrará el radicado y una instrucción clara para
reintentar, sin afirmar que el enlace está listo.

## 9. Seguridad

1. Secreto servidor a servidor almacenado en Apps Script Properties y como
   secreto de Cloudflare.
2. Comparación de autenticación en el Worker sin registrar el secreto.
3. CORS no habilitado para el endpoint interno.
4. Validación estricta de tamaño, tipos y campos admitidos.
5. Token opaco derivado con HMAC-SHA-256 y un secreto exclusivo de
   aprovisionamiento.
6. Hash de consulta calculado únicamente en el Worker con un secreto diferente.
7. Ningún token o secreto se registrará en logs, errores o repositorio.
8. El enlace completo se conservará solamente en la hoja interna autorizada y
   en la respuesta de éxito a la sesión que creó el convenio.
9. Los permisos actuales de Drive y las carpetas de cada aliado no se amplían.

## 10. Publicación sin interrupción

1. Crear pruebas automatizadas del aprovisionamiento.
2. Publicar primero el endpoint nuevo del Worker, sin alterar rutas existentes.
3. Configurar el secreto compartido en Cloudflare y Apps Script Properties.
4. Actualizar Apps Script manteniendo intacto el flujo actual de Drive/M3.
5. Actualizar la pantalla final del formulario.
6. Probar con un aliado controlado y vendedores de prueba.
7. Verificar el enlace contra `/api/registro/contexto`.
8. Confirmar las dos hojas y la ausencia de duplicados.
9. Reprocesar el mismo radicado y verificar idempotencia.
10. Mantener disponibles la versión anterior del Worker y la implementación
    anterior de Apps Script para regreso inmediato.

## 11. Pruebas y criterios de aceptación

### Aprovisionamiento

- Un convenio nuevo crea un origen aliado activo.
- Cada vendedor válido queda activo y vinculado al origen correcto.
- Se crea un único enlace de tienda.
- Supabase no almacena el token completo.
- Repetir el mismo radicado devuelve exactamente el mismo enlace.
- Repetir el mismo radicado no crea duplicados.

### Hojas

- `Links_Registro_Creditek` recibe una sola fila completa.
- `VENDEDORES` recibe una fila por vendedor.
- Todos los vendedores nuevos quedan en `SÍ`.
- Los enlaces personales permanecen vacíos.
- Una corrección posterior actualiza las filas existentes.

### Formulario

- El resultado exitoso muestra el enlace y permite copiarlo.
- El enlace abre la tienda correcta.
- El selector muestra solamente vendedores activos de esa tienda.
- Con un vendedor activo el formulario puede continuar.
- Con varios vendedores se exige seleccionar uno.

### Regresión

- Los enlaces actuales siguen resolviendo.
- El registro de clientes mantiene OTP, Turnstile y carga de documentos.
- El formulario de convenios sigue creando los mismos documentos y carpetas.
- Un fallo en la automatización no elimina ni corrompe documentos existentes.

## 12. Fuera de alcance

- Enlaces personales por vendedor.
- Aprobaciones por financiera.
- Cambios en Sofía.
- Cambios en créditos, ventas, cartera o inventario.
- Migración de Google Workspace o Supabase a otra cuenta.
