from pathlib import Path
import json,hashlib
r=Path(__file__).resolve().parent;s=(r/'baseline.sql').read_text();changes=[]
def change(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a));s=s.replace(a,b);changes.append([a,b])
change('v_previous_state text; v_consent_active boolean;',"v_previous_state text; v_consent_active boolean; v_old_summary jsonb; v_old_decision jsonb; v_old_revision integer; v_notice public.nova_retail_notifications; v_tasks jsonb; v_gains boolean:=false; v_andrea public.nova_retail_notifications; v_store public.nova_retail_notifications; v_forwarded jsonb:='[]'::jsonb;")
change(' v_previous_state:=r.state;', ' v_previous_state:=r.state;v_old_summary:=r.summary;v_old_decision:=r.decision;v_old_revision:=r.revision;')
a=' insert into public.nova_retail_cases(source_id,cliente_id,store_code,fingerprint,revision,state,decision,summary,rejected_at,valid_until)';change(a,(r/'projection.sql').read_text()+a)
a=s.index(' insert into public.nova_retail_case_events(');b=s.index(' return to_jsonb(r);',a);change(s[a:b],(r/'dispatch.sql').read_text())
(r/'candidate.sql').write_text(s.rstrip().rstrip(';')+';\n');(r/'changes.json').write_text(json.dumps(changes,indent=2)+'\n')
(r/'manifest.json').write_text(json.dumps({n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in ['baseline.sql','candidate.sql']},indent=2)+'\n')
print('One function, notification projection/forwarding only; validation and scope unchanged')
