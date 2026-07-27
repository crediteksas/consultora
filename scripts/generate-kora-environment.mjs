import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const environment = require('../config/kora-environment.js');
const productionEndpoints = require('../config/production-endpoints.js');

export async function generateEnvironmentFile(input, outputFile, logger = console) {
  const validated = environment.validateEnvironment(input, { productionEndpoints });
  const ordered = Object.fromEntries(
    environment.PUBLIC_KEYS.map(key => [key, validated[key]]),
  );
  const source = [
    '// Generado automáticamente. Contiene solo configuración pública del frontend.',
    `window.__KORA_ENV__ = Object.freeze(${JSON.stringify(ordered, null, 2)});`,
    '',
  ].join('\n');
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, source, { encoding: 'utf8', mode: 0o600 });
  logger.log?.(`Configuración KORA ${validated.KORA_ENV} generada correctamente [REDACTED]`);
  return outputFile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputArgument = process.argv.find(argument => argument.startsWith('--output='));
  const outputFile = outputArgument
    ? path.resolve(outputArgument.slice('--output='.length))
    : path.resolve('config/generated/kora-environment.js');
  const input = Object.fromEntries(
    environment.PUBLIC_KEYS.map(key => [key, process.env[key] || '']),
  );
  await generateEnvironmentFile(input, outputFile);
}
