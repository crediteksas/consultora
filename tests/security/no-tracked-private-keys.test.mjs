import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert.ok(result.status === 0 || (args[0] === 'grep' && result.status === 1), result.stderr);
  return result;
}

test('ninguna llave PEM ni encabezado de llave privada está versionado', () => {
  const tracked = git('ls-files', '-z').stdout.split('\0').filter(Boolean);
  assert.deepEqual(tracked.filter(file => /\.pem$/i.test(file)), [], 'retira los PEM del índice de Git');
  const marker = ['-----BEGIN', '(RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'].join(' ');
  const matches = git('grep', '--cached', '-l', '-I', '-E', '-e', marker, '--').stdout.trim();
  assert.equal(matches, '', 'hay contenido de llave privada en archivos versionados');
});
