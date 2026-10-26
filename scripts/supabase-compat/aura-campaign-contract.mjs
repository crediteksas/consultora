// Offline DRAFT: a scoped scheduler/receipt contract, not the complete Sofía
// permission matrix and not a production migration or permission to deploy.
// Existing wider permissions are preserved. No connections or external sends.
const read = columns => ({ privilege: 'SELECT', ...(columns ? { columns } : {}) });
const update = columns => ({ privilege: 'UPDATE', columns });
export const AURA_CAMPAIGN_CONTRACT = Object.freeze({
  project: 'aura', role: 'service_role', schema: 'public', owner: 'postgres',
  tables: [
    { name: 'clientes', grants: [read(['id','telefono','optin_datos','optin_comercial','optin_whatsapp','optin_fecha','optin_version','optin_canal','optin_evidence_id'])] },
    { name: 'sofia_consent_events', grants: [read(['id','telefono','source_message_id','purpose','decision','occurred_at','created_at'])] },
    { name: 'sofia_campaign_suppressions', grants: [read(['telefono','active'])] },
    { name: 'sofia_campaigns', grants: [read(['id','status','approved_at','scheduled_at','template_name','template_language','header_media_url','template_meta_status']),update(['status','updated_at'])] },
    { name: 'sofia_campaign_recipients', grants: [read(),update(['send_status','exclusion_reason','queued_at','meta_message_id','error_code'])] },
    { name: 'sofia_campaign_schedule_v1', grants: [read(),update(['state','last_reason','checked_at'])] },
    { name: 'sofia_delivery_events', grants: [read(),{ privilege: 'INSERT' }] },
  ],
  functions: [
    { name: 'sofia_campaign_contact_eligible_v1', identity: 'p_cliente uuid, p_phone text', types: 'uuid,text' },
    { name: 'sofia_campaign_integrity_v1', identity: 'p_campaign uuid', types: 'uuid' },
    { name: 'sofia_campaign_send_allowed_v1', identity: 'p_recipient uuid', types: 'uuid' },
    { name: 'sofia_campaign_claim_v1', identity: 'p_recipient uuid', types: 'uuid' },
    { name: 'sofia_campaign_finish_v1', identity: 'p_campaign uuid', types: 'uuid' },
  ],
});

const ident = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Invalid identifier');
  return '"' + name + '"';
};
const direct = (object, privilege) => object.grants?.some(g => g.grantee === 'service_role' && g.privilege === privilege);

// Only the ACL shape this helper itself emits is accepted for retries. Other
// grantors/roles/grant options need a separately reviewed restoration plan.
const privilegeLetter = { SELECT: 'r', INSERT: 'a', UPDATE: 'w' };
function ownColumnRights(acl) {
  if (acl == null || acl === '{}') return new Set();
  const match = acl.match(/^\{service_role=([arw]+)\/postgres\}$/);
  if (!match || new Set(match[1]).size !== match[1].length) throw Error('Existing column ACL requires separate review');
  return new Set(match[1]);
}
const definitionKey = fn => `public.${fn.name}(${fn.identity})`;

export function campaignGrantPlan(snapshot, { functionDefinitions } = {}) {
  if (!['relations','functions','schema_grants','policies','defaults','role_config','triggers'].every(k => Array.isArray(snapshot?.[k]))) throw Error('Complete catalog required');
  if (!functionDefinitions || Object.keys(functionDefinitions).length !== AURA_CAMPAIGN_CONTRACT.functions.length || AURA_CAMPAIGN_CONTRACT.functions.some(fn => !/^[a-f0-9]{32}$/.test(functionDefinitions[definitionKey(fn)] || ''))) throw Error('Independently reviewed function definition pins required');
  const namespace = snapshot.schema_grants.find(s => s.schema === 'public');
  if (!namespace?.grants.some(g => ['PUBLIC','service_role'].includes(g.grantee) && g.privilege === 'USAGE')) throw Error('Schema USAGE requires separate review');
  const apply = [], reverse = [], reviewed = [];
  for (const table of AURA_CAMPAIGN_CONTRACT.tables) {
    const actual = snapshot.relations.find(r => r.schema === 'public' && r.name === table.name);
    if (!actual || actual.owner !== 'postgres' || !['r','p'].includes(actual.kind) || actual.rls !== true) throw Error('Missing/protection drift: '+table.name);
    for (const grant of table.grants) {
      if (grant.columns?.some(c => !actual.columns.some(a => a.name === c))) throw Error('Column drift: '+table.name);
      if (direct(actual,grant.privilege)) continue;
      const rights = new Map(actual.columns.map(c => [c.name, ownColumnRights(c.acl)]));
      const letter = privilegeLetter[grant.privilege];
      const missing = grant.columns?.filter(c => !rights.get(c).has(letter));
      if (missing && !missing.length) continue;
      // REVOKE at table level also strips that role's column rights. Refuse a
      // new table grant if its reversal would erase any pre-existing right.
      if (!grant.columns && [...rights.values()].some(set => set.has(letter))) throw Error('Table-level grant would require restoration of existing column ACL: '+table.name);
      const columns = missing ? '('+missing.map(ident).join(',')+')' : '';
      const target = ' ON TABLE public.'+ident(table.name);
      apply.push('GRANT '+grant.privilege+columns+target+' TO service_role;');
      reverse.unshift('REVOKE '+grant.privilege+columns+target+' FROM service_role;');
    }
    reviewed.push(table.name);
  }
  for (const fn of AURA_CAMPAIGN_CONTRACT.functions) {
    const actual = snapshot.functions.find(f => f.schema === 'public' && f.name === fn.name && f.identity === fn.identity);
    if (!actual || actual.owner !== 'postgres' || actual.security_definer !== false || !/^[a-f0-9]{32}$/.test(actual.definition_md5 || '')) throw Error('Invoker/signature drift: '+fn.name);
    if (actual.definition_md5 !== functionDefinitions[definitionKey(fn)]) throw Error('Reviewed function definition drift: '+fn.name);
    if (!direct(actual,'EXECUTE')) {
      const target = ' ON FUNCTION public.'+ident(fn.name)+'('+fn.types+')';
      apply.push('GRANT EXECUTE'+target+' TO service_role;');
      reverse.unshift('REVOKE EXECUTE'+target+' FROM service_role;');
    }
  }
  return { project: 'aura', role: 'service_role', scope: 'scheduler-receipts-subset-only', reviewed,
    apply_sql: apply.join('\n'), reverse_sql: reverse.join('\n'), additions: apply.length,
    production_ready: false,
    limitations: ['Not the full Sofía/NOVA/frontend contract.', 'Use the ORIGINAL recorded reverse plan; regenerating after apply returns a no-op, not the original rollback.', 'Reverse SQL is offline only: exact before/after catalog and concurrency guards still required before production use.', 'No existing privileges, RLS, policies, function bodies or defaults are removed or changed.'] };
}
