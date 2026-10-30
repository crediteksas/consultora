# Tesorería en Administración

Cambio autorizado por Óscar: mover el acceso único desde Aliados a Administración. Misma URL, icono y funciones. No cambios de datos, pagos ni autorización directa.

Validación:31 pruebas de navegación/seguridad aprobadas. Comparación de64 combinaciones de rol, estado activo y capacidades contra producción: mismos enlaces y misma autorización; solo cambia el grupo. CORPORATE_ROLES sigue limitado a gerencia y auditoria y hasFullCorporateAccess a gerencia.

Revisión Claude autorizada para código visual sin datos reales:
## Revisión de diff — Tesorería: Aliados → Administración

**Verificación de requisitos (href, funciones, autorización sin cambios):**

- `href='aliados-tesoreria.html'` se mantiene idéntico en ambos archivos. ✔️
- `icon`/`lucide: 'landmark'` sin cambios. ✔️
- En `sidebar.js` el item conserva literalmente `roles: ['gerencia', 'auditoria']` — solo cambia de posición, no de contenido. ✔️
- En `kora-access-control.js`, el item nunca tuvo `roles` propio (ni antes ni después); su visibilidad dependía del *gate* de sección Aliados. Al moverlo a Administración se agrega `capability: 'aliados'` a nivel item para no perder ese filtro — coherente con lo que describe la tarea ("se conserva ese filtro al nivel item capability").
- El cambio de filtro (`!item.capability || hasFullCorporateAccess || capabilities[item.capability] === true`) solo afecta a items que declaren `capability`; para el resto `!item.capability` es `true` y el comportamiento previo queda intacto. Es un cambio mínimo y acotado, no una reescritura del filtro general.

**Test nuevo:**
- Verifica deduplicación (el item aparece exactamente una vez, bajo `ADMINISTRACIÓN`, no en ambas secciones).
- Verifica que `gerencia` conserva acceso incondicional y `auditoria` solo con capacidad `aliados` — igual que el comportamiento original a nivel de sección.
- Verifica `authorize()` (navegación directa por URL), no solo visibilidad de menú — cubre el requisito de "autorización sin cambios" en ambos planos.
- Cubre los 4 roles mencionados en el contexto (gerencia, auditoria, admin_tienda, asesor); no puedo confirmar si existen otros roles con `hasFullCorporateAccess=true` en la secciónAdministración que pudieran heredar visibilidad del item sin tener antes acceso a Aliados — no está en el diff y no tengo el archivo completo para confirmarlo.

**Punto a confirmar (no bloqueante, dado que el test cubre el caso descrito):** el item en `kora-access-control.js` no lleva `roles` propio como sí lo lleva `sidebar.js`. Si la sección Administración en el código real incluye roles adicionales a gerencia/auditoria con `hasFullCorporateAccess=true`, esos roles verían Tesorería sin haberla visto antes en Aliados. Vale la pena que alguien con el archivo completo confirme que ningún rol nuevo queda con `hasFullCorporateAccess` dentro de Administración antes de publicar.

No se tocó código fuera del alcance (solo las 2 ubicaciones del item + la línea de filtro necesaria para preservarlo + el test). No hay sobre-ingeniería.

## APROBADO

Con la observación anterior como seguimiento recomendado, no como bloqueo — el test incluido ya valida el comportamiento exacto pedido para los roles descritos en la tarea.
