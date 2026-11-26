-- Registro fiscal documental. No escribe en cartera, Banco, inventario ni PYG.
create table public.b2b_facturas_emitidas (
 id uuid primary key default gen_random_uuid(),
 cliente_codigo text not null references public.origenes(codigo),
 emisor_nit text not null check (emisor_nit ~ '^[0-9]{6,15}$'),
 receptor_nit text not null check (receptor_nit ~ '^[0-9]{6,15}$'),
 numero text not null check (numero ~ '^[A-Z0-9-]{1,40}$'),
 fecha date not null,
 subtotal numeric(18,2) not null check(subtotal>=0),
 iva numeric(18,2) not null check(iva>=0),
 total numeric(18,2) not null check(total>=0 and total=subtotal+iva),
 retencion_impresa numeric(18,2) not null check(retencion_impresa>=0 and retencion_impresa<=total),
 neto_impreso numeric(18,2) not null check(neto_impreso=total-retencion_impresa),
 cufe text check(cufe ~ '^[a-f0-9]{96}$'),
 detalle text not null,
 cantidad numeric(16,2) check(cantidad>0),
 observacion text not null default '',
 estado_documento text not null default 'emitida' check(estado_documento in ('emitida','anulacion_por_verificar','anulada')),
 motivo_revision text not null default '' check(estado_documento='emitida' or length(btrim(motivo_revision))>0),
 fuente_correo_id text not null check(fuente_correo_id ~ '^[a-f0-9]{16}$'),
 fuente_archivo text not null,
 fuente_sha256 text not null check(fuente_sha256 ~ '^[a-f0-9]{64}$'),
 soportes_adicionales jsonb not null default '[]'::jsonb check(jsonb_typeof(soportes_adicionales)='array'),
 lote text not null,
 registrado_at timestamptz not null default now(),
 unique(emisor_nit,numero), unique(cufe), unique(id,cliente_codigo)
);
create index b2b_facturas_emitidas_cliente_fecha on public.b2b_facturas_emitidas(cliente_codigo,fecha,id);

create table public.b2b_certificados_cliente (
 id uuid primary key default gen_random_uuid(),
 cliente_codigo text not null references public.origenes(codigo),
 tipo text not null check(tipo in ('ICA','IVA','Renta')),
 desde date not null, hasta date not null check(hasta>=desde),
 base_certificada numeric(18,2) not null check(base_certificada>=0),
 valor_certificado numeric(18,2) not null check(valor_certificado>=0),
 fuente_correo_id text not null check(fuente_correo_id ~ '^[a-f0-9]{16}$'),
 fuente_archivo text not null,
 fuente_sha256 text not null check(fuente_sha256 ~ '^[a-f0-9]{64}$'),
 lote text not null, registrado_at timestamptz not null default now(),
 unique(cliente_codigo,tipo,desde,hasta,fuente_sha256), unique(id,cliente_codigo)
);
create table public.b2b_retenciones_cliente (
 id uuid primary key default gen_random_uuid(),
 cliente_codigo text not null references public.origenes(codigo),
 certificado_id uuid not null,
 linea integer not null check(linea>0),
 fecha date not null,
 base numeric(18,2) not null check(base>=0),
 valor numeric(18,2) not null check(valor>=0),
 referencia text not null,
 factura_id uuid,
 estado text not null check(estado in ('coincide','coincide_fecha_base','diferencia','sin_factura','referencia_no_coincide')),
 candidatas text[] not null default '{}',
 nota text not null default '',
 diferencia_base numeric(18,2),
 lote text not null, registrado_at timestamptz not null default now(),
 foreign key(certificado_id,cliente_codigo) references public.b2b_certificados_cliente(id,cliente_codigo),
 foreign key(factura_id,cliente_codigo) references public.b2b_facturas_emitidas(id,cliente_codigo),
 check(estado not in ('coincide','coincide_fecha_base','diferencia') or factura_id is not null),
 unique(certificado_id,linea)
);
create index b2b_retenciones_cliente_factura on public.b2b_retenciones_cliente(factura_id);

-- Consulta solo para perfiles corporativos activos. No se conceden escrituras desde navegador.
alter table public.b2b_facturas_emitidas enable row level security;
alter table public.b2b_certificados_cliente enable row level security;
alter table public.b2b_retenciones_cliente enable row level security;
revoke all on public.b2b_facturas_emitidas,public.b2b_certificados_cliente,public.b2b_retenciones_cliente from public,anon,authenticated;
grant select on public.b2b_facturas_emitidas,public.b2b_certificados_cliente,public.b2b_retenciones_cliente to authenticated;
revoke truncate on public.b2b_facturas_emitidas,public.b2b_certificados_cliente,public.b2b_retenciones_cliente from service_role;
create policy b2b_facturas_emitidas_lectura on public.b2b_facturas_emitidas for select to authenticated using(exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and p.rol in ('gerencia','auditoria')));
create policy b2b_certificados_cliente_lectura on public.b2b_certificados_cliente for select to authenticated using(exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and p.rol in ('gerencia','auditoria')));
create policy b2b_retenciones_cliente_lectura on public.b2b_retenciones_cliente for select to authenticated using(exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.activo and p.rol in ('gerencia','auditoria')));

create function kora_private.validar_periodo_fiscal_b2b() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.b2b_certificados_cliente c where c.id=new.certificado_id and c.cliente_codigo=new.cliente_codigo and new.fecha between c.desde and c.hasta) then
  raise exception 'La fecha de retención debe pertenecer al período del certificado';
 end if;
 return new;
end $$;
revoke all on function kora_private.validar_periodo_fiscal_b2b() from public,anon,authenticated;
create trigger b2b_retenciones_cliente_periodo before insert or update on public.b2b_retenciones_cliente for each row execute function kora_private.validar_periodo_fiscal_b2b();

create function kora_private.auditar_registro_fiscal_b2b() returns trigger language plpgsql set search_path='' as $$
begin
 insert into public.audit_log(usuario,accion,tabla,registro_id,detalle)
 values(coalesce(auth.uid()::text,current_user), 'b2b_fiscal_'||lower(TG_OP),TG_TABLE_NAME,coalesce(new.id,old.id)::text,
  jsonb_build_object('antes',case when TG_OP<>'INSERT' then to_jsonb(old) else null end,'despues',case when TG_OP<>'DELETE' then to_jsonb(new) else null end));
 return coalesce(new,old);
end $$;
revoke all on function kora_private.auditar_registro_fiscal_b2b() from public,anon,authenticated;
create trigger b2b_facturas_emitidas_auditoria after insert or update or delete on public.b2b_facturas_emitidas for each row execute function kora_private.auditar_registro_fiscal_b2b();
create trigger b2b_certificados_cliente_auditoria after insert or update or delete on public.b2b_certificados_cliente for each row execute function kora_private.auditar_registro_fiscal_b2b();
create trigger b2b_retenciones_cliente_auditoria after insert or update or delete on public.b2b_retenciones_cliente for each row execute function kora_private.auditar_registro_fiscal_b2b();
comment on table public.b2b_facturas_emitidas is 'Facturación fiscal documental. La carga histórica no genera cargos, abonos, ingresos, gastos ni movimientos de inventario.';
comment on column public.b2b_facturas_emitidas.neto_impreso is 'Neto que figura en el PDF: no acredita pago ni saldo pendiente.';
comment on table public.b2b_retenciones_cliente is 'Impuestos retenidos por el cliente a Creditek según certificado. No son retenciones a proveedores ni se aplican otra vez a cartera.';
