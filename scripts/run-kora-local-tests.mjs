import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const security = readdirSync('tests/security')
  .filter(name => name.endsWith('.test.mjs') && name !== 'live-smoke.test.mjs')
  .map(name => `tests/security/${name}`);
const agents = readdirSync('tests/agentes')
  .filter(name => name.endsWith('.test.mjs'))
  .map(name => `tests/agentes/${name}`);
execFileSync(process.execPath, ['--test', ...security, ...agents], { stdio: 'inherit' });
