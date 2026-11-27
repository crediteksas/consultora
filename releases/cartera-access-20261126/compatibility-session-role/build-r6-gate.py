from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parent;B=R.parent;O=R/'candidate';m=json.loads((R/'r6-base-input-pins.json').read_text())
def source(n):
 s=(B/'candidate'/n).read_text();assert hashlib.sha256(s.encode()).hexdigest()==m['sources']['candidate/'+n];return s
q=source('catalog-query.sql')
safe=(R/'safe-message-partition.sql.fragment').read_text().strip().replace("'realtime.messages'::regclass","to_regclass('realtime.messages')")
q=q.replace("'rls',c.relrowsecurity,","'rls',c.relrowsecurity,'safe_message_partition',("+safe+"),",1)
needle="'authenticated_permissive',exists("
q=q.replace(needle,"'session_privileged',case when to_regrole('kora_cartera_session') is null then null else (has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') or c.relowner=to_regrole('kora_cartera_session')) end,\n      "+needle,1)
needle="  'cartera_coverage',jsonb_build_object("
extra="""
    'graphql_installed',exists(select 1 from pg_extension where extname='pg_graphql'),
    'session_role',(select jsonb_build_object('login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'create_db',rolcreatedb,'create_role',rolcreaterole,'replication',rolreplication,'bypass',rolbypassrls) from pg_roles where rolname='kora_cartera_session'),
    'session_schema_privilege',case when to_regrole('kora_cartera_session') is null then null else exists(select 1 from pg_namespace where nspname in('auth','kora_private','kora_cartera_policy','storage','realtime') and (has_schema_privilege('kora_cartera_session',oid,'USAGE') or has_schema_privilege('kora_cartera_session',oid,'CREATE'))) end,
    'session_settings',(select setconfig from pg_db_role_setting where setrole=to_regrole('kora_cartera_session') and setdatabase=0),
    'session_memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'bootstrap_grantor',grantor=10,'admin',admin_option,'inherit',inherit_option,'set',set_option) order by roleid,member,grantor),'[]') from pg_auth_members where roleid=to_regrole('kora_cartera_session') or member=to_regrole('kora_cartera_session')),
    'rpc_returns',(select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'returns',format_type(p.prorettype,null),'set',p.proretset) order by p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('cartera_operador_inicio','cartera_operador_datos','cartera_operador_guardar_gestion','cartera_operador_solicitar_provision')),
"""
assert q.count(needle)==1;q=q.replace(needle,needle+extra,1)
q=q.replace('\n)\nSELECT jsonb_build_object','\n), catalog_snapshot AS (\nSELECT jsonb_build_object',1)
q=q.replace(') AS snapshot;',") AS snapshot)\nSELECT CASE WHEN to_regprocedure('public.cartera_operador_inicio()') IS NULL AND to_regrole('kora_cartera_session') IS NULL THEN snapshot - 'cartera_coverage' ELSE snapshot END AS snapshot FROM catalog_snapshot;",1)
(O/'catalog-query.sql').write_text(q)
gate=source('cartera-coverage-gate.mjs')
needle=" if(!c||!Array.isArray(c.tables)||!Array.isArray(c.publications))return ['Cartera requires an independent complete deny-coverage catalog'];"
assert gate.count(needle)==1
gate=gate.replace(needle,needle+"""
 if(c.graphql_installed!==false)errors.push('Cartera GraphQL requires separate review');
 if(!c.session_role||Object.values(c.session_role).some(v=>v!==false)||c.session_schema_privilege!==false)errors.push('Cartera dedicated session attributes/schema changed');
 if(JSON.stringify([...(c.session_settings||[])].sort())!==JSON.stringify(['lock_timeout=2s','statement_timeout=8s']))errors.push('Cartera dedicated session settings changed');
 const memberships=c.session_memberships||[];
 if(memberships.length!==2||!memberships.some(m=>m.role==='kora_cartera_session'&&m.member==='postgres'&&m.bootstrap_grantor&&m.admin===true&&m.inherit===false&&m.set===false)||!memberships.some(m=>m.role==='kora_cartera_session'&&m.member==='authenticator'&&m.grantor==='postgres'&&m.admin===false&&m.inherit===false&&m.set===true))errors.push('Cartera dedicated session memberships changed');
 const names=['cartera_operador_inicio','cartera_operador_datos','cartera_operador_guardar_gestion','cartera_operador_solicitar_provision'];
 if(c.rpc_returns?.length!==4||names.some(name=>c.rpc_returns.filter(p=>p.name===name&&p.returns==='jsonb'&&p.set===false).length!==1))errors.push('Cartera dedicated RPC return/overload changed');
 for(const name of names){
  const f=snapshot.functions.find(f=>f.schema==='public'&&f.name===name);
  const want=['kora_cartera_session',...(name==='cartera_operador_inicio'?['authenticated']:[])].sort();
  const got=f?.grants?.filter(g=>g.grantee!==f.owner)||[];
  if(!f||f.owner!=='kora_cartera_operator'||!f.security_definer||JSON.stringify(got.map(g=>g.grantee).sort())!==JSON.stringify(want)||got.some(g=>g.privilege!=='EXECUTE'||g.grantable||g.grantor!=='kora_cartera_operator'))errors.push('Cartera dedicated RPC ACL changed: '+name);
 }
""")
gate=gate.replace("   if(r.rls!==true||!['r','p'].includes(r.kind)||r.authenticated_permissive!==false)errors.push('Cartera managed surface not isolated: '+k);", "   if(r.session_privileged!==false)errors.push('Cartera managed surface not isolated: '+k);")
gate=gate.replace("  const p=r.policy;", "  if(r.session_privileged!==false)errors.push('Cartera session data grant: '+k);\n  const p=r.policy;")
gate=gate.replace("  const k=key(r);if(!required.has(k)||seen.has(k))","  const k=key(r);if(r.safe_message_partition===true){if(required.has(k)||r.schema!=='realtime'||!['r','p'].includes(r.kind)||r.session_privileged!==false)errors.push('Cartera unsafe partition: '+k);continue;}if(!required.has(k)||seen.has(k))")
gate+='\n'+(R/'overlay-checker.fragment.mjs').read_text()
gate=gate.replace(" if(!snapshot.functions?.some(f=>f.schema==='public'&&f.name==='cartera_operador_inicio'))return [];"," const installed=snapshot.functions?.some(f=>(f.schema==='public'&&f.name.startsWith('cartera_operador_'))||(['kora_private','kora_cartera_policy'].includes(f.schema)&&f.name.startsWith('cartera_')))||snapshot.policies?.some(p=>p.name==='cartera_dedicated_deny')||snapshot.schema_grants?.some(s=>s.schema==='kora_cartera_policy')||snapshot.cartera_coverage?.session_role!=null;if(!installed)return [];\n if(!snapshot.functions?.some(f=>f.schema==='public'&&f.name==='cartera_operador_inicio'))return ['Cartera partial installation: bootstrap missing'];")
(O/'cartera-coverage-gate.mjs').write_text(gate)
(O/'cartera-managed-inventory.mjs').write_text(source('cartera-managed-inventory.mjs'))
checker=source('check-permission-contract.mjs').replace("['PUBLIC', 'anon', 'authenticated', 'service_role']","['PUBLIC', 'anon', 'authenticated', 'service_role','kora_cartera_session','kora_cartera_operator']")
checker=checker.replace("import {checkCarteraCoverage}","import {checkCarteraCoverage,carteraOverlayKeys}")
checker=checker.replace("  errors.push(...checkCarteraCoverage(after));","  errors.push(...checkCarteraCoverage(after));\n  const overlay=carteraOverlayKeys(before,after,contract);errors.push(...overlay.errors);")
checker=checker.replace("policy_count: object.policy_count, options:","policy_count: overlay.keys.has(key)?undefined:object.policy_count, options:")
(O/'check-permission-contract.mjs').write_text(checker)
print('R6 mandatory catalog/permission-gate candidates generated')
