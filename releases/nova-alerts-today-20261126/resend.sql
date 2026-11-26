-- One-off replay explicitly authorized by Oscar; no case revision or eligibility is changed.
DO $replay$
DECLARE n public.nova_retail_notifications; c public.nova_retail_cases;
 request_key constant text:='nova-andrea-detail-club-seven-20261126-v1';
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM pg_advisory_xact_lock(hashtextextended(request_key,0));
 IF EXISTS(SELECT 1 FROM public.audit_log WHERE accion='nova_alerta_reenvio_solicitado' AND detalle->>'request_key'=request_key) THEN RETURN;END IF;
 SELECT * INTO STRICT c FROM public.nova_retail_cases WHERE source_id='d9e1eebb-6bef-4c95-8de7-1b3d136f96ca' FOR UPDATE;
 IF c.store_code<>'club-seven' OR c.state<>'review' OR c.revision<>10 THEN RAISE EXCEPTION 'CASE_CHANGED_REVIEW_REQUIRED';END IF;
 SELECT * INTO STRICT n FROM public.nova_retail_notifications WHERE source_id=c.source_id AND revision=c.revision AND audience='andrea' FOR UPDATE;
 IF n.state NOT IN ('delivered','read') OR n.attempts>=5 OR n.provider_message_id IS NULL THEN RAISE EXCEPTION 'NOTICE_NOT_SAFE_TO_REPLAY';END IF;
 IF (SELECT count(*) FROM public.nova_retail_reviewers WHERE can_review)<>1 OR NOT EXISTS(SELECT 1 FROM public.nova_retail_reviewers WHERE can_review AND recipient=n.recipient) THEN RAISE EXCEPTION 'REVIEWER_CHANGED';END IF;
 INSERT INTO public.audit_log(usuario,accion,tabla,registro_id,detalle) VALUES('NOVA · Solicitud de Óscar','nova_alerta_reenvio_solicitado','nova_retail_notifications',n.id::text,jsonb_build_object('request_key',request_key,'previous_notice',to_jsonb(n)-'recipient','authorization','Explicit user request to send updated Club Seven pending notice'));
 UPDATE public.nova_retail_notifications SET state='queued',provider_message_id=NULL,attempt_id=NULL,error_code=NULL,attempted_at=NULL,next_attempt_at=now() WHERE id=n.id;
END $replay$;
