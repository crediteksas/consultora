// crear_admins.mjs
// Crea usuarios admin_tienda en Supabase Auth + perfil correspondiente.
// Es dry-run por defecto y exige entorno, URL y confirmación del proyecto.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { validateAdminExecution } from '../../../config/admin-script-guard.mjs';

const ADMINS = [
  { tienda: 'CK-01', nombre: 'Luisa Fernanda Medrano Villa',   email: 'luisa.medrano@crediteksas.com' },
  { tienda: 'CK-02', nombre: 'Andrea Karolina Velez Avilez',   email: 'andrea.velez@crediteksas.com' },
  { tienda: 'CK-03', nombre: 'Katty Julieth Puello Perez',     email: 'katty.puello@crediteksas.com' },
  { tienda: 'CK-04', nombre: 'Wendy Dayerli Perez Gomez',      email: 'wendy.perez@crediteksas.com' },
  { tienda: 'CK-05', nombre: 'Luis Alfredo Marin Arango',      email: 'luis.marin@crediteksas.com' },
  { tienda: 'CK-06', nombre: 'Yajaira Salas Figueroa',         email: 'yajaira.salas@crediteksas.com' },
  { tienda: 'CK-07', nombre: 'Vanessa Salas Figueroa',         email: 'vanessa.salas@crediteksas.com' },
  { tienda: 'CK-08', nombre: 'Carmen Susana Viggiani Araujo',  email: 'carmen.viggiani@crediteksas.com' },
  { tienda: 'CK-09', nombre: 'Digna Maria Pantoja Galaraga',   email: 'digna.pantoja@crediteksas.com' },
  { tienda: 'CK-11', nombre: 'Yulimar Astrid Briceño Peña',    email: 'yulimar.briceno@crediteksas.com' },
];

function generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = 'CkTemp-';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length) || '';
}

function executionOptions() {
  return {
    environment: argumentValue('environment') || process.env.KORA_ENV || '',
    targetUrl: argumentValue('target-url') || process.env.KORA_ERP_SUPABASE_URL || '',
    targetProject: argumentValue('target-project') || '',
    confirmProject: argumentValue('confirm-project') || '',
    dryRun: process.argv.includes('--dry-run') || !process.argv.includes('--execute'),
    allowProduction: process.argv.includes('--allow-production'),
    confirmProduction: argumentValue('confirm-production'),
  };
}

async function crearAdmin(supabase, admin) {
  const password = generarPassword();

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: admin.email,
    password: password,
    email_confirm: true,
    user_metadata: {
      nombre: admin.nombre,
      tienda_codigo: admin.tienda,
      creado_por: 'script_crear_admins',
      creado_en: new Date().toISOString(),
    }
  });

  if (authError) {
    return { ok: false, admin, error: `Auth: ${authError.message}` };
  }

  const userId = authData.user.id;

  const { error: perfilError } = await supabase.from('perfiles').insert({
    id: userId,
    nombre: admin.nombre,
    rol: 'admin_tienda',
    tienda_codigo: admin.tienda,
    activo: true,
  });

  if (perfilError) {
    await supabase.auth.admin.deleteUser(userId);
    return { ok: false, admin, error: `Perfil: ${perfilError.message}` };
  }

  return { ok: true, admin, userId, password };
}

async function main() {
  const execution = validateAdminExecution(executionOptions());
  if (execution.dryRun) {
    console.log(
      `DRY-RUN seguro: ${ADMINS.length} usuarios previstos para `
      + `${execution.environment}/${execution.targetProject}. No se realizaron escrituras.`,
    );
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('Falta la credencial administrativa requerida para ejecutar escrituras');
  }
  const supabase = createClient(executionOptions().targetUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Iniciando creación controlada en ${execution.environment}/${execution.targetProject}`);

  const resultados = [];
  for (const admin of ADMINS) {
    process.stdout.write(`  ${admin.tienda} ... `);
    const r = await crearAdmin(supabase, admin);
    resultados.push(r);
    console.log(r.ok ? `✅` : `❌ ${r.error}`);
  }

  const csv = [
    'Tienda,Nombre,Email,Contraseña temporal,Estado',
    ...resultados.map(r =>
      r.ok
        ? `${r.admin.tienda},"${r.admin.nombre}",${r.admin.email},${r.password},OK`
        : `${r.admin.tienda},"${r.admin.nombre}",${r.admin.email},,ERROR: ${r.error}`
    )
  ].join('\n');

  const fecha = new Date().toISOString().split('T')[0];
  const archivo = `credenciales_admins_${fecha}.csv`;
  writeFileSync(archivo, csv, 'utf-8');

  const okCount = resultados.filter(r => r.ok).length;
  console.log(`\n📄 CSV generado: ${archivo}`);
  console.log(`✅ ${okCount}/10 admins creados exitosamente`);

  if (okCount < 10) {
    console.log(`\n⚠️  Errores:`);
    resultados.filter(r => !r.ok).forEach(r => {
      console.log(`   ${r.admin.tienda}: ${r.error}`);
    });
  }
}

main().catch(error => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
