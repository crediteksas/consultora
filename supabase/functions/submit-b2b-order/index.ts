import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'access-control-allow-origin': Deno.env.get('B2B_ALLOWED_ORIGIN') ?? '',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const hmacHex = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });

  try {
    const authorization = request.headers.get('authorization') ?? '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json(401, { ok: false, error: 'Sesión requerida' });

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serverKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const appsScriptUrl = requiredEnv('B2B_APPS_SCRIPT_URL');
    const appsScriptSecret = requiredEnv('B2B_APPS_SCRIPT_SECRET');

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) return json(401, { ok: false, error: 'Sesión inválida' });

    const payload = await request.json();
    const serverClient = createClient(supabaseUrl, serverKey, {
      auth: { persistSession: false },
    });

    const { data: resolved, error: resolveError } = await serverClient.rpc(
      'resolve_b2b_order_items',
      {
        p_user_id: authData.user.id,
        p_order_id: payload.order_id,
        p_store_code: payload.store_code,
        p_store_name: payload.store_name,
        p_city: payload.city,
        p_items: payload.items,
      },
    );
    if (resolveError) return json(400, { ok: false, error: resolveError.message });
    if (resolved?.duplicate && resolved?.response) return json(200, resolved.response);

    const timestamp = new Date().toISOString();
    const internalBody = JSON.stringify({
      action: 'guardar_pedido_seguro',
      timestamp,
      order_id: payload.order_id,
      items: resolved.items,
    });
    const signature = await hmacHex(appsScriptSecret, internalBody);
    const appsResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ internalBody, signature }),
    });
    if (!appsResponse.ok) throw new Error('El servicio de pedidos no respondió correctamente');
    const appsResult = await appsResponse.json();
    if (!appsResult?.ok) throw new Error(appsResult?.error || 'No fue posible registrar el pedido');

    const publicResponse = {
      ok: true,
      order_number: appsResult.numeroPedido,
      total_units: resolved.total_units,
      total_sale: resolved.total_sale,
    };
    await serverClient
      .from('b2b_order_dispatches')
      .update({ status: 'sent', public_response: publicResponse, sent_at: new Date().toISOString() })
      .eq('user_id', authData.user.id)
      .eq('order_id', payload.order_id);

    return json(200, publicResponse);
  } catch (error) {
    console.error('submit-b2b-order failed', error instanceof Error ? error.message : 'unknown');
    return json(500, { ok: false, error: 'No fue posible registrar el pedido' });
  }
});
