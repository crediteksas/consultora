-- Fictional 197-table dependency model, not a production clone.
set check_function_bodies=false;
grant authenticated,anon,service_role to authenticator with inherit false,set true;
 create schema if not exists kora_private authorization postgres;create schema if not exists storage authorization postgres;create schema if not exists realtime authorization postgres;
 grant usage on schema public,auth,storage,realtime to authenticated;
 grant usage on schema auth to anon,service_role;

 set role postgres;create table public.perfiles(id uuid primary key,nombre text,rol text not null,activo boolean not null,tienda_codigo text,private_note text,
 constraint perfiles_rol_check check(rol in('gerencia','auditoria','admin_tienda','asesor')));
 create table public.credit_portfolio_operators(perfil_id uuid,capability text,active boolean);
 create table public.confirmaciones_deuda_tienda(usuario_id uuid,tienda_codigo text,fecha date);
 create table kora_private.confirmacion_deuda_config(id boolean,inicio date);
 insert into kora_private.confirmacion_deuda_config values(true,'2099-01-01');
 insert into perfiles values('11111111-1111-4111-8111-111111111111','Operadora ficticia','admin_tienda',true,'fiction-A','never project'),('22222222-2222-4222-8222-222222222222','Gerente ficticio','gerencia',true,null,'never project');
 insert into credit_portfolio_operators values('11111111-1111-4111-8111-111111111111','manage',true);
 grant select on credit_portfolio_operators to service_role;
