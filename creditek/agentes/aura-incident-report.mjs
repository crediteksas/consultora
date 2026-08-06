const REDACTIONS = [
  [/\b(?:bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi, '[TOKEN REDACTADO]'],
  [/\b(?:sk|AIza|EAAB)[A-Za-z0-9_.-]{12,}\b/g, '[CLAVE REDACTADA]'],
  [/(password|contrase(?:ñ|n)a|token|secret|cookie|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTADO]'],
  [/([?&#](?:code|access_token|refresh_token|token|key|secret)=)[^&#\s]+/gi, '$1[REDACTADO]'],
  [/\b(?:\+?57\s*)?3\d{9}\b/g, '[TELÉFONO REDACTADO]'],
  [/\b[A-Z0-9._%+-]+@(?!crediteksas\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[CORREO REDACTADO]'],
];

export const AURA_VERSION = 'AURA v1.1.0';

export function sanitizeIncidentText(value) {
  return REDACTIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value ?? '').slice(0, 12_000),
  );
}

export function technicalContext({
  route = globalThis.location?.pathname || '',
  user = 'Usuario AURA',
  browser = globalThis.navigator?.userAgent || 'No disponible',
  viewport = globalThis.innerWidth && globalThis.innerHeight
    ? `${globalThis.innerWidth} × ${globalThis.innerHeight}`
    : 'No disponible',
  now = new Date(),
} = {}) {
  return {
    fecha: now.toISOString(),
    ruta: sanitizeIncidentText(route),
    usuario: sanitizeIncidentText(user),
    navegador: sanitizeIncidentText(browser),
    viewport: sanitizeIncidentText(viewport),
    version: AURA_VERSION,
  };
}

export function buildIncidentReport({ module, error, expected, evidence, context, technicalErrors = [] }) {
  const safeErrors = technicalErrors.slice(-10).map(sanitizeIncidentText);
  const file = evidence
    ? `${sanitizeIncidentText(evidence.name)} · ${sanitizeIncidentText(evidence.type || 'archivo')} · ${Number(evidence.size || 0)} bytes`
    : 'Sin archivo adjunto';
  return [
    'REPORTE DE INCIDENTE · AURA',
    `Módulo: ${sanitizeIncidentText(module)}`,
    `Fecha: ${context.fecha}`,
    `Ruta: ${context.ruta}`,
    `Usuario: ${context.usuario}`,
    `Navegador: ${context.navegador}`,
    `Viewport: ${context.viewport}`,
    `Versión: ${context.version}`,
    '',
    'ERROR OBSERVADO',
    sanitizeIncidentText(error),
    '',
    'RESULTADO ESPERADO',
    sanitizeIncidentText(expected),
    '',
    `EVIDENCIA: ${file}`,
    '',
    'ERRORES TÉCNICOS RELEVANTES',
    safeErrors.length ? safeErrors.join('\n') : 'No se capturaron errores técnicos.',
    '',
    'Nota de seguridad: el reporte fue sanitizado y no incluye contraseñas, tokens, cookies ni claves API.',
  ].join('\n');
}

export function downloadIncidentText(report) {
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `incidente-aura-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
