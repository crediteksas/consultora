import { AURA_AUTH, createAuraAuthClient } from './aura-auth.mjs';

// Read the latest shared session for every request: the shell may have renewed it.
export function createMetaSessionToken(options = {}) {
  let pending;
  return function metaSessionToken() {
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        const storage = options.storage ?? globalThis.localStorage;
        const auth = createAuraAuthClient({ ...options, storage });
        auth.setRememberSession(Boolean(storage.getItem(AURA_AUTH.storage)));
        return auth.token();
      }).finally(() => { pending = null; });
    }
    return pending;
  };
}

export const metaSessionToken = createMetaSessionToken();