create table "realtime"."messages"(id int,secret text) partition by range(id);alter table "realtime"."messages" enable row level security;
create table "realtime"."schema_migrations"(id int,secret text);alter table "realtime"."schema_migrations" enable row level security;
create table "realtime"."subscription"(id int,secret text);alter table "realtime"."subscription" enable row level security;
create table "storage"."bucket_lifecycle_states"(id int,secret text);alter table "storage"."bucket_lifecycle_states" enable row level security;
create table "storage"."buckets"(id int,secret text);alter table "storage"."buckets" enable row level security;
create table "storage"."buckets_analytics"(id int,secret text);alter table "storage"."buckets_analytics" enable row level security;
create table "storage"."buckets_vectors"(id int,secret text);alter table "storage"."buckets_vectors" enable row level security;
create table "storage"."lifecycle_abandoned_artifacts"(id int,secret text);alter table "storage"."lifecycle_abandoned_artifacts" enable row level security;
create table "storage"."migrations"(id int,secret text);alter table "storage"."migrations" enable row level security;
create table "storage"."objects"(id int,secret text);alter table "storage"."objects" enable row level security;
create table "storage"."s3_multipart_uploads"(id int,secret text);alter table "storage"."s3_multipart_uploads" enable row level security;
create table "storage"."s3_multipart_uploads_parts"(id int,secret text);alter table "storage"."s3_multipart_uploads_parts" enable row level security;
create table "storage"."vector_indexes"(id int,secret text);alter table "storage"."vector_indexes" enable row level security;
create table public."abonos"(id integer,secret text);insert into public."abonos" values(1,'fictional unrelated row');
create table public."abonos_clientes_b2b_destino"(id integer,secret text);insert into public."abonos_clientes_b2b_destino" values(1,'fictional unrelated row');
create table public."addi_liquidaciones"(id integer,secret text);insert into public."addi_liquidaciones" values(1,'fictional unrelated row');
create table public."ajustes_auditoria_cartera_b2b"(id integer,secret text);insert into public."ajustes_auditoria_cartera_b2b" values(1,'fictional unrelated row');
create table public."ajustes_gerencia_solicitudes"(id integer,secret text);insert into public."ajustes_gerencia_solicitudes" values(1,'fictional unrelated row');
create table public."ajustes_inventario"(id integer,secret text);insert into public."ajustes_inventario" values(1,'fictional unrelated row');
create table public."aliados"(id integer,secret text);insert into public."aliados" values(1,'fictional unrelated row');
create table public."aliados_cierres_utilidad"(id integer,secret text);insert into public."aliados_cierres_utilidad" values(1,'fictional unrelated row');
create table public."aliados_cruces_recuperacion"(id integer,secret text);insert into public."aliados_cruces_recuperacion" values(1,'fictional unrelated row');
create table public."aliados_documentos"(id integer,secret text);insert into public."aliados_documentos" values(1,'fictional unrelated row');
create table public."aliados_domain_events"(id integer,secret text);insert into public."aliados_domain_events" values(1,'fictional unrelated row');
create table public."aliados_estado_historial"(id integer,secret text);insert into public."aliados_estado_historial" values(1,'fictional unrelated row');
create table public."aliados_gastos_operativos"(id integer,secret text);insert into public."aliados_gastos_operativos" values(1,'fictional unrelated row');
create table public."aliados_metas_plataforma"(id integer,secret text);insert into public."aliados_metas_plataforma" values(1,'fictional unrelated row');
create table public."aliados_operadores"(id integer,secret text);insert into public."aliados_operadores" values(1,'fictional unrelated row');
create table public."aliados_plataformas"(id integer,secret text);insert into public."aliados_plataformas" values(1,'fictional unrelated row');
create table public."aliados_recuperaciones"(id integer,secret text);insert into public."aliados_recuperaciones" values(1,'fictional unrelated row');
create table public."aliados_reversiones"(id integer,secret text);insert into public."aliados_reversiones" values(1,'fictional unrelated row');
create table public."aliados_sedes"(id integer,secret text);insert into public."aliados_sedes" values(1,'fictional unrelated row');
create table public."aplicaciones_abono_cliente_b2b_proveedor"(id integer,secret text);insert into public."aplicaciones_abono_cliente_b2b_proveedor" values(1,'fictional unrelated row');
create table public."aplicaciones_consignacion_proveedor"(id integer,secret text);insert into public."aplicaciones_consignacion_proveedor" values(1,'fictional unrelated row');
create table public."audit_log"(id integer,secret text);insert into public."audit_log" values(1,'fictional unrelated row');
create table public."b2b_aura_memoria"(id integer,secret text);insert into public."b2b_aura_memoria" values(1,'fictional unrelated row');
create table public."b2b_catalogo_borradores"(id integer,secret text);insert into public."b2b_catalogo_borradores" values(1,'fictional unrelated row');
create table public."b2b_catalogo_reglas"(id integer,secret text);insert into public."b2b_catalogo_reglas" values(1,'fictional unrelated row');
create table public."b2b_certificados_cliente"(id integer,secret text);insert into public."b2b_certificados_cliente" values(1,'fictional unrelated row');
create table public."b2b_cierre_pedidos"(id integer,secret text);insert into public."b2b_cierre_pedidos" values(1,'fictional unrelated row');
create table public."b2b_cierres"(id integer,secret text);insert into public."b2b_cierres" values(1,'fictional unrelated row');
create table public."b2b_facturas_emitidas"(id integer,secret text);insert into public."b2b_facturas_emitidas" values(1,'fictional unrelated row');
create table public."b2b_listas_precios"(id integer,secret text);insert into public."b2b_listas_precios" values(1,'fictional unrelated row');
create table public."b2b_ofertas"(id integer,secret text);insert into public."b2b_ofertas" values(1,'fictional unrelated row');
create table public."b2b_pedido_avisos"(id integer,secret text);insert into public."b2b_pedido_avisos" values(1,'fictional unrelated row');
create table public."b2b_pedido_fuente"(id integer,secret text);insert into public."b2b_pedido_fuente" values(1,'fictional unrelated row');
create table public."b2b_presupuestos"(id integer,secret text);insert into public."b2b_presupuestos" values(1,'fictional unrelated row');
create table public."b2b_referencias_catalogo"(id integer,secret text);insert into public."b2b_referencias_catalogo" values(1,'fictional unrelated row');
create table public."b2b_retenciones_cliente"(id integer,secret text);insert into public."b2b_retenciones_cliente" values(1,'fictional unrelated row');
create table public."banco_creditek_aplicaciones_proveedor"(id integer,secret text);insert into public."banco_creditek_aplicaciones_proveedor" values(1,'fictional unrelated row');
create table public."banco_creditek_cuentas"(id integer,secret text);insert into public."banco_creditek_cuentas" values(1,'fictional unrelated row');
create table public."banco_creditek_movimientos"(id integer,secret text);insert into public."banco_creditek_movimientos" values(1,'fictional unrelated row');
create table public."banco_creditek_pagos_proveedor"(id integer,secret text);insert into public."banco_creditek_pagos_proveedor" values(1,'fictional unrelated row');
create table public."beneficiary_bank_accounts"(id integer,secret text);insert into public."beneficiary_bank_accounts" values(1,'fictional unrelated row');
create table public."caja_arqueo_intentos"(id integer,secret text);insert into public."caja_arqueo_intentos" values(1,'fictional unrelated row');
create table public."caja_ciclo_config"(id integer,secret text);insert into public."caja_ciclo_config" values(1,'fictional unrelated row');
create table public."caja_cortes"(id integer,secret text);insert into public."caja_cortes" values(1,'fictional unrelated row');
create table public."caja_diaria"(id integer,secret text);insert into public."caja_diaria" values(1,'fictional unrelated row');
create table public."captadores"(id integer,secret text);insert into public."captadores" values(1,'fictional unrelated row');
create table public."cartera_retail_retiros_auditoria"(id integer,secret text);insert into public."cartera_retail_retiros_auditoria" values(1,'fictional unrelated row');
create table public."categorias_producto"(id integer,secret text);insert into public."categorias_producto" values(1,'fictional unrelated row');
create table public."clientes"(id integer,secret text);insert into public."clientes" values(1,'fictional unrelated row');
create table public."cobra_krediya_cut_operations"(id integer,secret text);insert into public."cobra_krediya_cut_operations" values(1,'fictional unrelated row');
create table public."cobra_krediya_cuts"(id integer,secret text);insert into public."cobra_krediya_cuts" values(1,'fictional unrelated row');
create table public."cobros_allocations"(id integer,secret text);insert into public."cobros_allocations" values(1,'fictional unrelated row');
create table public."cobros_deposits"(id integer,secret text);insert into public."cobros_deposits" values(1,'fictional unrelated row');
create table public."cobros_events"(id integer,secret text);insert into public."cobros_events" values(1,'fictional unrelated row');
create table public."cobros_expected"(id integer,secret text);insert into public."cobros_expected" values(1,'fictional unrelated row');
create table public."comisiones"(id integer,secret text);insert into public."comisiones" values(1,'fictional unrelated row');
create table public."comprobantes_consignacion"(id integer,secret text);insert into public."comprobantes_consignacion" values(1,'fictional unrelated row');
create table public."conceptos_gasto"(id integer,secret text);insert into public."conceptos_gasto" values(1,'fictional unrelated row');
create table public."conteos_bloque"(id integer,secret text);insert into public."conteos_bloque" values(1,'fictional unrelated row');
create table public."conteos_bloque_items"(id integer,secret text);insert into public."conteos_bloque_items" values(1,'fictional unrelated row');
create table public."costo_promedio_tienda_historial"(id integer,secret text);insert into public."costo_promedio_tienda_historial" values(1,'fictional unrelated row');
create table public."credit_collection_events"(id integer,secret text);insert into public."credit_collection_events" values(1,'fictional unrelated row');
create table public."credit_customer_links"(id integer,secret text);insert into public."credit_customer_links" values(1,'fictional unrelated row');
create table public."credit_portfolio_obligations"(id integer,secret text);insert into public."credit_portfolio_obligations" values(1,'fictional unrelated row');
create table public."credit_portfolio_settings"(id integer,secret text);insert into public."credit_portfolio_settings" values(1,'fictional unrelated row');
create table public."credit_repayments"(id integer,secret text);insert into public."credit_repayments" values(1,'fictional unrelated row');
create table public."creditos"(id integer,secret text);insert into public."creditos" values(1,'fictional unrelated row');
create table public."creditos_historicos"(id integer,secret text);insert into public."creditos_historicos" values(1,'fictional unrelated row');
create table public."creditos_historicos_plataforma"(id integer,secret text);insert into public."creditos_historicos_plataforma" values(1,'fictional unrelated row');
create table public."creditos_plataforma_consulta_log"(id integer,secret text);insert into public."creditos_plataforma_consulta_log" values(1,'fictional unrelated row');
create table public."cuenta_corriente"(id integer,secret text);insert into public."cuenta_corriente" values(1,'fictional unrelated row');
create table public."cuentas_cartera"(id integer,secret text);insert into public."cuentas_cartera" values(1,'fictional unrelated row');
create table public."documentos_solicitud"(id integer,secret text);insert into public."documentos_solicitud" values(1,'fictional unrelated row');
create table public."ejecutivos"(id integer,secret text);insert into public."ejecutivos" values(1,'fictional unrelated row');
create table public."enlaces_registro"(id integer,secret text);insert into public."enlaces_registro" values(1,'fictional unrelated row');
create table public."equivalencias_tienda"(id integer,secret text);insert into public."equivalencias_tienda" values(1,'fictional unrelated row');
create table public."erp_migration_cuts"(id integer,secret text);insert into public."erp_migration_cuts" values(1,'fictional unrelated row');
create table public."facturas_proveedor"(id integer,secret text);insert into public."facturas_proveedor" values(1,'fictional unrelated row');
create table public."festivos_colombia"(id integer,secret text);insert into public."festivos_colombia" values(1,'fictional unrelated row');
create table public."financial_entries"(id integer,secret text);insert into public."financial_entries" values(1,'fictional unrelated row');
create table public."financial_recurring_templates"(id integer,secret text);insert into public."financial_recurring_templates" values(1,'fictional unrelated row');
create table public."gastos"(id integer,secret text);insert into public."gastos" values(1,'fictional unrelated row');
create table public."gastos_historial"(id integer,secret text);insert into public."gastos_historial" values(1,'fictional unrelated row');
create table public."historico_importado"(id integer,secret text);insert into public."historico_importado" values(1,'fictional unrelated row');
create table public."historico_mensual"(id integer,secret text);insert into public."historico_mensual" values(1,'fictional unrelated row');
create table public."importacion_detalle"(id integer,secret text);insert into public."importacion_detalle" values(1,'fictional unrelated row');
create table public."importaciones_financiera"(id integer,secret text);insert into public."importaciones_financiera" values(1,'fictional unrelated row');
create table public."instrucciones_consignacion"(id integer,secret text);insert into public."instrucciones_consignacion" values(1,'fictional unrelated row');
create table public."kora_incident_comments"(id integer,secret text);insert into public."kora_incident_comments" values(1,'fictional unrelated row');
create table public."kora_incident_history"(id integer,secret text);insert into public."kora_incident_history" values(1,'fictional unrelated row');
create table public."kora_incident_notifications"(id integer,secret text);insert into public."kora_incident_notifications" values(1,'fictional unrelated row');
create table public."kora_incident_operations"(id integer,secret text);insert into public."kora_incident_operations" values(1,'fictional unrelated row');
create table public."kora_incident_permissions"(id integer,secret text);insert into public."kora_incident_permissions" values(1,'fictional unrelated row');
create table public."kora_incident_sequences"(id integer,secret text);insert into public."kora_incident_sequences" values(1,'fictional unrelated row');
create table public."kora_incidents"(id integer,secret text);insert into public."kora_incidents" values(1,'fictional unrelated row');
create table public."kora_notifications"(id integer,secret text);insert into public."kora_notifications" values(1,'fictional unrelated row');
create table public."kora_nova_outbox"(id integer,secret text);insert into public."kora_nova_outbox" values(1,'fictional unrelated row');
create table public."kora_nova_platform_renewals"(id integer,secret text);insert into public."kora_nova_platform_renewals" values(1,'fictional unrelated row');
create table public."kora_nova_renewal_delivery"(id integer,secret text);insert into public."kora_nova_renewal_delivery" values(1,'fictional unrelated row');
create table public."kora_nova_reviewers"(id integer,secret text);insert into public."kora_nova_reviewers" values(1,'fictional unrelated row');
create table public."kora_nova_sources"(id integer,secret text);insert into public."kora_nova_sources" values(1,'fictional unrelated row');
create table public."krediya_bonus_rules"(id integer,secret text);insert into public."krediya_bonus_rules" values(1,'fictional unrelated row');
create table public."krediya_diferencias"(id integer,secret text);insert into public."krediya_diferencias" values(1,'fictional unrelated row');
create table public."krediya_diferencias_gestiones"(id integer,secret text);insert into public."krediya_diferencias_gestiones" values(1,'fictional unrelated row');
create table public."krediya_gestiones"(id integer,secret text);insert into public."krediya_gestiones" values(1,'fictional unrelated row');
create table public."krediya_import_reports"(id integer,secret text);insert into public."krediya_import_reports" values(1,'fictional unrelated row');
create table public."krediya_instrucciones"(id integer,secret text);insert into public."krediya_instrucciones" values(1,'fictional unrelated row');
create table public."krediya_price_rules"(id integer,secret text);insert into public."krediya_price_rules" values(1,'fictional unrelated row');
create table public."liquidation_adjustments"(id integer,secret text);insert into public."liquidation_adjustments" values(1,'fictional unrelated row');
create table public."liquidation_approvals"(id integer,secret text);insert into public."liquidation_approvals" values(1,'fictional unrelated row');
create table public."liquidation_beneficiaries"(id integer,secret text);insert into public."liquidation_beneficiaries" values(1,'fictional unrelated row');
create table public."liquidation_bonuses"(id integer,secret text);insert into public."liquidation_bonuses" values(1,'fictional unrelated row');
create table public."liquidation_calculations"(id integer,secret text);insert into public."liquidation_calculations" values(1,'fictional unrelated row');
create table public."liquidation_domain_events"(id integer,secret text);insert into public."liquidation_domain_events" values(1,'fictional unrelated row');
create table public."liquidation_imported_files"(id integer,secret text);insert into public."liquidation_imported_files" values(1,'fictional unrelated row');
create table public."liquidation_incidents"(id integer,secret text);insert into public."liquidation_incidents" values(1,'fictional unrelated row');
create table public."liquidation_operations"(id integer,secret text);insert into public."liquidation_operations" values(1,'fictional unrelated row');
create table public."liquidation_platforms"(id integer,secret text);insert into public."liquidation_platforms" values(1,'fictional unrelated row');
create table public."liquidation_source_rows"(id integer,secret text);insert into public."liquidation_source_rows" values(1,'fictional unrelated row');
create table public."liquidation_treasury_destinations"(id integer,secret text);insert into public."liquidation_treasury_destinations" values(1,'fictional unrelated row');
create table public."liquidations"(id integer,secret text);insert into public."liquidations" values(1,'fictional unrelated row');
create table public."movimientos"(id integer,secret text);insert into public."movimientos" values(1,'fictional unrelated row');
create table public."movimientos_caja_tienda"(id integer,secret text);insert into public."movimientos_caja_tienda" values(1,'fictional unrelated row');
create table public."movimientos_cartera"(id integer,secret text);insert into public."movimientos_cartera" values(1,'fictional unrelated row');
create table public."movimientos_tesoreria_central"(id integer,secret text);insert into public."movimientos_tesoreria_central" values(1,'fictional unrelated row');
create table public."nova_allied_login_challenges"(id integer,secret text);insert into public."nova_allied_login_challenges" values(1,'fictional unrelated row');
create table public."nova_allied_login_members"(id integer,secret text);insert into public."nova_allied_login_members" values(1,'fictional unrelated row');
create table public."nova_allied_login_sessions"(id integer,secret text);insert into public."nova_allied_login_sessions" values(1,'fictional unrelated row');
create table public."nova_authorizations"(id integer,secret text);insert into public."nova_authorizations" values(1,'fictional unrelated row');
create table public."nova_client_otp_dispatch"(id integer,secret text);insert into public."nova_client_otp_dispatch" values(1,'fictional unrelated row');
create table public."nova_client_otp_policy"(id integer,secret text);insert into public."nova_client_otp_policy" values(1,'fictional unrelated row');
create table public."nova_otp_delivery_receipts"(id integer,secret text);insert into public."nova_otp_delivery_receipts" values(1,'fictional unrelated row');
create table public."nova_photo_quality_consents"(id integer,secret text);insert into public."nova_photo_quality_consents" values(1,'fictional unrelated row');
create table public."nova_retail_actor_emails"(id integer,secret text);insert into public."nova_retail_actor_emails" values(1,'fictional unrelated row');
create table public."nova_retail_case_events"(id integer,secret text);insert into public."nova_retail_case_events" values(1,'fictional unrelated row');
create table public."nova_retail_cases"(id integer,secret text);insert into public."nova_retail_cases" values(1,'fictional unrelated row');
create table public."nova_retail_notifications"(id integer,secret text);insert into public."nova_retail_notifications" values(1,'fictional unrelated row');
create table public."nova_retail_photo_events"(id integer,secret text);insert into public."nova_retail_photo_events" values(1,'fictional unrelated row');
create table public."nova_retail_photo_reviews"(id integer,secret text);insert into public."nova_retail_photo_reviews" values(1,'fictional unrelated row');
create table public."nova_retail_reference_deliveries"(id integer,secret text);insert into public."nova_retail_reference_deliveries" values(1,'fictional unrelated row');
create table public."nova_retail_reference_replacements"(id integer,secret text);insert into public."nova_retail_reference_replacements" values(1,'fictional unrelated row');
create table public."nova_retail_reviewers"(id integer,secret text);insert into public."nova_retail_reviewers" values(1,'fictional unrelated row');
create table public."nova_retail_store_contacts"(id integer,secret text);insert into public."nova_retail_store_contacts" values(1,'fictional unrelated row');
create table public."orden_compra_cambios"(id integer,secret text);insert into public."orden_compra_cambios" values(1,'fictional unrelated row');
create table public."orden_compra_items"(id integer,secret text);insert into public."orden_compra_items" values(1,'fictional unrelated row');
create table public."ordenes_compra"(id integer,secret text);insert into public."ordenes_compra" values(1,'fictional unrelated row');
create table public."origenes"(id integer,secret text);insert into public."origenes" values(1,'fictional unrelated row');
create table public."otp_codigos"(id integer,secret text);insert into public."otp_codigos" values(1,'fictional unrelated row');
create table public."pagos_proveedor"(id integer,secret text);insert into public."pagos_proveedor" values(1,'fictional unrelated row');
create table public."payment_destination_corrections"(id integer,secret text);insert into public."payment_destination_corrections" values(1,'fictional unrelated row');
create table public."payment_dispatch_items"(id integer,secret text);insert into public."payment_dispatch_items" values(1,'fictional unrelated row');
create table public."payment_dispatches"(id integer,secret text);insert into public."payment_dispatches" values(1,'fictional unrelated row');
create table public."payment_items"(id integer,secret text);insert into public."payment_items" values(1,'fictional unrelated row');
create table public."payment_orders"(id integer,secret text);insert into public."payment_orders" values(1,'fictional unrelated row');
create table public."pedido_b2b_items"(id integer,secret text);insert into public."pedido_b2b_items" values(1,'fictional unrelated row');
create table public."pedidos_b2b"(id integer,secret text);insert into public."pedidos_b2b" values(1,'fictional unrelated row');
create table public."periodos"(id integer,secret text);insert into public."periodos" values(1,'fictional unrelated row');
create table public."presupuesto_premio_mensual"(id integer,secret text);insert into public."presupuesto_premio_mensual" values(1,'fictional unrelated row');
create table public."presupuesto_premios"(id integer,secret text);insert into public."presupuesto_premios" values(1,'fictional unrelated row');
create table public."presupuesto_whatsapp_destinos"(id integer,secret text);insert into public."presupuesto_whatsapp_destinos" values(1,'fictional unrelated row');
create table public."presupuesto_whatsapp_envios"(id integer,secret text);insert into public."presupuesto_whatsapp_envios" values(1,'fictional unrelated row');
create table public."presupuestos"(id integer,secret text);insert into public."presupuestos" values(1,'fictional unrelated row');
create table public."producto_foto_historial"(id integer,secret text);insert into public."producto_foto_historial" values(1,'fictional unrelated row');
create table public."productos"(id integer,secret text);insert into public."productos" values(1,'fictional unrelated row');
create table public."proveedores"(id integer,secret text);insert into public."proveedores" values(1,'fictional unrelated row');
create table public."proveedores_ajustes_detalle"(id integer,secret text);insert into public."proveedores_ajustes_detalle" values(1,'fictional unrelated row');
create table public."proveedores_ajustes_solicitudes"(id integer,secret text);insert into public."proveedores_ajustes_solicitudes" values(1,'fictional unrelated row');
create table public."proveedores_retencion_automatica"(id integer,secret text);insert into public."proveedores_retencion_automatica" values(1,'fictional unrelated row');
create table public."referencias"(id integer,secret text);insert into public."referencias" values(1,'fictional unrelated row');
create table public."remision_items"(id integer,secret text);insert into public."remision_items" values(1,'fictional unrelated row');
create table public."remision_margenes"(id integer,secret text);insert into public."remision_margenes" values(1,'fictional unrelated row');
create table public."remisiones"(id integer,secret text);insert into public."remisiones" values(1,'fictional unrelated row');
create table public."reportes_deuda_enviados"(id integer,secret text);insert into public."reportes_deuda_enviados" values(1,'fictional unrelated row');
create table public."reportes_diarios_enviados"(id integer,secret text);insert into public."reportes_diarios_enviados" values(1,'fictional unrelated row');
create table public."retail_b2b_compensations"(id integer,secret text);insert into public."retail_b2b_compensations" values(1,'fictional unrelated row');
create table public."retenciones_factura_proveedor"(id integer,secret text);insert into public."retenciones_factura_proveedor" values(1,'fictional unrelated row');
create table public."saldo_ajustes_auditoria"(id integer,secret text);insert into public."saldo_ajustes_auditoria" values(1,'fictional unrelated row');
create table public."saldos_iniciales_cartera"(id integer,secret text);insert into public."saldos_iniciales_cartera" values(1,'fictional unrelated row');
create table public."sesiones_conteo_cruzado"(id integer,secret text);insert into public."sesiones_conteo_cruzado" values(1,'fictional unrelated row');
create table public."settlement_policy_versions"(id integer,secret text);insert into public."settlement_policy_versions" values(1,'fictional unrelated row');
create table public."solicitudes"(id integer,secret text);insert into public."solicitudes" values(1,'fictional unrelated row');
create table public."stock_cantidad"(id integer,secret text);insert into public."stock_cantidad" values(1,'fictional unrelated row');
create table public."stock_cantidad_lotes"(id integer,secret text);insert into public."stock_cantidad_lotes" values(1,'fictional unrelated row');
create table public."traslado_items"(id integer,secret text);insert into public."traslado_items" values(1,'fictional unrelated row');
create table public."traslados"(id integer,secret text);insert into public."traslados" values(1,'fictional unrelated row');
create table public."treasury_movements"(id integer,secret text);insert into public."treasury_movements" values(1,'fictional unrelated row');
create table public."treasury_unit_balances"(id integer,secret text);insert into public."treasury_unit_balances" values(1,'fictional unrelated row');
create table public."unidades"(id integer,secret text);insert into public."unidades" values(1,'fictional unrelated row');
create table public."utilidades_cierres_negocio"(id integer,secret text);insert into public."utilidades_cierres_negocio" values(1,'fictional unrelated row');
create table public."venta_ajustes_administrativos"(id integer,secret text);insert into public."venta_ajustes_administrativos" values(1,'fictional unrelated row');
create table public."venta_devoluciones"(id integer,secret text);insert into public."venta_devoluciones" values(1,'fictional unrelated row');
create table public."venta_items"(id integer,secret text);insert into public."venta_items" values(1,'fictional unrelated row');
create table public."ventas"(id integer,secret text);insert into public."ventas" values(1,'fictional unrelated row');
create table public."ventas_autorizaciones"(id integer,secret text);insert into public."ventas_autorizaciones" values(1,'fictional unrelated row');
alter table "public"."perfiles" enable row level security;grant select,insert,update,delete on "public"."perfiles" to authenticated;create policy existing_authenticated_access on "public"."perfiles" for all to authenticated using(true) with check(true);
alter table "public"."confirmaciones_deuda_tienda" enable row level security;grant select,insert,update,delete on "public"."confirmaciones_deuda_tienda" to authenticated;create policy existing_authenticated_access on "public"."confirmaciones_deuda_tienda" for all to authenticated using(true) with check(true);
alter table "public"."credit_portfolio_operators" enable row level security;grant select,insert,update,delete on "public"."credit_portfolio_operators" to authenticated;create policy existing_authenticated_access on "public"."credit_portfolio_operators" for all to authenticated using(true) with check(true);
alter table "realtime"."messages" enable row level security;grant select,insert,update,delete on "realtime"."messages" to authenticated;create policy existing_authenticated_access on "realtime"."messages" for all to authenticated using(true) with check(true);
alter table "storage"."buckets" enable row level security;grant select,insert,update,delete on "storage"."buckets" to authenticated;create policy existing_authenticated_access on "storage"."buckets" for all to authenticated using(true) with check(true);
alter table "storage"."objects" enable row level security;grant select,insert,update,delete on "storage"."objects" to authenticated;create policy existing_authenticated_access on "storage"."objects" for all to authenticated using(true) with check(true);
alter table "public"."abonos" enable row level security;grant select,insert,update,delete on "public"."abonos" to authenticated;create policy existing_authenticated_access on "public"."abonos" for all to authenticated using(true) with check(true);
alter table "public"."abonos_clientes_b2b_destino" enable row level security;grant select,insert,update,delete on "public"."abonos_clientes_b2b_destino" to authenticated;create policy existing_authenticated_access on "public"."abonos_clientes_b2b_destino" for all to authenticated using(true) with check(true);
alter table "public"."addi_liquidaciones" enable row level security;grant select,insert,update,delete on "public"."addi_liquidaciones" to authenticated;create policy existing_authenticated_access on "public"."addi_liquidaciones" for all to authenticated using(true) with check(true);
alter table "public"."ajustes_auditoria_cartera_b2b" enable row level security;grant select,insert,update,delete on "public"."ajustes_auditoria_cartera_b2b" to authenticated;create policy existing_authenticated_access on "public"."ajustes_auditoria_cartera_b2b" for all to authenticated using(true) with check(true);
alter table "public"."ajustes_gerencia_solicitudes" enable row level security;grant select,insert,update,delete on "public"."ajustes_gerencia_solicitudes" to authenticated;create policy existing_authenticated_access on "public"."ajustes_gerencia_solicitudes" for all to authenticated using(true) with check(true);
alter table "public"."ajustes_inventario" enable row level security;grant select,insert,update,delete on "public"."ajustes_inventario" to authenticated;create policy existing_authenticated_access on "public"."ajustes_inventario" for all to authenticated using(true) with check(true);
alter table "public"."aliados" enable row level security;grant select,insert,update,delete on "public"."aliados" to authenticated;create policy existing_authenticated_access on "public"."aliados" for all to authenticated using(true) with check(true);
alter table "public"."aliados_cierres_utilidad" enable row level security;grant select,insert,update,delete on "public"."aliados_cierres_utilidad" to authenticated;create policy existing_authenticated_access on "public"."aliados_cierres_utilidad" for all to authenticated using(true) with check(true);
alter table "public"."aliados_cruces_recuperacion" enable row level security;grant select,insert,update,delete on "public"."aliados_cruces_recuperacion" to authenticated;create policy existing_authenticated_access on "public"."aliados_cruces_recuperacion" for all to authenticated using(true) with check(true);
alter table "public"."aliados_documentos" enable row level security;grant select,insert,update,delete on "public"."aliados_documentos" to authenticated;create policy existing_authenticated_access on "public"."aliados_documentos" for all to authenticated using(true) with check(true);
alter table "public"."aliados_domain_events" enable row level security;grant select,insert,update,delete on "public"."aliados_domain_events" to authenticated;create policy existing_authenticated_access on "public"."aliados_domain_events" for all to authenticated using(true) with check(true);
alter table "public"."aliados_estado_historial" enable row level security;grant select,insert,update,delete on "public"."aliados_estado_historial" to authenticated;create policy existing_authenticated_access on "public"."aliados_estado_historial" for all to authenticated using(true) with check(true);
alter table "public"."aliados_gastos_operativos" enable row level security;grant select,insert,update,delete on "public"."aliados_gastos_operativos" to authenticated;create policy existing_authenticated_access on "public"."aliados_gastos_operativos" for all to authenticated using(true) with check(true);
alter table "public"."aliados_metas_plataforma" enable row level security;grant select,insert,update,delete on "public"."aliados_metas_plataforma" to authenticated;create policy existing_authenticated_access on "public"."aliados_metas_plataforma" for all to authenticated using(true) with check(true);
alter table "public"."aliados_operadores" enable row level security;grant select,insert,update,delete on "public"."aliados_operadores" to authenticated;create policy existing_authenticated_access on "public"."aliados_operadores" for all to authenticated using(true) with check(true);
alter table "public"."aliados_plataformas" enable row level security;grant select,insert,update,delete on "public"."aliados_plataformas" to authenticated;create policy existing_authenticated_access on "public"."aliados_plataformas" for all to authenticated using(true) with check(true);
alter table "public"."aliados_recuperaciones" enable row level security;grant select,insert,update,delete on "public"."aliados_recuperaciones" to authenticated;create policy existing_authenticated_access on "public"."aliados_recuperaciones" for all to authenticated using(true) with check(true);
alter table "public"."aliados_reversiones" enable row level security;grant select,insert,update,delete on "public"."aliados_reversiones" to authenticated;create policy existing_authenticated_access on "public"."aliados_reversiones" for all to authenticated using(true) with check(true);
alter table "public"."aliados_sedes" enable row level security;grant select,insert,update,delete on "public"."aliados_sedes" to authenticated;create policy existing_authenticated_access on "public"."aliados_sedes" for all to authenticated using(true) with check(true);
alter table "public"."aplicaciones_abono_cliente_b2b_proveedor" enable row level security;grant select,insert,update,delete on "public"."aplicaciones_abono_cliente_b2b_proveedor" to authenticated;create policy existing_authenticated_access on "public"."aplicaciones_abono_cliente_b2b_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."aplicaciones_consignacion_proveedor" enable row level security;grant select,insert,update,delete on "public"."aplicaciones_consignacion_proveedor" to authenticated;create policy existing_authenticated_access on "public"."aplicaciones_consignacion_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."audit_log" enable row level security;grant select,insert,update,delete on "public"."audit_log" to authenticated;create policy existing_authenticated_access on "public"."audit_log" for all to authenticated using(true) with check(true);
alter table "public"."b2b_aura_memoria" enable row level security;grant select,insert,update,delete on "public"."b2b_aura_memoria" to authenticated;create policy existing_authenticated_access on "public"."b2b_aura_memoria" for all to authenticated using(true) with check(true);
alter table "public"."b2b_catalogo_borradores" enable row level security;grant select,insert,update,delete on "public"."b2b_catalogo_borradores" to authenticated;create policy existing_authenticated_access on "public"."b2b_catalogo_borradores" for all to authenticated using(true) with check(true);
alter table "public"."b2b_catalogo_reglas" enable row level security;grant select,insert,update,delete on "public"."b2b_catalogo_reglas" to authenticated;create policy existing_authenticated_access on "public"."b2b_catalogo_reglas" for all to authenticated using(true) with check(true);
alter table "public"."b2b_certificados_cliente" enable row level security;grant select,insert,update,delete on "public"."b2b_certificados_cliente" to authenticated;create policy existing_authenticated_access on "public"."b2b_certificados_cliente" for all to authenticated using(true) with check(true);
alter table "public"."b2b_cierre_pedidos" enable row level security;grant select,insert,update,delete on "public"."b2b_cierre_pedidos" to authenticated;create policy existing_authenticated_access on "public"."b2b_cierre_pedidos" for all to authenticated using(true) with check(true);
alter table "public"."b2b_cierres" enable row level security;grant select,insert,update,delete on "public"."b2b_cierres" to authenticated;create policy existing_authenticated_access on "public"."b2b_cierres" for all to authenticated using(true) with check(true);
alter table "public"."b2b_facturas_emitidas" enable row level security;grant select,insert,update,delete on "public"."b2b_facturas_emitidas" to authenticated;create policy existing_authenticated_access on "public"."b2b_facturas_emitidas" for all to authenticated using(true) with check(true);
alter table "public"."b2b_listas_precios" enable row level security;grant select,insert,update,delete on "public"."b2b_listas_precios" to authenticated;create policy existing_authenticated_access on "public"."b2b_listas_precios" for all to authenticated using(true) with check(true);
alter table "public"."b2b_ofertas" enable row level security;grant select,insert,update,delete on "public"."b2b_ofertas" to authenticated;create policy existing_authenticated_access on "public"."b2b_ofertas" for all to authenticated using(true) with check(true);
alter table "public"."b2b_pedido_avisos" enable row level security;grant select,insert,update,delete on "public"."b2b_pedido_avisos" to authenticated;create policy existing_authenticated_access on "public"."b2b_pedido_avisos" for all to authenticated using(true) with check(true);
alter table "public"."b2b_pedido_fuente" enable row level security;grant select,insert,update,delete on "public"."b2b_pedido_fuente" to authenticated;create policy existing_authenticated_access on "public"."b2b_pedido_fuente" for all to authenticated using(true) with check(true);
alter table "public"."b2b_presupuestos" enable row level security;grant select,insert,update,delete on "public"."b2b_presupuestos" to authenticated;create policy existing_authenticated_access on "public"."b2b_presupuestos" for all to authenticated using(true) with check(true);
alter table "public"."b2b_referencias_catalogo" enable row level security;grant select,insert,update,delete on "public"."b2b_referencias_catalogo" to authenticated;create policy existing_authenticated_access on "public"."b2b_referencias_catalogo" for all to authenticated using(true) with check(true);
alter table "public"."b2b_retenciones_cliente" enable row level security;grant select,insert,update,delete on "public"."b2b_retenciones_cliente" to authenticated;create policy existing_authenticated_access on "public"."b2b_retenciones_cliente" for all to authenticated using(true) with check(true);
alter table "public"."banco_creditek_aplicaciones_proveedor" enable row level security;grant select,insert,update,delete on "public"."banco_creditek_aplicaciones_proveedor" to authenticated;create policy existing_authenticated_access on "public"."banco_creditek_aplicaciones_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."banco_creditek_cuentas" enable row level security;grant select,insert,update,delete on "public"."banco_creditek_cuentas" to authenticated;create policy existing_authenticated_access on "public"."banco_creditek_cuentas" for all to authenticated using(true) with check(true);
alter table "public"."banco_creditek_movimientos" enable row level security;grant select,insert,update,delete on "public"."banco_creditek_movimientos" to authenticated;create policy existing_authenticated_access on "public"."banco_creditek_movimientos" for all to authenticated using(true) with check(true);
alter table "public"."banco_creditek_pagos_proveedor" enable row level security;grant select,insert,update,delete on "public"."banco_creditek_pagos_proveedor" to authenticated;create policy existing_authenticated_access on "public"."banco_creditek_pagos_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."beneficiary_bank_accounts" enable row level security;grant select,insert,update,delete on "public"."beneficiary_bank_accounts" to authenticated;create policy existing_authenticated_access on "public"."beneficiary_bank_accounts" for all to authenticated using(true) with check(true);
alter table "public"."caja_arqueo_intentos" enable row level security;grant select,insert,update,delete on "public"."caja_arqueo_intentos" to authenticated;create policy existing_authenticated_access on "public"."caja_arqueo_intentos" for all to authenticated using(true) with check(true);
alter table "public"."caja_ciclo_config" enable row level security;grant select,insert,update,delete on "public"."caja_ciclo_config" to authenticated;create policy existing_authenticated_access on "public"."caja_ciclo_config" for all to authenticated using(true) with check(true);
alter table "public"."caja_cortes" enable row level security;grant select,insert,update,delete on "public"."caja_cortes" to authenticated;create policy existing_authenticated_access on "public"."caja_cortes" for all to authenticated using(true) with check(true);
alter table "public"."caja_diaria" enable row level security;grant select,insert,update,delete on "public"."caja_diaria" to authenticated;create policy existing_authenticated_access on "public"."caja_diaria" for all to authenticated using(true) with check(true);
alter table "public"."captadores" enable row level security;grant select,insert,update,delete on "public"."captadores" to authenticated;create policy existing_authenticated_access on "public"."captadores" for all to authenticated using(true) with check(true);
alter table "public"."cartera_retail_retiros_auditoria" enable row level security;grant select,insert,update,delete on "public"."cartera_retail_retiros_auditoria" to authenticated;create policy existing_authenticated_access on "public"."cartera_retail_retiros_auditoria" for all to authenticated using(true) with check(true);
alter table "public"."categorias_producto" enable row level security;grant select,insert,update,delete on "public"."categorias_producto" to authenticated;create policy existing_authenticated_access on "public"."categorias_producto" for all to authenticated using(true) with check(true);
alter table "public"."clientes" enable row level security;grant select,insert,update,delete on "public"."clientes" to authenticated;create policy existing_authenticated_access on "public"."clientes" for all to authenticated using(true) with check(true);
alter table "public"."cobra_krediya_cut_operations" enable row level security;grant select,insert,update,delete on "public"."cobra_krediya_cut_operations" to authenticated;create policy existing_authenticated_access on "public"."cobra_krediya_cut_operations" for all to authenticated using(true) with check(true);
alter table "public"."cobra_krediya_cuts" enable row level security;grant select,insert,update,delete on "public"."cobra_krediya_cuts" to authenticated;create policy existing_authenticated_access on "public"."cobra_krediya_cuts" for all to authenticated using(true) with check(true);
alter table "public"."cobros_allocations" enable row level security;grant select,insert,update,delete on "public"."cobros_allocations" to authenticated;create policy existing_authenticated_access on "public"."cobros_allocations" for all to authenticated using(true) with check(true);
alter table "public"."cobros_deposits" enable row level security;grant select,insert,update,delete on "public"."cobros_deposits" to authenticated;create policy existing_authenticated_access on "public"."cobros_deposits" for all to authenticated using(true) with check(true);
alter table "public"."cobros_events" enable row level security;grant select,insert,update,delete on "public"."cobros_events" to authenticated;create policy existing_authenticated_access on "public"."cobros_events" for all to authenticated using(true) with check(true);
alter table "public"."cobros_expected" enable row level security;grant select,insert,update,delete on "public"."cobros_expected" to authenticated;create policy existing_authenticated_access on "public"."cobros_expected" for all to authenticated using(true) with check(true);
alter table "public"."comisiones" enable row level security;grant select,insert,update,delete on "public"."comisiones" to authenticated;create policy existing_authenticated_access on "public"."comisiones" for all to authenticated using(true) with check(true);
alter table "public"."comprobantes_consignacion" enable row level security;grant select,insert,update,delete on "public"."comprobantes_consignacion" to authenticated;create policy existing_authenticated_access on "public"."comprobantes_consignacion" for all to authenticated using(true) with check(true);
alter table "public"."conceptos_gasto" enable row level security;grant select,insert,update,delete on "public"."conceptos_gasto" to authenticated;create policy existing_authenticated_access on "public"."conceptos_gasto" for all to authenticated using(true) with check(true);
alter table "public"."conteos_bloque" enable row level security;grant select,insert,update,delete on "public"."conteos_bloque" to authenticated;create policy existing_authenticated_access on "public"."conteos_bloque" for all to authenticated using(true) with check(true);
alter table "public"."conteos_bloque_items" enable row level security;grant select,insert,update,delete on "public"."conteos_bloque_items" to authenticated;create policy existing_authenticated_access on "public"."conteos_bloque_items" for all to authenticated using(true) with check(true);
alter table "public"."costo_promedio_tienda_historial" enable row level security;grant select,insert,update,delete on "public"."costo_promedio_tienda_historial" to authenticated;create policy existing_authenticated_access on "public"."costo_promedio_tienda_historial" for all to authenticated using(true) with check(true);
alter table "public"."credit_collection_events" enable row level security;grant select,insert,update,delete on "public"."credit_collection_events" to authenticated;create policy existing_authenticated_access on "public"."credit_collection_events" for all to authenticated using(true) with check(true);
alter table "public"."credit_customer_links" enable row level security;grant select,insert,update,delete on "public"."credit_customer_links" to authenticated;create policy existing_authenticated_access on "public"."credit_customer_links" for all to authenticated using(true) with check(true);
alter table "public"."credit_portfolio_obligations" enable row level security;grant select,insert,update,delete on "public"."credit_portfolio_obligations" to authenticated;create policy existing_authenticated_access on "public"."credit_portfolio_obligations" for all to authenticated using(true) with check(true);
alter table "public"."credit_portfolio_settings" enable row level security;grant select,insert,update,delete on "public"."credit_portfolio_settings" to authenticated;create policy existing_authenticated_access on "public"."credit_portfolio_settings" for all to authenticated using(true) with check(true);
alter table "public"."credit_repayments" enable row level security;grant select,insert,update,delete on "public"."credit_repayments" to authenticated;create policy existing_authenticated_access on "public"."credit_repayments" for all to authenticated using(true) with check(true);
alter table "public"."creditos" enable row level security;grant select,insert,update,delete on "public"."creditos" to authenticated;create policy existing_authenticated_access on "public"."creditos" for all to authenticated using(true) with check(true);
alter table "public"."creditos_historicos" enable row level security;grant select,insert,update,delete on "public"."creditos_historicos" to authenticated;create policy existing_authenticated_access on "public"."creditos_historicos" for all to authenticated using(true) with check(true);
alter table "public"."creditos_historicos_plataforma" enable row level security;grant select,insert,update,delete on "public"."creditos_historicos_plataforma" to authenticated;create policy existing_authenticated_access on "public"."creditos_historicos_plataforma" for all to authenticated using(true) with check(true);
alter table "public"."creditos_plataforma_consulta_log" enable row level security;grant select,insert,update,delete on "public"."creditos_plataforma_consulta_log" to authenticated;create policy existing_authenticated_access on "public"."creditos_plataforma_consulta_log" for all to authenticated using(true) with check(true);
alter table "public"."cuenta_corriente" enable row level security;grant select,insert,update,delete on "public"."cuenta_corriente" to authenticated;create policy existing_authenticated_access on "public"."cuenta_corriente" for all to authenticated using(true) with check(true);
alter table "public"."cuentas_cartera" enable row level security;grant select,insert,update,delete on "public"."cuentas_cartera" to authenticated;create policy existing_authenticated_access on "public"."cuentas_cartera" for all to authenticated using(true) with check(true);
alter table "public"."documentos_solicitud" enable row level security;grant select,insert,update,delete on "public"."documentos_solicitud" to authenticated;create policy existing_authenticated_access on "public"."documentos_solicitud" for all to authenticated using(true) with check(true);
alter table "public"."ejecutivos" enable row level security;grant select,insert,update,delete on "public"."ejecutivos" to authenticated;create policy existing_authenticated_access on "public"."ejecutivos" for all to authenticated using(true) with check(true);
alter table "public"."enlaces_registro" enable row level security;grant select,insert,update,delete on "public"."enlaces_registro" to authenticated;create policy existing_authenticated_access on "public"."enlaces_registro" for all to authenticated using(true) with check(true);
alter table "public"."equivalencias_tienda" enable row level security;grant select,insert,update,delete on "public"."equivalencias_tienda" to authenticated;create policy existing_authenticated_access on "public"."equivalencias_tienda" for all to authenticated using(true) with check(true);
alter table "public"."erp_migration_cuts" enable row level security;grant select,insert,update,delete on "public"."erp_migration_cuts" to authenticated;create policy existing_authenticated_access on "public"."erp_migration_cuts" for all to authenticated using(true) with check(true);
alter table "public"."facturas_proveedor" enable row level security;grant select,insert,update,delete on "public"."facturas_proveedor" to authenticated;create policy existing_authenticated_access on "public"."facturas_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."festivos_colombia" enable row level security;grant select,insert,update,delete on "public"."festivos_colombia" to authenticated;create policy existing_authenticated_access on "public"."festivos_colombia" for all to authenticated using(true) with check(true);
alter table "public"."financial_entries" enable row level security;grant select,insert,update,delete on "public"."financial_entries" to authenticated;create policy existing_authenticated_access on "public"."financial_entries" for all to authenticated using(true) with check(true);
alter table "public"."financial_recurring_templates" enable row level security;grant select,insert,update,delete on "public"."financial_recurring_templates" to authenticated;create policy existing_authenticated_access on "public"."financial_recurring_templates" for all to authenticated using(true) with check(true);
alter table "public"."gastos" enable row level security;grant select,insert,update,delete on "public"."gastos" to authenticated;create policy existing_authenticated_access on "public"."gastos" for all to authenticated using(true) with check(true);
alter table "public"."gastos_historial" enable row level security;grant select,insert,update,delete on "public"."gastos_historial" to authenticated;create policy existing_authenticated_access on "public"."gastos_historial" for all to authenticated using(true) with check(true);
alter table "public"."historico_importado" enable row level security;grant select,insert,update,delete on "public"."historico_importado" to authenticated;create policy existing_authenticated_access on "public"."historico_importado" for all to authenticated using(true) with check(true);
alter table "public"."historico_mensual" enable row level security;grant select,insert,update,delete on "public"."historico_mensual" to authenticated;create policy existing_authenticated_access on "public"."historico_mensual" for all to authenticated using(true) with check(true);
alter table "public"."importacion_detalle" enable row level security;grant select,insert,update,delete on "public"."importacion_detalle" to authenticated;create policy existing_authenticated_access on "public"."importacion_detalle" for all to authenticated using(true) with check(true);
alter table "public"."importaciones_financiera" enable row level security;grant select,insert,update,delete on "public"."importaciones_financiera" to authenticated;create policy existing_authenticated_access on "public"."importaciones_financiera" for all to authenticated using(true) with check(true);
alter table "public"."instrucciones_consignacion" enable row level security;grant select,insert,update,delete on "public"."instrucciones_consignacion" to authenticated;create policy existing_authenticated_access on "public"."instrucciones_consignacion" for all to authenticated using(true) with check(true);
alter table "public"."kora_incident_comments" enable row level security;grant select,insert,update,delete on "public"."kora_incident_comments" to authenticated;create policy existing_authenticated_access on "public"."kora_incident_comments" for all to authenticated using(true) with check(true);
alter table "public"."kora_incident_history" enable row level security;grant select,insert,update,delete on "public"."kora_incident_history" to authenticated;create policy existing_authenticated_access on "public"."kora_incident_history" for all to authenticated using(true) with check(true);
alter table "public"."kora_incident_notifications" enable row level security;grant select,insert,update,delete on "public"."kora_incident_notifications" to authenticated;create policy existing_authenticated_access on "public"."kora_incident_notifications" for all to authenticated using(true) with check(true);
alter table "public"."kora_incident_operations" enable row level security;grant select,insert,update,delete on "public"."kora_incident_operations" to authenticated;create policy existing_authenticated_access on "public"."kora_incident_operations" for all to authenticated using(true) with check(true);
alter table "public"."kora_incident_permissions" enable row level security;grant select,insert,update,delete on "public"."kora_incident_permissions" to authenticated;create policy existing_authenticated_access on "public"."kora_incident_permissions" for all to authenticated using(true) with check(true);
alter table "public"."kora_incident_sequences" enable row level security;grant select,insert,update,delete on "public"."kora_incident_sequences" to authenticated;create policy existing_authenticated_access on "public"."kora_incident_sequences" for all to authenticated using(true) with check(true);
alter table "public"."kora_incidents" enable row level security;grant select,insert,update,delete on "public"."kora_incidents" to authenticated;create policy existing_authenticated_access on "public"."kora_incidents" for all to authenticated using(true) with check(true);
alter table "public"."kora_notifications" enable row level security;grant select,insert,update,delete on "public"."kora_notifications" to authenticated;create policy existing_authenticated_access on "public"."kora_notifications" for all to authenticated using(true) with check(true);
alter table "public"."kora_nova_outbox" enable row level security;grant select,insert,update,delete on "public"."kora_nova_outbox" to authenticated;create policy existing_authenticated_access on "public"."kora_nova_outbox" for all to authenticated using(true) with check(true);
alter table "public"."kora_nova_platform_renewals" enable row level security;grant select,insert,update,delete on "public"."kora_nova_platform_renewals" to authenticated;create policy existing_authenticated_access on "public"."kora_nova_platform_renewals" for all to authenticated using(true) with check(true);
alter table "public"."kora_nova_renewal_delivery" enable row level security;grant select,insert,update,delete on "public"."kora_nova_renewal_delivery" to authenticated;create policy existing_authenticated_access on "public"."kora_nova_renewal_delivery" for all to authenticated using(true) with check(true);
alter table "public"."kora_nova_reviewers" enable row level security;grant select,insert,update,delete on "public"."kora_nova_reviewers" to authenticated;create policy existing_authenticated_access on "public"."kora_nova_reviewers" for all to authenticated using(true) with check(true);
alter table "public"."kora_nova_sources" enable row level security;grant select,insert,update,delete on "public"."kora_nova_sources" to authenticated;create policy existing_authenticated_access on "public"."kora_nova_sources" for all to authenticated using(true) with check(true);
alter table "public"."krediya_bonus_rules" enable row level security;grant select,insert,update,delete on "public"."krediya_bonus_rules" to authenticated;create policy existing_authenticated_access on "public"."krediya_bonus_rules" for all to authenticated using(true) with check(true);
alter table "public"."krediya_diferencias" enable row level security;grant select,insert,update,delete on "public"."krediya_diferencias" to authenticated;create policy existing_authenticated_access on "public"."krediya_diferencias" for all to authenticated using(true) with check(true);
alter table "public"."krediya_diferencias_gestiones" enable row level security;grant select,insert,update,delete on "public"."krediya_diferencias_gestiones" to authenticated;create policy existing_authenticated_access on "public"."krediya_diferencias_gestiones" for all to authenticated using(true) with check(true);
alter table "public"."krediya_gestiones" enable row level security;grant select,insert,update,delete on "public"."krediya_gestiones" to authenticated;create policy existing_authenticated_access on "public"."krediya_gestiones" for all to authenticated using(true) with check(true);
alter table "public"."krediya_import_reports" enable row level security;grant select,insert,update,delete on "public"."krediya_import_reports" to authenticated;create policy existing_authenticated_access on "public"."krediya_import_reports" for all to authenticated using(true) with check(true);
alter table "public"."krediya_instrucciones" enable row level security;grant select,insert,update,delete on "public"."krediya_instrucciones" to authenticated;create policy existing_authenticated_access on "public"."krediya_instrucciones" for all to authenticated using(true) with check(true);
alter table "public"."krediya_price_rules" enable row level security;grant select,insert,update,delete on "public"."krediya_price_rules" to authenticated;create policy existing_authenticated_access on "public"."krediya_price_rules" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_adjustments" enable row level security;grant select,insert,update,delete on "public"."liquidation_adjustments" to authenticated;create policy existing_authenticated_access on "public"."liquidation_adjustments" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_approvals" enable row level security;grant select,insert,update,delete on "public"."liquidation_approvals" to authenticated;create policy existing_authenticated_access on "public"."liquidation_approvals" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_beneficiaries" enable row level security;grant select,insert,update,delete on "public"."liquidation_beneficiaries" to authenticated;create policy existing_authenticated_access on "public"."liquidation_beneficiaries" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_bonuses" enable row level security;grant select,insert,update,delete on "public"."liquidation_bonuses" to authenticated;create policy existing_authenticated_access on "public"."liquidation_bonuses" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_calculations" enable row level security;grant select,insert,update,delete on "public"."liquidation_calculations" to authenticated;create policy existing_authenticated_access on "public"."liquidation_calculations" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_domain_events" enable row level security;grant select,insert,update,delete on "public"."liquidation_domain_events" to authenticated;create policy existing_authenticated_access on "public"."liquidation_domain_events" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_imported_files" enable row level security;grant select,insert,update,delete on "public"."liquidation_imported_files" to authenticated;create policy existing_authenticated_access on "public"."liquidation_imported_files" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_incidents" enable row level security;grant select,insert,update,delete on "public"."liquidation_incidents" to authenticated;create policy existing_authenticated_access on "public"."liquidation_incidents" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_operations" enable row level security;grant select,insert,update,delete on "public"."liquidation_operations" to authenticated;create policy existing_authenticated_access on "public"."liquidation_operations" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_platforms" enable row level security;grant select,insert,update,delete on "public"."liquidation_platforms" to authenticated;create policy existing_authenticated_access on "public"."liquidation_platforms" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_source_rows" enable row level security;grant select,insert,update,delete on "public"."liquidation_source_rows" to authenticated;create policy existing_authenticated_access on "public"."liquidation_source_rows" for all to authenticated using(true) with check(true);
alter table "public"."liquidation_treasury_destinations" enable row level security;grant select,insert,update,delete on "public"."liquidation_treasury_destinations" to authenticated;create policy existing_authenticated_access on "public"."liquidation_treasury_destinations" for all to authenticated using(true) with check(true);
alter table "public"."liquidations" enable row level security;grant select,insert,update,delete on "public"."liquidations" to authenticated;create policy existing_authenticated_access on "public"."liquidations" for all to authenticated using(true) with check(true);
alter table "public"."movimientos" enable row level security;grant select,insert,update,delete on "public"."movimientos" to authenticated;create policy existing_authenticated_access on "public"."movimientos" for all to authenticated using(true) with check(true);
alter table "public"."movimientos_caja_tienda" enable row level security;grant select,insert,update,delete on "public"."movimientos_caja_tienda" to authenticated;create policy existing_authenticated_access on "public"."movimientos_caja_tienda" for all to authenticated using(true) with check(true);
alter table "public"."movimientos_cartera" enable row level security;grant select,insert,update,delete on "public"."movimientos_cartera" to authenticated;create policy existing_authenticated_access on "public"."movimientos_cartera" for all to authenticated using(true) with check(true);
alter table "public"."movimientos_tesoreria_central" enable row level security;grant select,insert,update,delete on "public"."movimientos_tesoreria_central" to authenticated;create policy existing_authenticated_access on "public"."movimientos_tesoreria_central" for all to authenticated using(true) with check(true);
alter table "public"."nova_allied_login_challenges" enable row level security;grant select,insert,update,delete on "public"."nova_allied_login_challenges" to authenticated;create policy existing_authenticated_access on "public"."nova_allied_login_challenges" for all to authenticated using(true) with check(true);
alter table "public"."nova_allied_login_members" enable row level security;grant select,insert,update,delete on "public"."nova_allied_login_members" to authenticated;create policy existing_authenticated_access on "public"."nova_allied_login_members" for all to authenticated using(true) with check(true);
alter table "public"."nova_allied_login_sessions" enable row level security;grant select,insert,update,delete on "public"."nova_allied_login_sessions" to authenticated;create policy existing_authenticated_access on "public"."nova_allied_login_sessions" for all to authenticated using(true) with check(true);
alter table "public"."nova_authorizations" enable row level security;grant select,insert,update,delete on "public"."nova_authorizations" to authenticated;create policy existing_authenticated_access on "public"."nova_authorizations" for all to authenticated using(true) with check(true);
alter table "public"."nova_client_otp_dispatch" enable row level security;grant select,insert,update,delete on "public"."nova_client_otp_dispatch" to authenticated;create policy existing_authenticated_access on "public"."nova_client_otp_dispatch" for all to authenticated using(true) with check(true);
alter table "public"."nova_client_otp_policy" enable row level security;grant select,insert,update,delete on "public"."nova_client_otp_policy" to authenticated;create policy existing_authenticated_access on "public"."nova_client_otp_policy" for all to authenticated using(true) with check(true);
alter table "public"."nova_otp_delivery_receipts" enable row level security;grant select,insert,update,delete on "public"."nova_otp_delivery_receipts" to authenticated;create policy existing_authenticated_access on "public"."nova_otp_delivery_receipts" for all to authenticated using(true) with check(true);
alter table "public"."nova_photo_quality_consents" enable row level security;grant select,insert,update,delete on "public"."nova_photo_quality_consents" to authenticated;create policy existing_authenticated_access on "public"."nova_photo_quality_consents" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_actor_emails" enable row level security;grant select,insert,update,delete on "public"."nova_retail_actor_emails" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_actor_emails" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_case_events" enable row level security;grant select,insert,update,delete on "public"."nova_retail_case_events" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_case_events" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_cases" enable row level security;grant select,insert,update,delete on "public"."nova_retail_cases" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_cases" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_notifications" enable row level security;grant select,insert,update,delete on "public"."nova_retail_notifications" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_notifications" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_photo_events" enable row level security;grant select,insert,update,delete on "public"."nova_retail_photo_events" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_photo_events" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_photo_reviews" enable row level security;grant select,insert,update,delete on "public"."nova_retail_photo_reviews" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_photo_reviews" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_reference_deliveries" enable row level security;grant select,insert,update,delete on "public"."nova_retail_reference_deliveries" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_reference_deliveries" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_reference_replacements" enable row level security;grant select,insert,update,delete on "public"."nova_retail_reference_replacements" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_reference_replacements" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_reviewers" enable row level security;grant select,insert,update,delete on "public"."nova_retail_reviewers" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_reviewers" for all to authenticated using(true) with check(true);
alter table "public"."nova_retail_store_contacts" enable row level security;grant select,insert,update,delete on "public"."nova_retail_store_contacts" to authenticated;create policy existing_authenticated_access on "public"."nova_retail_store_contacts" for all to authenticated using(true) with check(true);
alter table "public"."orden_compra_cambios" enable row level security;grant select,insert,update,delete on "public"."orden_compra_cambios" to authenticated;create policy existing_authenticated_access on "public"."orden_compra_cambios" for all to authenticated using(true) with check(true);
alter table "public"."orden_compra_items" enable row level security;grant select,insert,update,delete on "public"."orden_compra_items" to authenticated;create policy existing_authenticated_access on "public"."orden_compra_items" for all to authenticated using(true) with check(true);
alter table "public"."ordenes_compra" enable row level security;grant select,insert,update,delete on "public"."ordenes_compra" to authenticated;create policy existing_authenticated_access on "public"."ordenes_compra" for all to authenticated using(true) with check(true);
alter table "public"."origenes" enable row level security;grant select,insert,update,delete on "public"."origenes" to authenticated;create policy existing_authenticated_access on "public"."origenes" for all to authenticated using(true) with check(true);
alter table "public"."otp_codigos" enable row level security;grant select,insert,update,delete on "public"."otp_codigos" to authenticated;create policy existing_authenticated_access on "public"."otp_codigos" for all to authenticated using(true) with check(true);
alter table "public"."pagos_proveedor" enable row level security;grant select,insert,update,delete on "public"."pagos_proveedor" to authenticated;create policy existing_authenticated_access on "public"."pagos_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."payment_destination_corrections" enable row level security;grant select,insert,update,delete on "public"."payment_destination_corrections" to authenticated;create policy existing_authenticated_access on "public"."payment_destination_corrections" for all to authenticated using(true) with check(true);
alter table "public"."payment_dispatch_items" enable row level security;grant select,insert,update,delete on "public"."payment_dispatch_items" to authenticated;create policy existing_authenticated_access on "public"."payment_dispatch_items" for all to authenticated using(true) with check(true);
alter table "public"."payment_dispatches" enable row level security;grant select,insert,update,delete on "public"."payment_dispatches" to authenticated;create policy existing_authenticated_access on "public"."payment_dispatches" for all to authenticated using(true) with check(true);
alter table "public"."payment_items" enable row level security;grant select,insert,update,delete on "public"."payment_items" to authenticated;create policy existing_authenticated_access on "public"."payment_items" for all to authenticated using(true) with check(true);
alter table "public"."payment_orders" enable row level security;grant select,insert,update,delete on "public"."payment_orders" to authenticated;create policy existing_authenticated_access on "public"."payment_orders" for all to authenticated using(true) with check(true);
alter table "public"."pedido_b2b_items" enable row level security;grant select,insert,update,delete on "public"."pedido_b2b_items" to authenticated;create policy existing_authenticated_access on "public"."pedido_b2b_items" for all to authenticated using(true) with check(true);
alter table "public"."pedidos_b2b" enable row level security;grant select,insert,update,delete on "public"."pedidos_b2b" to authenticated;create policy existing_authenticated_access on "public"."pedidos_b2b" for all to authenticated using(true) with check(true);
alter table "public"."periodos" enable row level security;grant select,insert,update,delete on "public"."periodos" to authenticated;create policy existing_authenticated_access on "public"."periodos" for all to authenticated using(true) with check(true);
alter table "public"."presupuesto_premio_mensual" enable row level security;grant select,insert,update,delete on "public"."presupuesto_premio_mensual" to authenticated;create policy existing_authenticated_access on "public"."presupuesto_premio_mensual" for all to authenticated using(true) with check(true);
alter table "public"."presupuesto_premios" enable row level security;grant select,insert,update,delete on "public"."presupuesto_premios" to authenticated;create policy existing_authenticated_access on "public"."presupuesto_premios" for all to authenticated using(true) with check(true);
alter table "public"."presupuesto_whatsapp_destinos" enable row level security;grant select,insert,update,delete on "public"."presupuesto_whatsapp_destinos" to authenticated;create policy existing_authenticated_access on "public"."presupuesto_whatsapp_destinos" for all to authenticated using(true) with check(true);
alter table "public"."presupuesto_whatsapp_envios" enable row level security;grant select,insert,update,delete on "public"."presupuesto_whatsapp_envios" to authenticated;create policy existing_authenticated_access on "public"."presupuesto_whatsapp_envios" for all to authenticated using(true) with check(true);
alter table "public"."presupuestos" enable row level security;grant select,insert,update,delete on "public"."presupuestos" to authenticated;create policy existing_authenticated_access on "public"."presupuestos" for all to authenticated using(true) with check(true);
alter table "public"."producto_foto_historial" enable row level security;grant select,insert,update,delete on "public"."producto_foto_historial" to authenticated;create policy existing_authenticated_access on "public"."producto_foto_historial" for all to authenticated using(true) with check(true);
alter table "public"."productos" enable row level security;grant select,insert,update,delete on "public"."productos" to authenticated;create policy existing_authenticated_access on "public"."productos" for all to authenticated using(true) with check(true);
alter table "public"."proveedores" enable row level security;grant select,insert,update,delete on "public"."proveedores" to authenticated;create policy existing_authenticated_access on "public"."proveedores" for all to authenticated using(true) with check(true);
alter table "public"."proveedores_ajustes_detalle" enable row level security;grant select,insert,update,delete on "public"."proveedores_ajustes_detalle" to authenticated;create policy existing_authenticated_access on "public"."proveedores_ajustes_detalle" for all to authenticated using(true) with check(true);
alter table "public"."proveedores_ajustes_solicitudes" enable row level security;grant select,insert,update,delete on "public"."proveedores_ajustes_solicitudes" to authenticated;create policy existing_authenticated_access on "public"."proveedores_ajustes_solicitudes" for all to authenticated using(true) with check(true);
alter table "public"."proveedores_retencion_automatica" enable row level security;grant select,insert,update,delete on "public"."proveedores_retencion_automatica" to authenticated;create policy existing_authenticated_access on "public"."proveedores_retencion_automatica" for all to authenticated using(true) with check(true);
alter table "public"."referencias" enable row level security;grant select,insert,update,delete on "public"."referencias" to authenticated;create policy existing_authenticated_access on "public"."referencias" for all to authenticated using(true) with check(true);
alter table "public"."remision_items" enable row level security;grant select,insert,update,delete on "public"."remision_items" to authenticated;create policy existing_authenticated_access on "public"."remision_items" for all to authenticated using(true) with check(true);
alter table "public"."remision_margenes" enable row level security;grant select,insert,update,delete on "public"."remision_margenes" to authenticated;create policy existing_authenticated_access on "public"."remision_margenes" for all to authenticated using(true) with check(true);
alter table "public"."remisiones" enable row level security;grant select,insert,update,delete on "public"."remisiones" to authenticated;create policy existing_authenticated_access on "public"."remisiones" for all to authenticated using(true) with check(true);
alter table "public"."reportes_deuda_enviados" enable row level security;grant select,insert,update,delete on "public"."reportes_deuda_enviados" to authenticated;create policy existing_authenticated_access on "public"."reportes_deuda_enviados" for all to authenticated using(true) with check(true);
alter table "public"."reportes_diarios_enviados" enable row level security;grant select,insert,update,delete on "public"."reportes_diarios_enviados" to authenticated;create policy existing_authenticated_access on "public"."reportes_diarios_enviados" for all to authenticated using(true) with check(true);
alter table "public"."retail_b2b_compensations" enable row level security;grant select,insert,update,delete on "public"."retail_b2b_compensations" to authenticated;create policy existing_authenticated_access on "public"."retail_b2b_compensations" for all to authenticated using(true) with check(true);
alter table "public"."retenciones_factura_proveedor" enable row level security;grant select,insert,update,delete on "public"."retenciones_factura_proveedor" to authenticated;create policy existing_authenticated_access on "public"."retenciones_factura_proveedor" for all to authenticated using(true) with check(true);
alter table "public"."saldo_ajustes_auditoria" enable row level security;grant select,insert,update,delete on "public"."saldo_ajustes_auditoria" to authenticated;create policy existing_authenticated_access on "public"."saldo_ajustes_auditoria" for all to authenticated using(true) with check(true);
alter table "public"."saldos_iniciales_cartera" enable row level security;grant select,insert,update,delete on "public"."saldos_iniciales_cartera" to authenticated;create policy existing_authenticated_access on "public"."saldos_iniciales_cartera" for all to authenticated using(true) with check(true);
alter table "public"."sesiones_conteo_cruzado" enable row level security;grant select,insert,update,delete on "public"."sesiones_conteo_cruzado" to authenticated;create policy existing_authenticated_access on "public"."sesiones_conteo_cruzado" for all to authenticated using(true) with check(true);
alter table "public"."settlement_policy_versions" enable row level security;grant select,insert,update,delete on "public"."settlement_policy_versions" to authenticated;create policy existing_authenticated_access on "public"."settlement_policy_versions" for all to authenticated using(true) with check(true);
alter table "public"."solicitudes" enable row level security;grant select,insert,update,delete on "public"."solicitudes" to authenticated;create policy existing_authenticated_access on "public"."solicitudes" for all to authenticated using(true) with check(true);
alter table "public"."stock_cantidad" enable row level security;grant select,insert,update,delete on "public"."stock_cantidad" to authenticated;create policy existing_authenticated_access on "public"."stock_cantidad" for all to authenticated using(true) with check(true);
alter table "public"."stock_cantidad_lotes" enable row level security;grant select,insert,update,delete on "public"."stock_cantidad_lotes" to authenticated;create policy existing_authenticated_access on "public"."stock_cantidad_lotes" for all to authenticated using(true) with check(true);
alter table "public"."traslado_items" enable row level security;grant select,insert,update,delete on "public"."traslado_items" to authenticated;create policy existing_authenticated_access on "public"."traslado_items" for all to authenticated using(true) with check(true);
alter table "public"."traslados" enable row level security;grant select,insert,update,delete on "public"."traslados" to authenticated;create policy existing_authenticated_access on "public"."traslados" for all to authenticated using(true) with check(true);
alter table "public"."treasury_movements" enable row level security;grant select,insert,update,delete on "public"."treasury_movements" to authenticated;create policy existing_authenticated_access on "public"."treasury_movements" for all to authenticated using(true) with check(true);
alter table "public"."treasury_unit_balances" enable row level security;grant select,insert,update,delete on "public"."treasury_unit_balances" to authenticated;create policy existing_authenticated_access on "public"."treasury_unit_balances" for all to authenticated using(true) with check(true);
alter table "public"."unidades" enable row level security;grant select,insert,update,delete on "public"."unidades" to authenticated;create policy existing_authenticated_access on "public"."unidades" for all to authenticated using(true) with check(true);
alter table "public"."utilidades_cierres_negocio" enable row level security;grant select,insert,update,delete on "public"."utilidades_cierres_negocio" to authenticated;create policy existing_authenticated_access on "public"."utilidades_cierres_negocio" for all to authenticated using(true) with check(true);
alter table "public"."venta_ajustes_administrativos" enable row level security;grant select,insert,update,delete on "public"."venta_ajustes_administrativos" to authenticated;create policy existing_authenticated_access on "public"."venta_ajustes_administrativos" for all to authenticated using(true) with check(true);
alter table "public"."venta_devoluciones" enable row level security;grant select,insert,update,delete on "public"."venta_devoluciones" to authenticated;create policy existing_authenticated_access on "public"."venta_devoluciones" for all to authenticated using(true) with check(true);
alter table "public"."venta_items" enable row level security;grant select,insert,update,delete on "public"."venta_items" to authenticated;create policy existing_authenticated_access on "public"."venta_items" for all to authenticated using(true) with check(true);
alter table "public"."ventas" enable row level security;grant select,insert,update,delete on "public"."ventas" to authenticated;create policy existing_authenticated_access on "public"."ventas" for all to authenticated using(true) with check(true);
alter table "public"."ventas_autorizaciones" enable row level security;grant select,insert,update,delete on "public"."ventas_autorizaciones" to authenticated;create policy existing_authenticated_access on "public"."ventas_autorizaciones" for all to authenticated using(true) with check(true);
CREATE OR REPLACE FUNCTION kora_private.exigir_confirmacion_deuda_api()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.perfiles%rowtype; h timestamp:=clock_timestamp() at time zone 'America/Bogota';
 ruta text:=ltrim(coalesce(current_setting('request.path',true),''),'/');
