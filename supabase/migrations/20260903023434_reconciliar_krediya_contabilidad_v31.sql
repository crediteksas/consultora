-- KORA v3.1: conciliación contable del histórico inicial Krediya.
-- Los acumulados se reconstruyen desde cada crédito y nunca desde las celdas
-- manuales de RESUMEN, porque el archivo del 24–30 de agosto contiene un
-- acumulado que no reconcilia con sus tres semanas fuente.
alter table public.creditos_historicos_plataforma
  add column if not exists gasto_financiero_historico numeric(16,2),
  add column if not exists gasto_operativo_referencia_historico numeric(16,2),
  add column if not exists provision_historica numeric(16,2),
  add column if not exists utilidad_final_historica numeric(16,2);

comment on column public.creditos_historicos_plataforma.gasto_financiero_historico is
  'Costo financiero reconstruido por crédito. Krediya histórico: 0,4% del valor financiado recibido.';
comment on column public.creditos_historicos_plataforma.gasto_operativo_referencia_historico is
  'Referencia operativa informativa del archivo; no se descuenta otra vez de la utilidad final.';
comment on column public.creditos_historicos_plataforma.provision_historica is
  'Provisión de negocio calculada sobre la utilidad bruta conciliada.';
comment on column public.creditos_historicos_plataforma.utilidad_final_historica is
  'Utilidad después de gasto financiero y provisión, reconstruida desde filas fuente.';

with fuente(codigo,pagamos,pago_aliado,comision,utilidad_archivo) as (values
 ('coqhd6n',388875::numeric,302475::numeric,30000::numeric,157125::numeric),
 ('coql0sx',369600,322800,30000,108400),
 ('coaa2gi',484800,414650,30000,186700),
 ('cosubmr',484500,309525,30000,185400),
 ('coiqiu4',620400,539912,30000,154485),
 ('coaigh4',528000,486750,30000,267000),
 ('couoli7',660000,487500,30000,172500),
 ('co9m8ge',484500,379515,30000,185400),
 ('co9xeth',443625,340125,30000,43875),
 ('cof1rbm',528000,280500,30000,267000),
 ('copdczw',459000,297000,30000,321000),
 ('coj9vtd',1038000,817220,30000,35900),
 ('covgkaf',459000,256500,30000,321000),
 ('cob6uk5',890000,770100,30000,279000),
 ('co4lszr',484500,344520,30000,185400),
 ('coinxqu',913200,700700,30000,119300),
 ('coekqus',439875,385875,30000,70125),
 ('coaf20k',660000,573750,30000,172500),
 ('coodght',912000,651000,30000,102000),
 ('copq3xo',660000,536250,30000,135000),
 ('couqudf',484800,344500,30000,186700),
 ('coi3zbw',660000,487500,30000,172500)
), calculo as (
 select h.id,f.*,round(h.monto_credito*0.004,2) gasto_financiero,
   round(f.utilidad_archivo-h.monto_credito*0.004,2) utilidad_bruta,
   round((f.utilidad_archivo-h.monto_credito*0.004)*0.28,2) provision,
   round((f.utilidad_archivo-h.monto_credito*0.004)*0.72,2) utilidad_final
 from fuente f join public.creditos_historicos_plataforma h
   on h.plataforma='krediya' and h.codigo_credito=f.codigo
 where h.historico_inicial is true and h.tipo_establecimiento='aliado'
)
update public.creditos_historicos_plataforma h set
  pagamos_historico=c.pagamos,
  pago_neto_historico=c.pago_aliado,
  bonos_historicos=c.comision,
  utilidad_antes_bonos_historica=c.utilidad_bruta,
  gasto_financiero_historico=c.gasto_financiero,
  gasto_operativo_referencia_historico=20000,
  provision_historica=c.provision,
  utilidad_final_historica=c.utilidad_final,
  utilidad_neta_historica=c.utilidad_final,
  datos_origen=h.datos_origen||jsonb_build_object(
    'pagamos',c.pagamos,'pago_aliado',c.pago_aliado,'comision',c.comision,
    'utilidad_archivo',c.utilidad_archivo,'gasto_financiero',c.gasto_financiero,
    'provision',c.provision,'utilidad_final',c.utilidad_final,
    'fuente_conciliacion','3_archivos_TER_gmail_2026-09-02'),
  politica_historica_snapshot=h.politica_historica_snapshot||jsonb_build_object(
    'version','kora_3_1','tasa_gasto_financiero',0.004,'tasa_provision',0.28,
    'gasto_operativo_referencia_por_credito',20000,
    'formula','utilidad_final=(utilidad_archivo-valor_financiado*0.004)*0.72',
    'conciliada_at',now()),
  actualizado_at=now()
from calculo c where h.id=c.id;

do $$
declare v record;
begin
 select count(*) creditos,round(sum(monto_credito),2) recibido,
   round(sum(gasto_financiero_historico),2) financiero,
   round(sum(bonos_historicos),2) comisiones,
   round(sum(pago_neto_historico),2) pago_aliados,
   round(sum(utilidad_antes_bonos_historica),2) utilidad_bruta,
   round(sum(gasto_operativo_referencia_historico),2) gasto_operativo_referencia,
   round(sum(provision_historica),2) provision,
   round(sum(utilidad_final_historica),2) utilidad_final into v
 from public.creditos_historicos_plataforma
 where plataforma='krediya' and historico_inicial is true and tipo_establecimiento='aliado';
 if v.creditos<>22 or v.recibido<>14516977.00 or v.financiero<>58067.91
    or v.comisiones<>660000.00 or v.pago_aliados<>10028667.00
    or v.utilidad_bruta<>3770242.09 or v.gasto_operativo_referencia<>440000.00
    or v.provision<>1055667.81 or v.utilidad_final<>2714574.29 then
   raise exception 'Conciliación Krediya inválida: %',row_to_json(v);
 end if;
end $$;
