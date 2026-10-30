import {createHash} from 'node:crypto';
export const NOVA_BASELINE_SHA256='232513ce40c043e43c530ebad9bb9b3dbfc7d8061cae109f07fd82f841c411fb';
function once(source,anchor,replacement,label){
 const at=source.indexOf(anchor);
 if(at<0||source.indexOf(anchor,at+anchor.length)>=0)throw Error('Anchor changed: '+label);
 return source.slice(0,at)+replacement+source.slice(at+anchor.length);
}
export function transformNova(source){
 const start=source.indexOf('function createRetailRuntime({ fetcher = fetch, now = Date.now, makeInvitation } = {})');
 const end=source.indexOf('__name(createRetailRuntime,',start);
 if(start<0||end<=start)throw Error('Retail runtime boundary changed');
 let s=source.slice(start,end);
 s=once(s,'    return { ...rows[0], effectiveReferences: effective };',
 `    const generalConsentActive = await rpc(env, "nova_retail_consent_current", { p_source: id });
    if (typeof generalConsentActive !== "boolean") throw Error("CONSENT_STATE_UNAVAILABLE");
    return { ...rows[0], effectiveReferences: effective, generalConsentActive };`,'fresh general consent');
 s=once(s,'    if (app && caseRows[0]?.query_request_id) await db',
 '    if (app && s.generalConsentActive === true && caseRows[0]?.query_request_id) await db','no requery of revoked source');
 const repairAnchor='    jobs.sort((a, b) => a.platform.localeCompare(b.platform));';
 s=once(s,repairAnchor,`    const recoveryBatch = caseRows[0]?.query_request_id;
    if (s.generalConsentActive === true && recoveryBatch && jobs.some((j) => j.retail_batch_id === recoveryBatch && j.status === "queued" && ["ALO", "PAYJOY"].includes(j.platform) && !j.inputs)) {
      try {
        const context = await prepareRetailRequery(id, env);
        await restoreRetailRequery(context, recoveryBatch, env, db);
      } catch (error) {
        if (!["PLATFORM_CONSENT_REQUIRED", "SOURCE_AUTHORIZATION_NOT_CURRENT"].includes(error.message)) throw error;
      }
    }
`+repairAnchor,'recover same requery batch');
 s=once(s,'    if (s.revoked_at) decision =',
 '    if (s.revoked_at || s.generalConsentActive !== true) decision =','master revocation decision');
 s=once(s,'source: s.input_hash, revoked: s.revoked_at, photoHashes:',
 'source: s.input_hash, revoked: s.revoked_at, ...(s.generalConsentActive === true ? {} : { generalConsentActive: false }), photoHashes:','master revocation fingerprint');
 s=once(s,'      if (s.revoked_at || s.consent?.granted !== true) continue;',
 '      if (s.revoked_at || s.generalConsentActive !== true || s.consent?.granted !== true) continue;','reference dispatch general consent');
 s=once(s,'if (preparedSource.revoked_at || preparedSource.consent?.granted !== true ||',
 'if (preparedSource.revoked_at || preparedSource.generalConsentActive !== true || preparedSource.consent?.granted !== true ||','prepared dispatch general consent');
 s=once(s,'if (current.revoked_at || current.consent?.granted !== true ||',
 'if (current.revoked_at || current.generalConsentActive !== true || current.consent?.granted !== true ||','final dispatch general consent');
 s=once(s,'    if (s.revoked_at || s.consent?.granted !== true) throw Error("CONSENT_CHANGED");',
 '    if (s.revoked_at || s.generalConsentActive !== true || s.consent?.granted !== true) throw Error("CONSENT_CHANGED");','replacement general consent');
 s=once(s,'      const finish = /* @__PURE__ */ __name((state, id = null, error = null) => rpc(env, "nova_retail_notification_finish", { p_id: n.id, p_attempt: n.attempt_id, p_state: state, p_recipient: recipient || null, p_message: id, p_error: error }), "finish");',
 `      const finish = /* @__PURE__ */ __name((state, id = null, error = null) => rpc(env, "nova_retail_notification_finish", { p_id: n.id, p_attempt: n.attempt_id, p_state: state, p_recipient: recipient || null, p_message: id, p_error: error }), "finish");
      if (await rpc(env, "nova_retail_consent_current", { p_source: n.source_id }) !== true) {
        await finish("failed", null, "CONSENT_REVOKED");
        continue;
      }`,'notification consent guard');
 s=once(s,'      assertScope(actor, c);',
 `      assertScope(actor, c);
      if (["review", "requery", "deliver", "replaceReference", "document"].includes(b.action) && await rpc(env, "nova_retail_consent_current", { p_source: b.id }) !== true) throw Error("CONSENT_REVOKED");`,'new actions guard after scope');
 s=once(s,'e.code = d.code || d.error_code || null;',
 'e.code = d.code || d.error_code || null;\n        if (d.message === "CONSENT_REVOKED") e.message = "CONSENT_REVOKED";','known SQL consent error');
 s=once(s,'["PLATFORM_CONSENT_REQUIRED", "SOURCE_AUTHORIZATION_NOT_CURRENT", "QUERY_IN_PROGRESS", "QUERY_INPUT_CONFLICT"].includes(e.message)',
 '["CONSENT_REVOKED", "PLATFORM_CONSENT_REQUIRED", "SOURCE_AUTHORIZATION_NOT_CURRENT", "QUERY_IN_PROGRESS", "QUERY_INPUT_CONFLICT"].includes(e.message)','consent conflict response');
 let out=source.slice(0,start)+s+source.slice(end);
 out=once(out,"const messages={PLATFORM_CONSENT_REQUIRED:","const messages={CONSENT_REVOKED:'La autorización general de datos está revocada. Conservamos el expediente, pero no se permiten nuevas gestiones ni abrir fotos.',PLATFORM_CONSENT_REQUIRED:",'portal consent explanation');
 return out;
}
export function transformClientes(source){
 return once(source,'"nova_retail_confirm_delivery"]);','"nova_retail_confirm_delivery", "nova_retail_consent_current"]);','private gateway consent RPC allowlist');
}
export const sourceHash=source=>createHash('sha256').update(source).digest('hex');

