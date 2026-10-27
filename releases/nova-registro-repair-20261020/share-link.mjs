// Stable sharing capability for an existing link. Never reactivates revoked links.
// Domain separation prevents these signatures being reused as original token hashes.
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const message = id => encoder.encode('creditek:registration-share:v1:' + id);
async function key(secret) {
  if (!secret) throw new Error('contexto_no_disponible');
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
export async function createShareToken(id, secret) {
  if (!uuid.test(id)) throw new Error('enlace_invalido');
  const signature = await crypto.subtle.sign('HMAC', await key(secret), message(id));
  return 'nr1.' + id + '.' + Array.from(new Uint8Array(signature), b=>b.toString(16).padStart(2,'0')).join('');
}
export async function shareTokenFilter(token, secret) {
  if (!token.startsWith('nr1.')) return null; // Original opaque links remain supported.
  const [prefix,id,signature,...rest] = token.split('.');
  if (rest.length || !uuid.test(id||'') || !/^[0-9a-f]{64}$/.test(signature||'')) throw new Error('enlace_invalido');
  const bytes = Uint8Array.from(signature.match(/../g), b=>parseInt(b,16));
  if (!await crypto.subtle.verify('HMAC', await key(secret), bytes, message(id))) throw new Error('enlace_invalido');
  return {id:'eq.'+id}; // Caller MUST retain activo=true, revoked_at=null and active-origin checks.
}