begin
 if auth.uid() is null or h::time<time '11:00' or h::date<(select inicio from kora_private.confirmacion_deuda_config where id) then return; end if;
 if current_setting('request.method',true) in ('GET','HEAD','OPTIONS') then return; end if;
 if ruta in ('rpc/estado_confirmacion_deuda_tienda','rpc/confirmar_deuda_tienda','rpc/es_admin_b2b','rpc/tiene_capacidad_aliados','rpc/tiene_capacidad_cartera') then return; end if;
 select * into p from public.perfiles where id=auth.uid() and activo and rol='admin_tienda';
 if not found then return; end if;
 if not exists(select 1 from public.confirmaciones_deuda_tienda where usuario_id=p.id and tienda_codigo=p.tienda_codigo and fecha=h::date) then
 raise sqlstate 'PT403' using message='Confirma la deuda de tu tienda con Creditek o reporta la diferencia para continuar.',hint='KORA_CONFIRMACION_DEUDA_PENDIENTE';
 end if;
end $function$;
CREATE OR REPLACE FUNCTION public.kora_confirmacion_deuda_pre_request()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ select kora_private.exigir_confirmacion_deuda_api(); $function$;
revoke execute on function kora_private.exigir_confirmacion_deuda_api() from public;
alter table realtime.subscription disable row level security;alter table realtime.schema_migrations disable row level security;grant select on realtime.subscription to authenticated;
drop table public.aliados_operadores;
drop table public.clientes;
drop table public.origenes;
drop table public.nova_authorizations;
drop table public.credit_repayments;
drop table public.credit_collection_events;
drop table public.credit_portfolio_obligations;
drop table public.credit_portfolio_settings;
drop table public.liquidation_operations;
drop table public.liquidations;
drop table public.cobra_krediya_cut_operations;
drop table public.cobra_krediya_cuts;
create table clientes(id uuid primary key,nombre_completo text,cedula text,private_note text);
 create table origenes(codigo text primary key,nombre text,private_note text);
 create table nova_authorizations(id uuid primary key,decision text,external_decision_id text,rule_version text,private_note text);
 create table aliados_operadores(perfil_id uuid,capacidad text,activo boolean);
 create table credit_portfolio_settings(singleton boolean,nova_enforcement_enabled boolean,nova_enforcement_from date,private_note text);
 insert into credit_portfolio_settings values(true,false,null,'never project');
 create table liquidations(id uuid primary key,approved_at timestamptz,approved_by uuid,frozen_at timestamptz);
 create table liquidation_operations(id uuid primary key,liquidation_id uuid references liquidations,plataforma text,reconocida boolean,external_id text,cliente_documento text,cliente_nombre text,establishment_name text,origen_codigo text,operation_at timestamptz,normalized_data jsonb,monto_credito numeric,policy_snapshot jsonb);
 create table credit_portfolio_obligations(id uuid primary key,operation_id uuid unique references liquidation_operations,credito_id uuid,cliente_id uuid references clientes,plataforma text,external_credit_id text,origen_codigo text,cliente_nombre_snapshot text,cliente_documento_snapshot text,original_amount numeric,outstanding_amount numeric,ally_paid_at timestamptz,first_due_date date,next_due_date date,status text,pre_nova boolean,nova_authorization_id uuid references nova_authorizations);
 create table credit_repayments(id uuid primary key,obligation_id uuid references credit_portfolio_obligations,amount numeric,status text,private_note text);
 create table credit_collection_events(id uuid primary key default gen_random_uuid(),obligation_id uuid not null references credit_portfolio_obligations,actor_type text not null,event_type text not null,channel text,note text,promise_date date,promise_amount numeric,created_by uuid references perfiles,created_at timestamptz not null default now());
