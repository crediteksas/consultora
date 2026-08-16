import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { validateAdminExecution } from '../../config/admin-script-guard.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'creditek/erp/scripts/crear_admins.mjs');
const staging = {
  environment: 'staging',
  targetUrl: 'https://erp-staging.example.invalid',
  targetProject: 'erp-staging',
  confirmProject: 'erp-staging',
  dryRun: true,
  allowProduction: false,
  confirmProduction: '',
};

test('crear_admins exige entorno y confirmación exacta del proyecto', () => {
  assert.throws(
    () => validateAdminExecution({ ...staging, environment: '' }),
    /entorno es obligatorio/i,
  );
  assert.throws(
    () => validateAdminExecution({ ...staging, confirmProject: 'otro' }),
    /confirmación del proyecto/i,
  );
});

test('dry-run es seguro y no requiere service role', () => {
  const result = validateAdminExecution(staging);
  assert.equal(result.dryRun, true);
  assert.equal(result.requiresServiceKey, false);
});

test('production se rechaza por defecto y requiere doble confirmación', () => {
  const production = {
    ...staging,
    environment: 'production',
    targetUrl: 'https://erp-production.example.invalid',
    targetProject: 'erp-production',
    confirmProject: 'erp-production',
    dryRun: false,
  };
  assert.throws(() => validateAdminExecution(production), /production está bloqueado/i);
  assert.throws(
    () => validateAdminExecution({ ...production, allowProduction: true }),
    /confirmación adicional/i,
  );
  assert.equal(
    validateAdminExecution({
      ...production,
      allowProduction: true,
      confirmProduction: 'KORA_PRODUCTION_ADMIN_WRITE',
    }).requiresServiceKey,
    true,
  );
});

test('crear_admins ejecuta dry-run sin credencial ni escrituras', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--environment=staging',
    '--target-url=https://erp-staging.example.invalid',
    '--target-project=erp-staging',
    '--confirm-project=erp-staging',
    '--dry-run',
    '--execute',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {},
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN/);
  assert.doesNotMatch(result.stdout, /@creditek|contraseña|password/i);
});

test('crear_admins rechaza production antes de pedir credenciales', () => {
  const result = spawnSync(process.execPath, [
    script,
    '--environment=production',
    '--target-url=https://erp-production.example.invalid',
    '--target-project=erp-production',
    '--confirm-project=erp-production',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {},
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production está bloqueado/i);
  assert.doesNotMatch(result.stderr, /SUPABASE_SERVICE_KEY/);
});
