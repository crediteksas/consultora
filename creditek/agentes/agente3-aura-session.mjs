const STORAGE_KEY = 'aura_supabase_session_v1';

function parse(storage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    return value?.access_token && value?.refresh_token ? value : null;
  } catch {
    return null;
  }
}

export function auraSessionToken({ persistent = globalThis.localStorage, transient = globalThis.sessionStorage } = {}) {
  return (parse(persistent) || parse(transient))?.access_token || '';
}