CREATE OR REPLACE FUNCTION public.creditos_cartera_puede_leer(p_origen_codigo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo
      and (p.rol in ('gerencia','auditoria') or p.tienda_codigo = p_origen_codigo)
  );
$function$;
CREATE OR REPLACE FUNCTION public.rol_actual()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select rol from public.perfiles where id=auth.uid() and activo;
$function$;
CREATE OR REPLACE FUNCTION public.tiene_capacidad_cartera(p_capacidad text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.credit_portfolio_operators operator
    where operator.perfil_id = (select auth.uid())
      and operator.active
      and case p_capacidad
        when 'read' then operator.capability in ('read','manage')
        when 'manage' then operator.capability = 'manage'
        else false
      end
  );
$function$;
revoke execute on function public.tiene_capacidad_cartera(text) from public,anon;grant execute on function public.tiene_capacidad_cartera(text) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.tiene_capacidad_aliados(p_capacidad text DEFAULT 'revisor'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists(select 1 from public.aliados_operadores o join public.perfiles p on p.id=o.perfil_id
    where o.perfil_id=auth.uid() and o.activo and p.activo
      and (o.capacidad=p_capacidad or o.capacidad='aprobador'));
$function$;
alter table public.aliados_operadores enable row level security;grant select on public.aliados_operadores to authenticated;create policy baseline_read on public.aliados_operadores for select to authenticated using(true);
alter table public.clientes enable row level security;grant select on public.clientes to authenticated;create policy baseline_read on public.clientes for select to authenticated using(true);
alter table public.origenes enable row level security;grant select on public.origenes to authenticated;create policy baseline_read on public.origenes for select to authenticated using(true);
alter table public.nova_authorizations enable row level security;grant select on public.nova_authorizations to authenticated;create policy baseline_read on public.nova_authorizations for select to authenticated using(true);
alter table public.credit_repayments enable row level security;grant select on public.credit_repayments to authenticated;create policy baseline_read on public.credit_repayments for select to authenticated using(true);
alter table public.credit_collection_events enable row level security;grant select on public.credit_collection_events to authenticated;create policy baseline_read on public.credit_collection_events for select to authenticated using(true);
alter table public.credit_portfolio_obligations enable row level security;grant select on public.credit_portfolio_obligations to authenticated;create policy baseline_read on public.credit_portfolio_obligations for select to authenticated using(true);
alter table public.credit_portfolio_settings enable row level security;grant select on public.credit_portfolio_settings to authenticated;create policy baseline_read on public.credit_portfolio_settings for select to authenticated using(true);
alter table public.liquidation_operations enable row level security;grant select on public.liquidation_operations to authenticated;create policy baseline_read on public.liquidation_operations for select to authenticated using(true);
alter table public.liquidations enable row level security;grant select on public.liquidations to authenticated;create policy baseline_read on public.liquidations for select to authenticated using(true);
-- REVIEW CANDIDATE ONLY. No production execution is authorized.
-- Immutable provider observations; never creates a loan, repayment or financial balance.
begin;
-- Source records remain unchanged: cancellation/evidence rows may share a contract.
-- Import capability depends on reviewed full-source visibility; that dependency is verified locally before integration.

create function public.cobra_quality_operator()
returns boolean language sql stable security invoker set search_path = '' as $$
 select (select auth.uid()) is not null and public.rol_actual() is not null
 and (public.rol_actual() in ('gerencia','auditoria') or public.tiene_capacidad_cartera('manage'));
$$;
revoke all on function public.cobra_quality_operator() from public,anon,authenticated,service_role;
grant execute on function public.cobra_quality_operator() to authenticated;

create function public.cobra_quality_importer()
returns boolean language sql stable security invoker set search_path='' as $$
 select public.cobra_quality_operator() and public.tiene_capacidad_aliados('revisor');
$$;
revoke all on function public.cobra_quality_importer() from public,anon,authenticated,service_role;
grant execute on function public.cobra_quality_importer() to authenticated;

create function public.cobra_quality_fold(p_value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
 select lower(regexp_replace(regexp_replace(normalize(btrim(p_value),NFD),U&'[\0300-\036f]','','g'),'[[:space:]]+',' ','g'));
$$;
create function public.cobra_quality_document(p_value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
 select case when btrim(p_value) ~ '^[0-9]{1,3}(\.[0-9]{3})+$' then replace(btrim(p_value),'.','')
 when btrim(p_value) ~ '^[a-zA-Z0-9-]{3,40}$' then lower(btrim(p_value)) else null end;
$$;
revoke all on function public.cobra_quality_fold(text),public.cobra_quality_document(text) from public,anon,authenticated,service_role;
grant execute on function public.cobra_quality_fold(text),public.cobra_quality_document(text) to authenticated;

create table public.cobra_krediya_cuts (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 cohort_month date not null check(extract(day from cohort_month)=1),
 cutoff date not null check(cutoff>=cohort_month),
 source_name text not null check(length(source_name) between 1 and 180),
 source_rows jsonb not null check(jsonb_typeof(source_rows)='array'),
 observations jsonb not null check(jsonb_typeof(observations)='array'),
 link_keys jsonb not null check(jsonb_typeof(link_keys)='object'),
 row_count integer not null check(row_count between 1 and 10000),
 received_by uuid not null references public.perfiles(id) on delete restrict,
 received_at timestamptz not null default now(),
 schema_version integer not null default 1 check(schema_version=1),
 unique(file_sha256,cohort_month,cutoff)
);
create table public.cobra_krediya_cut_operations (
 cut_id uuid not null references public.cobra_krediya_cuts(id) on delete restrict,
 operation_id uuid not null references public.liquidation_operations(id) on delete restrict,
 primary key(cut_id,operation_id)
);
create index cobra_krediya_cuts_period_idx on public.cobra_krediya_cuts(cohort_month,cutoff desc,received_at desc);
create index cobra_krediya_cut_operation_idx on public.cobra_krediya_cut_operations(operation_id,cut_id);
alter table public.cobra_krediya_cuts enable row level security;
alter table public.cobra_krediya_cuts force row level security;
alter table public.cobra_krediya_cut_operations enable row level security;
alter table public.cobra_krediya_cut_operations force row level security;
revoke all on public.cobra_krediya_cuts,public.cobra_krediya_cut_operations from public,anon,authenticated,service_role;
-- Explicitly authorized tracking snapshot access. Raw submitted rows are not readable by operators.
grant select(id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,source_name,observations,link_keys,row_count,received_by,received_at,schema_version) on public.cobra_krediya_cuts to authenticated;
grant select on public.cobra_krediya_cut_operations to authenticated;
grant insert(request_id,file_sha256,cohort_month,cutoff,source_name,source_rows) on public.cobra_krediya_cuts to authenticated;
grant insert(cut_id,operation_id) on public.cobra_krediya_cut_operations to authenticated;
create policy cobra_quality_cuts_read on public.cobra_krediya_cuts for select to authenticated using ((select public.cobra_quality_operator()));
create policy cobra_quality_cuts_insert on public.cobra_krediya_cuts for insert to authenticated with check ((select public.cobra_quality_importer()) and received_by=(select auth.uid()));
create policy cobra_quality_links_read on public.cobra_krediya_cut_operations for select to authenticated using ((select public.cobra_quality_operator()));
create policy cobra_quality_links_insert on public.cobra_krediya_cut_operations for insert to authenticated with check (
 (select public.cobra_quality_operator()) and exists(
 select 1 from public.cobra_krediya_cuts c where c.id=cut_id and c.received_by=(select auth.uid())
 and c.link_keys ? operation_id::text));

create function public.cobra_krediya_prepare_cut()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
 r jsonb; op public.liquidation_operations%rowtype; source_map jsonb; matched jsonb;
 contract text; created date; business_date date; fee bigint; financed bigint; total integer; cycled integer; paid integer; overdue integer;
 canonical_rows jsonb[]='{}'; canonical jsonb='[]'; key text; count_rows integer; due_date date; expected integer;
begin
 if not coalesce(public.cobra_quality_importer(),false) then raise exception 'cobra_not_authorized' using errcode='42501'; end if;
 if new.cutoff>(now() at time zone 'America/Bogota')::date then raise exception 'cobra_future_cutoff'; end if;
 if new.source_rows is null or jsonb_typeof(new.source_rows)<>'array' then raise exception 'cobra_invalid_rows'; end if;
 count_rows=jsonb_array_length(new.source_rows);
 if count_rows<1 or count_rows>10000 or octet_length(new.source_rows::text)>8000000 then raise exception 'cobra_rows_limit'; end if;
 if exists(select 1 from jsonb_array_elements(new.source_rows) x group by lower(btrim(x->>'contract')) having count(*)>1) then raise exception 'cobra_duplicate_or_invalid_contract'; end if;
 -- Read the visible source once. Under RLS the normalized expression is not
 -- necessarily usable as an index condition; one lookup per row scans it N times.
 -- This stays SECURITY INVOKER and retains the same source-visibility dependency.
 with requested as materialized (
  select lower(btrim(x->>'contract')) contract from jsonb_array_elements(new.source_rows) x
 ), sources as materialized (
  select lower(btrim(o.external_id)) contract,to_jsonb(o) operation,
   l.approved_at is not null and l.approved_by is not null and l.frozen_at is not null approved
  from public.liquidation_operations o
  join requested r on r.contract=lower(btrim(o.external_id))
  left join public.liquidations l on l.id=o.liquidation_id
  where o.plataforma='krediya' and o.reconocida
 ), grouped as (
  select s.contract,jsonb_build_object('matches',count(*),'operation',(array_agg(s.operation))[1],'approved',bool_and(s.approved)) value
  from sources s group by s.contract
 ) select coalesce(jsonb_object_agg(g.contract,g.value),'{}'::jsonb) into source_map from grouped g;
 for r in select value from jsonb_array_elements(new.source_rows) loop
  if jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>13
  or not r ?& array['contract','document','customer','store','created','financed_cents','fee_cents','total_installments','frequency','cycled','paid','overdue','contract_status'] then raise exception 'cobra_invalid_row_shape'; end if;
  foreach key in array array['contract','document','customer','store','created','contract_status'] loop
   if jsonb_typeof(r->key) is distinct from 'string' then raise exception 'cobra_invalid_text'; end if;
  end loop;
  if r->>'contract_status'<>'signed_approved' then raise exception 'cobra_invalid_status'; end if;
  contract=lower(btrim(r->>'contract'));
  if contract !~ '^[a-z0-9_-]{3,80}$' then raise exception 'cobra_duplicate_or_invalid_contract'; end if;
  if r->>'created' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'cobra_invalid_date'; end if;
  created=(r->>'created')::date;
  if to_char(created,'YYYY-MM-DD')<>r->>'created' or date_trunc('month',created)::date<>new.cohort_month or created>new.cutoff then raise exception 'cobra_wrong_cohort'; end if;
  if public.cobra_quality_document(r->>'document') is null or length(r->>'customer') not between 1 and 240 or length(r->>'store') not between 1 and 160 then raise exception 'cobra_invalid_identity'; end if;
  foreach key in array array['financed_cents','fee_cents','total_installments','frequency','cycled','paid','overdue'] loop
   if jsonb_typeof(r->key) is distinct from 'number' or r->>key !~ '^[0-9]{1,16}$' or (r->>key)::numeric>9007199254740991 then raise exception 'cobra_invalid_count_or_amount'; end if;
  end loop;
  financed=(r->>'financed_cents')::bigint; fee=(r->>'fee_cents')::bigint;
  total=(r->>'total_installments')::integer; cycled=(r->>'cycled')::integer;paid=(r->>'paid')::integer;overdue=(r->>'overdue')::integer;
  if financed<=0 or fee<=0 or total not between 1 and 1000 or (r->>'frequency')::integer<>15 or cycled>total or paid>total or overdue<>greatest(0,cycled-paid) or fee::numeric*total>9007199254740991 then raise exception 'cobra_invalid_installments'; end if;
  -- RLS of the source is retained. No additional access to liquidations is granted.
  matched=source_map->contract;
  if coalesce((matched->>'matches')::integer,0)<>1 then raise exception 'cobra_contract_not_uniquely_accessible'; end if;
  op=jsonb_populate_record(null::public.liquidation_operations,matched->'operation');
  if not coalesce((matched->>'approved')::boolean,false) then raise exception 'cobra_source_not_approved'; end if;
  if nullif(op.normalized_data->>'fecha','') is null then business_date=(op.operation_at at time zone 'America/Bogota')::date;
  elsif op.normalized_data->>'fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then business_date=(op.normalized_data->>'fecha')::date;
  elsif op.normalized_data->>'fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then business_date=((op.normalized_data->>'fecha')::timestamptz at time zone 'America/Bogota')::date;
  else raise exception 'cobra_source_date_invalid'; end if;
  if public.cobra_quality_document(op.cliente_documento) is distinct from public.cobra_quality_document(r->>'document')
   or public.cobra_quality_fold(op.cliente_nombre) is distinct from public.cobra_quality_fold(r->>'customer')
   or public.cobra_quality_fold(op.establishment_name) is distinct from public.cobra_quality_fold(r->>'store')
   or business_date is distinct from created or op.monto_credito*100 is distinct from financed::numeric then raise exception 'cobra_identity_or_terms_mismatch'; end if;
  expected=least(total,greatest(0,(new.cutoff-created)/15));
  due_date=case when paid>=total then null else created+(paid+1)*15 end;
  canonical_rows=array_append(canonical_rows,jsonb_build_object('operation_id',op.id,'contract',contract,'document',public.cobra_quality_document(op.cliente_documento),'customer',op.cliente_nombre,'store',op.establishment_name,'origin',op.origen_codigo,'created',created,'financed_cents',financed,'fee_cents',fee,'total_installments',total,'frequency',15,'cycled',cycled,'paid',paid,'overdue',overdue,'cycled_cents',fee*cycled,'arrears_cents',fee*overdue,'expected_cycles',expected,'calendar_mismatch',expected<>cycled,'calendar_due',due_date));
 end loop;
 canonical=to_jsonb(canonical_rows);
 select jsonb_object_agg(x->>'operation_id',true) into new.link_keys from jsonb_array_elements(canonical) x;
 if (select sum((x->>'cycled_cents')::numeric) from jsonb_array_elements(canonical) x)>9007199254740991 or (select sum((x->>'arrears_cents')::numeric) from jsonb_array_elements(canonical) x)>9007199254740991 then raise exception 'cobra_total_overflow'; end if;
 new.payload_sha256=encode(sha256(convert_to(new.source_rows::text,'UTF8')),'hex');
 new.observations=canonical;new.row_count=count_rows;new.received_by=auth.uid();new.received_at=clock_timestamp();new.schema_version=1;
 return new;
end;
$$;
revoke all on function public.cobra_krediya_prepare_cut() from public,anon,authenticated,service_role;
create trigger cobra_krediya_prepare_cut before insert on public.cobra_krediya_cuts for each row execute function public.cobra_krediya_prepare_cut();

create function public.cobra_krediya_link_cut()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.cobra_krediya_cut_operations(cut_id,operation_id)
 select new.id,(r->>'operation_id')::uuid from jsonb_array_elements(new.observations) r;
 return new;
end;
$$;
revoke all on function public.cobra_krediya_link_cut() from public,anon,authenticated,service_role;
create trigger cobra_krediya_link_cut after insert on public.cobra_krediya_cuts for each row execute function public.cobra_krediya_link_cut();

-- Read-only canonical fingerprint for crash recovery; exposes no stored source rows.
create function public.cobra_krediya_payload_digest(p_rows jsonb)
returns text language plpgsql stable security invoker set search_path='' as $$begin
 if not coalesce(public.cobra_quality_importer(),false) then raise exception 'cobra_not_authorized' using errcode='42501'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 or octet_length(p_rows::text)>8000000 then raise exception 'cobra_rows_limit'; end if;
 return encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
end$$;
revoke all on function public.cobra_krediya_payload_digest(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cobra_krediya_payload_digest(jsonb) to authenticated;

create function public.cobra_krediya_save_cut(p_request_id uuid,p_file_sha256 text,p_cohort_month date,p_cutoff date,p_source_name text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c record; wanted_hash text; saved uuid;
begin
 if not coalesce(public.cobra_quality_importer(),false) then raise exception 'cobra_not_authorized' using errcode='42501'; end if;
 if p_request_id is null or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' or p_cohort_month is null or p_cutoff is null or p_source_name is null or length(p_source_name) not between 1 and 180 or p_rows is null or jsonb_typeof(p_rows)<>'array' or octet_length(p_rows::text)>8000000 then raise exception 'cobra_invalid_request'; end if;
 wanted_hash=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 select id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,row_count,received_at into c from public.cobra_krediya_cuts where request_id=p_request_id or (file_sha256=p_file_sha256 and cohort_month=p_cohort_month and cutoff=p_cutoff) order by (request_id=p_request_id) desc,received_at limit 1;
 if c.id is null then
  insert into public.cobra_krediya_cuts(request_id,file_sha256,cohort_month,cutoff,source_name,source_rows)
  values(p_request_id,p_file_sha256,p_cohort_month,p_cutoff,p_source_name,p_rows)
  on conflict do nothing returning id into saved;
  select id,request_id,file_sha256,payload_sha256,cohort_month,cutoff,row_count,received_at into c from public.cobra_krediya_cuts where id=saved or request_id=p_request_id or (file_sha256=p_file_sha256 and cohort_month=p_cohort_month and cutoff=p_cutoff) order by (request_id=p_request_id) desc,received_at limit 1;
 end if;
 if c.id is null or c.file_sha256 is distinct from p_file_sha256 or c.cohort_month is distinct from p_cohort_month or c.cutoff is distinct from p_cutoff or c.payload_sha256 is distinct from wanted_hash then raise exception 'cobra_idempotency_conflict'; end if;
 if (select count(*) from public.cobra_krediya_cut_operations where cut_id=c.id)<>c.row_count then raise exception 'cobra_incomplete_cut'; end if;
 return jsonb_build_object('id',c.id,'request_id',c.request_id,'row_count',c.row_count,'cutoff',c.cutoff,'cohort_month',c.cohort_month,'file_sha256',c.file_sha256,'duplicate',saved is null,'status','observations_saved','official_quality',false);
end;
$$;
revoke all on function public.cobra_krediya_save_cut(uuid,text,date,date,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cobra_krediya_save_cut(uuid,text,date,date,text,jsonb) to authenticated;

create function public.cobra_krediya_immutable()
returns trigger language plpgsql security invoker set search_path='' as $$begin
 raise exception 'cobra_history_immutable' using errcode='42501';
end$$;
revoke all on function public.cobra_krediya_immutable() from public,anon,authenticated,service_role;
create trigger cobra_cuts_immutable before update or delete on public.cobra_krediya_cuts for each row execute function public.cobra_krediya_immutable();
create trigger cobra_cuts_no_truncate before truncate on public.cobra_krediya_cuts for each statement execute function public.cobra_krediya_immutable();
create trigger cobra_links_immutable before update or delete on public.cobra_krediya_cut_operations for each row execute function public.cobra_krediya_immutable();
create trigger cobra_links_no_truncate before truncate on public.cobra_krediya_cut_operations for each statement execute function public.cobra_krediya_immutable();

comment on table public.cobra_krediya_cuts is 'Immutable user-reported provider snapshots, not payment transactions, official quality certification or loan balances. File hash is provenance supplied by importer, not provider attestation.';
comment on table public.cobra_krediya_cut_operations is 'References existing liquidations only; creates neither loans nor collection obligations.';
commit;
-- REVIEW CANDIDATE. Relate a collection event to an existing liquidation, not a fabricated debt.
begin;
-- This draft only supports an exact empty-install rollback from these prerequisites.
-- If explicit INSERT column grants already exist, capture and design their restoration first.
do $$begin
 if not (select relrowsecurity from pg_class where oid='public.credit_collection_events'::regclass) then raise exception 'cobra_event_rls_required'; end if;
 if exists(select 1 from pg_policy where polrelid='public.credit_collection_events'::regclass and polcmd in ('a','*')) then raise exception 'cobra_preexisting_insert_policy_review_required'; end if;
 if not (select attnotnull from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname='obligation_id') then raise exception 'cobra_preexisting_nullable_obligation_review_required'; end if;
 if exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) x where a.attrelid='public.credit_collection_events'::regclass and a.attname in ('obligation_id','actor_type','event_type','channel','note','promise_date','promise_amount','created_by') and x.grantee='authenticated'::regrole and x.privilege_type='INSERT') then raise exception 'cobra_preexisting_column_grants_review_required'; end if;
end$$;
alter table public.credit_collection_events add column operation_id uuid references public.liquidation_operations(id) on delete restrict;
alter table public.credit_collection_events add column client_request_id uuid unique;
alter table public.credit_collection_events alter column obligation_id drop not null;
alter table public.credit_collection_events add constraint credit_collection_event_existing_reference check(obligation_id is not null or operation_id is not null);
create index credit_collection_events_operation_idx on public.credit_collection_events(operation_id,created_at desc) where operation_id is not null;

create function public.cobra_krediya_validate_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- Legacy RPC remains unchanged. New operation-based events have their own explicit checks.
 if new.operation_id is null then
  if current_user in ('anon','authenticated') then raise exception 'cobra_direct_legacy_event_denied' using errcode='42501'; end if;
  if new.client_request_id is not null then raise exception 'cobra_event_invalid_reference'; end if;
  return new;
 end if;
 if not coalesce(public.cobra_quality_operator(),false) or new.created_by is distinct from auth.uid() or new.actor_type is distinct from 'humano' then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if new.client_request_id is null or not exists(select 1 from public.cobra_krediya_cut_operations where operation_id=new.operation_id) then raise exception 'cobra_event_without_reviewed_cut'; end if;
 if new.obligation_id is not null and not exists(select 1 from public.credit_portfolio_obligations where id=new.obligation_id and operation_id=new.operation_id) then raise exception 'cobra_event_wrong_obligation'; end if;
 if new.event_type not in ('contact_attempt','contacted','note','promise') or new.event_type is null or new.channel not in ('call','whatsapp','email','platform','internal') or new.channel is null or length(btrim(coalesce(new.note,''))) not between 1 and 600 then raise exception 'cobra_event_invalid_fields'; end if;
 if new.event_type='promise' then
  if new.promise_date is null or new.promise_date<(now() at time zone 'America/Bogota')::date or new.promise_amount is null or new.promise_amount<=0 or new.promise_amount<>trunc(new.promise_amount) or new.promise_amount>90071992547409 then raise exception 'cobra_event_invalid_promise'; end if;
 elsif new.promise_date is not null or new.promise_amount is not null then raise exception 'cobra_event_unexpected_promise';
 end if;
 new.created_at=clock_timestamp();new.note=btrim(new.note);
 return new;
end;
$$;
revoke all on function public.cobra_krediya_validate_event() from public,anon,authenticated,service_role;
create trigger cobra_krediya_validate_event before insert on public.credit_collection_events for each row execute function public.cobra_krediya_validate_event();
grant insert(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by) on public.credit_collection_events to authenticated;
create policy cobra_quality_events_insert on public.credit_collection_events for insert to authenticated with check(
 (select public.cobra_quality_operator()) and created_by=(select auth.uid()) and actor_type='humano' and operation_id is not null and client_request_id is not null
 and exists(select 1 from public.cobra_krediya_cut_operations c where c.operation_id=credit_collection_events.operation_id));
create policy cobra_quality_events_read on public.credit_collection_events for select to authenticated using(
 (select public.cobra_quality_operator()) and operation_id is not null
 and exists(select 1 from public.cobra_krediya_cut_operations c where c.operation_id=credit_collection_events.operation_id));

create function public.cobra_krediya_guard_event_history()
returns trigger language plpgsql security invoker set search_path='' as $$begin
 if old.operation_id is not null or old.client_request_id is not null then raise exception 'cobra_event_history_immutable' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if new.operation_id is distinct from old.operation_id or new.client_request_id is distinct from old.client_request_id then raise exception 'cobra_event_history_immutable' using errcode='42501'; end if;
  return new;
 end if;
 return old;
end$$;
revoke all on function public.cobra_krediya_guard_event_history() from public,anon,authenticated,service_role;
create trigger cobra_krediya_guard_event_history before update or delete on public.credit_collection_events for each row execute function public.cobra_krediya_guard_event_history();
-- Unconditional: TRUNCATE bypasses row RLS, so an RLS-filtered emptiness query is insufficient.
create trigger cobra_events_no_truncate before truncate on public.credit_collection_events for each statement execute function public.cobra_krediya_immutable();

create function public.cobra_krediya_save_collection(p_request_id uuid,p_operation_id uuid,p_event_type text,p_channel text,p_note text,p_promise_date date default null,p_promise_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.credit_collection_events%rowtype; obligation uuid; saved uuid;
begin
 if not coalesce(public.cobra_quality_operator(),false) then raise exception 'cobra_event_not_authorized' using errcode='42501'; end if;
 if p_request_id is null or p_operation_id is null then raise exception 'cobra_event_invalid_reference'; end if;
 select * into e from public.credit_collection_events where client_request_id=p_request_id;
 if e.id is null then
  select id into obligation from public.credit_portfolio_obligations where operation_id=p_operation_id;
  insert into public.credit_collection_events(operation_id,client_request_id,obligation_id,actor_type,event_type,channel,note,promise_date,promise_amount,created_by)
  values(p_operation_id,p_request_id,obligation,'humano',p_event_type,p_channel,btrim(p_note),p_promise_date,p_promise_amount,auth.uid())
  on conflict(client_request_id) do nothing returning id into saved;
  select * into e from public.credit_collection_events where id=saved or client_request_id=p_request_id;
 end if;
 if e.id is null or e.created_by is distinct from auth.uid() or e.operation_id is distinct from p_operation_id or e.event_type is distinct from p_event_type or e.channel is distinct from p_channel or e.note is distinct from btrim(p_note) or e.promise_date is distinct from p_promise_date or e.promise_amount is distinct from p_promise_amount then raise exception 'cobra_event_idempotency_conflict'; end if;
 return jsonb_build_object('id',e.id,'request_id',e.client_request_id,'operation_id',e.operation_id,'obligation_id',e.obligation_id,'event_type',e.event_type,'created_at',e.created_at,'duplicate',saved is null,'status','collection_saved','payment_created',false);
end;
$$;
revoke all on function public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric) from public,anon,authenticated,service_role;
grant execute on function public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric) to authenticated;
comment on column public.credit_collection_events.operation_id is 'Collection anchor for an existing credit liquidation. Does not create or infer an outstanding balance. Existing obligation_id linkage is retained when accessible.';
commit;
create view public.creditos_cartera_operaciones
with (security_invoker=true)
as
select
  o.id,o.operation_id,o.credito_id,o.cliente_id,o.plataforma,o.external_credit_id,
  o.origen_codigo,coalesce(origen.nombre,o.origen_codigo) tienda,
  coalesce(c.nombre_completo,o.cliente_nombre_snapshot,'Cliente sin vincular') cliente_nombre,
  coalesce(c.cedula,o.cliente_documento_snapshot) cliente_documento,
  o.original_amount,o.outstanding_amount,o.ally_paid_at,o.first_due_date,o.next_due_date,
  o.status,o.pre_nova,
  case when o.pre_nova then 'pre_nova'
       when na.decision='approved' then 'approved'
       else coalesce(na.decision,'missing') end nova_status,
  na.external_decision_id nova_decision_id,na.rule_version nova_rule_version,
  coalesce((select sum(r.amount) from public.credit_repayments r where r.obligation_id=o.id and r.status='validated'),0) validated_repayments,
  (select max(e.created_at) from public.credit_collection_events e where e.obligation_id=o.id) last_collection_at,
  (select count(*) from public.credit_collection_events e where e.obligation_id=o.id and e.event_type='promise_broken') broken_promises,
  case when o.status='paid' then 'paid'
       when o.status in ('loss','refinanced') then o.status
       when exists(select 1 from public.credit_collection_events e where e.obligation_id=o.id and e.event_type='promise_broken') then 'promise_broken'
       when o.status in ('late','delinquent') then o.status
       else 'current' end credit_outcome
from public.credit_portfolio_obligations o
left join public.clientes c on c.id=o.cliente_id
left join public.origenes origen on origen.codigo=o.origen_codigo
left join public.nova_authorizations na on na.id=o.nova_authorization_id;
insert into origenes values('fiction-A','Fiction A','secret A'),('fiction-B','Fiction B','secret B');
 insert into clientes values('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','Fiction Ana','111001','secret A'),('dddddddd-dddd-4ddd-8ddd-ddddddddddd2','Fiction Luis','111002','secret B');
 insert into liquidations values('cccccccc-cccc-4ccc-8ccc-ccccccccccc1',now(),'22222222-2222-4222-8222-222222222222',now());
 insert into liquidation_operations values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','krediya',true,'fiction001','111001','Fiction Ana','Fiction A','fiction-A','2026-10-01 13:00Z','{"fecha":"2026-10-01T13:00:00Z"}',400000,'{"krediya_v2":{"provision":100}}'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','krediya',true,'fiction002','111002','Fiction Luis','Fiction B','fiction-B','2026-10-01 13:00Z','{"fecha":"2026-10-01T13:00:00Z"}',400000,'{"krediya_v2":{"provision":100}}');
 insert into credit_portfolio_obligations values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',null,'dddddddd-dddd-4ddd-8ddd-ddddddddddd1','krediya','fiction001','fiction-A','Fiction Ana','111001',400000,350000,now(),null,null,'active',true,null),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',null,'dddddddd-dddd-4ddd-8ddd-ddddddddddd2','krediya','fiction002','fiction-B','Fiction Luis','111002',400000,350000,now(),null,null,'active',true,null);
 insert into credit_repayments values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',50000,'validated','secret payment');
insert into aliados_operadores values('22222222-2222-4222-8222-222222222222','revisor',true);update perfiles set rol='gerencia' where id='22222222-2222-4222-8222-222222222222';
reset role;set role postgres;reset role;set role authenticator;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false}',false);select set_config('request.path','/rpc/cartera_operador_inicio',false);select set_config('request.method','POST',false);select set_config('request.headers','{"accept":"application/json"}',false);
select public.cobra_krediya_save_cut('99999999-9999-4999-8999-999999999999','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-10-01','2026-11-26','fiction.xlsx','[{"contract":"fiction001","document":"111001","customer":"Fiction Ana","store":"Fiction A","created":"2026-10-01","financed_cents":40000000,"fee_cents":5000000,"total_installments":12,"frequency":15,"cycled":3,"paid":1,"overdue":2,"contract_status":"signed_approved"}]'::jsonb);
reset role;set role postgres;
revoke execute on function public.rol_actual(),public.creditos_cartera_puede_leer(text),public.tiene_capacidad_aliados(text) from public,anon;grant execute on function public.rol_actual(),public.creditos_cartera_puede_leer(text),public.tiene_capacidad_aliados(text) to authenticated,service_role;
reset role;
