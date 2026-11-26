  async function reconcile(env) {
    if (env.NOVA_RETAIL_ENABLED !== "true") return { disabled: true };
    const candidates = await rpc(env, "nova_retail_candidates", {});
    const sources = candidates.map((id) => ({ solicitud_id: id }));
    let done = 0;
    for (const s of sources) {
      try {
        await reconcileOne(env, s.solicitud_id);
        done++;
      } catch {
        console.warn(JSON.stringify({ event: "retail_reconcile_unavailable" }));
      }
    }
    return { evaluated: done };
  }
