**APPROVED** para el contenido del diff en sí (video-ffmpeg.mjs/video-mp4.mjs/test), con una reserva concreta que debes resolver antes de publicar:

1. **No pude verificar asset-routes.mjs**: el archivo tiene una única línea >25k tokens y mi herramienta Read no puede leerla parcialmente (offset/limit es por línea, no por carácter). El diff no toca ese archivo, pero el nuevo test asume que ya enruta `video-ffmpeg-20261029.2.mjs` igual que el legacy y 404 en variantes (`.3`, `?url=`). No puedo confirmar esa lógica existe — verifícalo tú o con Codex antes de publicar.
2. Lo demás es correcto: pines SHA256/bytes de `FFMPEG_PINS` no cambian, `credentials:'same-origin'` + `redirect:'error'` + URL fija al propio origen es razonable para el 403 (cookie de sesión propia, no cross-origin), y el mensaje de error solo expone status HTTP validado (100–599), nunca body/statusText — confirmado en el código.

No afirmo haber ejecutado pruebas ni retest en producción. Falta esa confirmación del punto 1 antes de publicar la delta.

Codex confirmó la reserva antes de publicar: ejecutó serveFFmpegAsset real; versión2 y aliaslegacy200 con credentials same-origin, variante3 y queryurl404. Las pruebas verifican que Cookie/Authorization no se reenvían alCDN.57pruebasmásbuild/sintaxis/diffcheckaprobados. Causa de403 sigue pendiente de retest en producción.
