  async function sendNotices(env) {
    if (env.NOVA_RETAIL_ENABLED !== "true" || (await templateHealth(env)).staff !== "APPROVED") return;
    for (let i = 0; i < 5; i++) {
      const n = await rpc(env, "nova_retail_notification_claim", {});
      if (!n) break;
      let recipient = null;
      const finish = /* @__PURE__ */ __name((state, id = null, error = null) => rpc(env, "nova_retail_notification_finish", { p_id: n.id, p_attempt: n.attempt_id, p_state: state, p_recipient: recipient || null, p_message: id, p_error: error }), "finish");
      try{
      if (n.audience === "andrea") {
        const people = await db(env, "kora", "nova_retail_reviewers?can_review=eq.true&select=recipient");
        if (people.length === 1) recipient = people[0].recipient;
      } else {
        const contact = await db(env, "kora", "nova_retail_store_contacts?store_code=eq." + n.store_code + "&select=recipient&limit=1");
        recipient = contact[0]?.recipient;
      }
      }catch{await finish("failed",null,"CONTACT_LOOKUP_UNAVAILABLE");continue;}
      if (await rpc(env, "nova_retail_consent_current", { p_source: n.source_id }) !== true) {
        await finish("failed", null, "CONSENT_REVOKED");
        continue;
      }
      if (!/^573\d{9}$/.test(recipient || "")) {
        await finish("queued", null, "CONTACT_REQUIRED");
        continue;
      }
      let text = n.case_state === "review" ? "Solicitud pendiente de revisión de Andrea" : n.case_state === "authorized" ? "Autorizado para tramitar" : "Rechazado";
      let noticeReference="NOVA-"+n.source_id.slice(0,8).toUpperCase();
      if(n.audience==="andrea"){
        try{
          const cases=await db(env,"kora","nova_retail_cases?source_id=eq."+n.source_id+"&revision=eq."+n.revision+"&select=source_id,revision,store_code,state,summary,decision&limit=1");
          const origins=await db(env,"kora","origenes?codigo=eq."+encodeURIComponent(n.store_code)+"&select=codigo,nombre&limit=1");
          const content=andreaNoticeContent(n,cases[0],origins[0]?.nombre);
          noticeReference=content.reference;text=content.text;
          try{await env.NOVA_EVENTS?.put("nova:retail:notice-content:v1:"+n.id+":"+n.attempt_id,JSON.stringify({notice_id:n.id,attempt_id:n.attempt_id,source_id:n.source_id,revision:n.revision,template:"nova_aviso_ejecutivo_v1",body_parameters:[content.reference,content.text],direct_url:content.url}),{expirationTtl:2592000});}catch{console.warn(JSON.stringify({event:"retail_notice_snapshot_unavailable"}));}
        }catch{await finish("failed",null,"NOTICE_DETAILS_UNAVAILABLE");continue;}
      }
      try {
        const r = await fetcher("https://graph.facebook.com/v26.0/" + env.NOVA_PHONE_NUMBER_ID + "/messages", { method: "POST", redirect: "manual", headers: { authorization: "Bearer " + env.NOVA_META_ACCESS_TOKEN, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: recipient, type: "template", template: { name: "nova_aviso_ejecutivo_v1", language: { code: "es_CO" }, components: [{ type: "body", parameters: [{ type: "text", text: noticeReference }, { type: "text", text }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: n.source_id }] }] } }), signal: AbortSignal.timeout(1e4) });
        const d = await bounded2(r, 8192);
        if (r.ok && typeof d.messages?.[0]?.id === "string") await finish("accepted", d.messages[0].id);
        else await finish(r.status >= 400 && r.status < 500 ? "failed" : "uncertain", null, String(d.error?.code || r.status));
      } catch {
        await finish("uncertain", null, "SEND_UNCONFIRMED");
      }
    }
  }
