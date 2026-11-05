async function authenticate(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const [userResponse, accessResponse, metaAccessResponse] = await Promise.all([
    supabase(env, "/auth/v1/user", token),
    supabase(env, "/rest/v1/rpc/aura_my_access", token, {}),
    supabase(env, "/rest/v1/rpc/aura_meta_ads_my_access", token, {})
  ]);
  if (!userResponse.ok || !accessResponse.ok) return null;
  const user = await userResponse.json();
  const access = await accessResponse.json();
  if (!user.id || !user.email || access.user_id !== user.id || access.email?.toLowerCase() !== user.email.toLowerCase()) return null;
  if (access.active === false || user.banned_until && Date.parse(user.banned_until) > Date.now()) return null;
  const metaGrant = metaAccessResponse.ok ? await metaAccessResponse.json() : null;
  if (metaGrant?.active === false) return null;
  let grant = metaGrant?.active && Array.isArray(metaGrant.permissions) ? { app_id: APP_ID, role_id: metaGrant.role_id || "meta_ads.reader", permissions: metaGrant.permissions } : access.apps?.find((candidate) => candidate.app_id === APP_ID) || null;
  const owner = access.apps?.some((candidate) => candidate.role_id === "aura.owner");
  if (!grant && owner) grant = { app_id: APP_ID, role_id: "aura.owner", permissions: ALL_PERMISSIONS };
  return grant ? { token, access, grant } : null;
}