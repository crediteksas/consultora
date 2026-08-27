begin;

alter table public.aura_permissions
  drop constraint if exists aura_permissions_app_id_check;
alter table public.aura_permissions
  add constraint aura_permissions_app_id_check
  check (app_id in (
    'aura_core', 'portal_b2b', 'sofia', 'meta_ads',
    'convenios', 'registro_links', 'cartera', 'consultas'
  ));

alter table public.aura_user_app_roles
  drop constraint if exists aura_user_app_roles_app_id_check;
alter table public.aura_user_app_roles
  add constraint aura_user_app_roles_app_id_check
  check (app_id in (
    'aura_core', 'portal_b2b', 'sofia', 'meta_ads',
    'convenios', 'registro_links', 'cartera', 'consultas'
  ));

alter table public.aura_audit_log
  drop constraint if exists aura_audit_log_app_id_check;
alter table public.aura_audit_log
  add constraint aura_audit_log_app_id_check
  check (app_id is null or app_id in (
    'aura_core', 'portal_b2b', 'sofia', 'meta_ads',
    'convenios', 'registro_links', 'cartera', 'consultas'
  ));

insert into public.aura_roles (role_id, label)
values
  ('aura.admin', 'Administración funcional completa de AURA'),
  ('aura.andrea_limited', 'Acceso limitado de Andrea a operación autorizada')
on conflict (role_id) do nothing;

insert into public.aura_permissions (permission_id, app_id, label)
values
  ('aura.dashboard.read', 'aura_core', 'Abrir panel principal de AURA'),
  ('aura.configuration.manage', 'aura_core', 'Administrar configuración funcional de AURA'),
  ('convenios.use', 'convenios', 'Abrir Convenios de Aliados'),
  ('registro_links.manage', 'registro_links', 'Administrar enlaces de registro'),
  ('cartera.read', 'cartera', 'Consultar Cartera'),
  ('consultas.read', 'consultas', 'Abrir Consultas'),
  ('meta_ads.access', 'meta_ads', 'Acceder a Meta Ads'),
  ('meta_ads.read', 'meta_ads', 'Consultar Meta Ads'),
  ('meta_ads.analyze', 'meta_ads', 'Analizar Meta Ads'),
  ('meta_ads.publish', 'meta_ads', 'Publicar campañas Meta Ads'),
  ('meta_ads.manage', 'meta_ads', 'Administrar Meta Ads'),
  ('meta_ads.campaign.create', 'meta_ads', 'Crear campañas Meta Ads'),
  ('meta_ads.campaign.pause', 'meta_ads', 'Pausar campañas Meta Ads'),
  ('meta_ads.budget.manage', 'meta_ads', 'Administrar presupuesto Meta Ads'),
  ('meta_ads.audit.read', 'meta_ads', 'Consultar auditoría Meta Ads')
on conflict (permission_id) do nothing;

insert into public.aura_role_permissions (role_id, permission_id)
select 'aura.admin', permission_id
from public.aura_permissions
on conflict (role_id, permission_id) do nothing;

insert into public.aura_role_permissions (role_id, permission_id)
values
  ('aura.andrea_limited', 'convenios.use'),
  ('aura.andrea_limited', 'registro_links.manage'),
  ('aura.andrea_limited', 'cartera.read'),
  ('aura.andrea_limited', 'consultas.read')
on conflict (role_id, permission_id) do nothing;

commit;
