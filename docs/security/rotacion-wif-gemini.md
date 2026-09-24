# Rotación de la identidad WIF del proxy Gemini

El repositorio llegó a rastrear una llave privada. Quitarla del árbol actual **no** revoca la llave ni borra copias del historial, forks o cachés. Tratarla como comprometida hasta completar la rotación.

Responsable: propietario de GitHub, Cloudflare y GCP. No copiar secretos en issues, PR, chats, logs, comandos con argumentos o archivos del repositorio.

1. Restringir de inmediato el acceso al repositorio y preservar evidencia de auditoría.
2. Generar fuera del repositorio un nuevo par de llaves. Cargar la privada como secreto `GCP_WIF_PRIVATE_KEY` y la pública como `GCP_WIF_PUBLIC_JWK` del Worker. Usar un `kid` nuevo.
3. Actualizar la confianza del proveedor WIF en GCP y desplegar el proxy en una ventana coordinada. Comprobar que JWKS publica únicamente la nueva llave y que Gemini y Veo funcionan; no registrar el material criptográfico en la evidencia.
4. Revocar la llave anterior y revisar los registros de intercambio STS y auditoría de GCP desde la primera exposición conocida. Investigar emisiones ajenas al Worker.
5. Reducir los permisos IAM de la cuenta de servicio a los estrictamente necesarios.
6. Tras comprobar la rotación, acordar con el propietario la purga del historial de Git; esta acción reescribe commits y requiere coordinación con todos los clones y forks. La eliminación del árbol actual por sí sola no resuelve la exposición histórica.

Evidencia mínima de cierre: fecha de revocación, identificador público de la nueva llave, versión desplegada, resultados de pruebas funcionales, revisión de auditoría y aprobación del propietario. Nunca adjuntar la llave.
