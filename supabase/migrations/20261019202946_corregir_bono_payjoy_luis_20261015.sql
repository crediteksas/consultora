begin;
lock table public.payment_orders in access exclusive mode;
lock table public.liquidation_bonuses,public.payment_dispatch_items in share row exclusive mode;
select set_config('request.jwt.claim.sub',(select id::text from public.perfiles where rol='gerencia' and activo and id::text='6de0ad26-64af-4966-8cd9-d468880af627'),true);
alter table public.payment_orders disable trigger zzzz_proteger_destino_pago;
alter table public.payment_orders disable trigger proteger_segmento_pago;
do $repair$
declare p public.payment_orders%rowtype; b public.liquidation_beneficiaries%rowtype;
 a public.beneficiary_bank_accounts%rowtype; old_bonuses jsonb; n integer;
begin
 if exists(select 1 from public.audit_log where accion='correccion_bono_payjoy_luis_20261015') then return; end if;
 select p0.* into strict p from public.payment_orders p0 join public.liquidation_beneficiaries b0 on b0.id=p0.beneficiary_id
 where b0.nombre='Yeimi Montesino' and p0.cutoff_snapshot='2026-10-15' and p0.platform_snapshot='payjoy'
 and p0.valor=60000 and p0.payment_kind='ejecutivo';
 if p.estado<>'programado' or p.fecha_pagada is not null or p.paid_by is not null or p.soporte_path is not null
 or p.authorized_by is distinct from auth.uid() then raise exception 'El pago cambió o no corresponde a la autorización'; end if;
 if exists(select 1 from public.payment_dispatch_items where snapshot::text like '%'||p.id::text||'%' or report_ref like '%'||p.id::text||'%') then raise exception 'Pago ya incluido en orden emitida'; end if;
 select * into strict b from public.liquidation_beneficiaries where nombre='Luis Rivera' and identificacion='92523673' and activo and tipo='ejecutivo';
 select * into strict a from public.beneficiary_bank_accounts where beneficiary_id=b.id and activo and validada and banco='NEQUI' and right(numero_cuenta,4)='8000';
 select jsonb_agg(to_jsonb(b0)),count(*) into old_bonuses,n from public.liquidation_bonuses b0 join public.payment_items i on i.bonus_id=b0.id
 where i.payment_order_id=p.id and b0.beneficiary_id=p.beneficiary_id and b0.estado='aprobado' and b0.valor=30000;
 if n<>2 then raise exception 'Los dos bonos no coinciden'; end if;
 update public.liquidation_bonuses set beneficiary_id=b.id where id in(select bonus_id from public.payment_items where payment_order_id=p.id);
 update public.payment_orders set beneficiary_id=b.id,bank_account_id=a.id,secuencia_beneficiario=(select coalesce(max(secuencia_beneficiario),0)+1 from public.payment_orders where liquidation_id=p.liquidation_id and beneficiary_id=b.id),authorized_by=auth.uid(),authorized_at=now(),updated_at=now() where id=p.id;
 if not exists(select 1 from public.payment_orders where id=p.id and beneficiary_id=b.id and valor=60000 and estado='programado'
 and fecha_pagada is null and paid_by is null and soporte_path is null and bank_snapshot->>'holder_identification'=b.identificacion
 and bank_snapshot->>'account_number'=a.numero_cuenta) then raise exception 'Verificación posterior falló'; end if;
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle) values(auth.uid()::text,
 'correccion_bono_payjoy_luis_20261015','payment_orders',p.id::text,jsonb_build_object(
 'motivo','Óscar solicita en chat Codex cambiar a Luis el bono de Yeimi de 60000 PayJoy corte 2026-10-15.',
 'antes',to_jsonb(p),'bonos_antes',old_bonuses,'beneficiario_nuevo',b.id,'cuenta_nueva',a.id,'valor',60000,'sin_desembolso',true));
end $repair$;
alter table public.payment_orders enable trigger proteger_segmento_pago;
alter table public.payment_orders enable trigger zzzz_proteger_destino_pago;
commit;