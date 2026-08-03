import { fileURLToPath } from 'node:url';

function publicHeaders(anonKey, bearer = anonKey) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
  };
}

async function check(response, name) {
  if (!response.ok) throw new Error(`${name} falló con HTTP ${response.status}`);
  return { name, status: response.status };
}

export async function checkKoraSupabaseHealth({ url, anonKey, fetchImpl = fetch }) {
  if (!url || !anonKey) throw new Error('Falta la configuración pública de KORA');
  const origin = url.replace(/\/$/, '');
  const headers = publicHeaders(anonKey);
  return Promise.all([
    fetchImpl(`${origin}/auth/v1/settings`, { headers }).then(response => check(response, 'Auth')),
    fetchImpl(`${origin}/rest/v1/perfiles?select=id&limit=0`, { headers }).then(response => check(response, 'REST/RLS')),
    fetchImpl(`${origin}/rest/v1/rpc/es_central`, {
      method: 'POST',
      headers,
      body: '{}',
    }).then(response => check(response, 'RPC')),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await checkKoraSupabaseHealth({
    url: process.env.KORA_ERP_SUPABASE_URL,
    anonKey: process.env.KORA_ERP_SUPABASE_ANON_KEY,
  });
  console.log(results.map(result => `${result.name}: HTTP ${result.status}`).join('\n'));
}
