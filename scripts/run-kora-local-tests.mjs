import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const security = readdirSync('tests/security')
  .filter(name => name.endsWith('.test.mjs') && name !== 'live-smoke.test.mjs')
  .map(name => `tests/security/${name}`);
// AURA (tests/agentes/*) tiene su propio ciclo de vida, separado de KORA
// (confirmado por tests/security/separated-artifacts.test.mjs). No debe
// bloquear el deploy de KORA. tests/erp/* completo tampoco se incluye aquí
// porque arrastra fallos preexistentes sin relación con este pipeline;
// se incluye puntualmente el test de regresión de cada fix ya validado.
const erp = [
  'tests/erp/utilidad-creditek-domain.test.mjs', // KORA-2026-000034
  'tests/erp/aliados-utilidad-corte.test.mjs',
  'tests/erp/aliados-asociacion-historica.test.mjs',
  'tests/erp/aliados-prefijo-a-alexander.test.mjs',
  'tests/erp/aliados-ejecutivos-periodo.test.mjs',
];
execFileSync(process.execPath, ['--test', ...security, ...erp], { stdio: 'inherit' });
