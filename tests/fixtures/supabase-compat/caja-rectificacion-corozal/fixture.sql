create role anon; create role authenticated; create role service_role;
      create schema auth; create schema kora_private;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table perfiles(id uuid primary key, activo boolean, rol text);
      insert into perfiles values ('d1782db6-bacc-4caf-af6f-ce1b8d1c0391',true,'auditoria'),('6de0ad26-64af-4966-8cd9-d468880af627',true,'gerencia');
      create table caja_diaria(id uuid default gen_random_uuid() primary key,
        tienda_codigo text, fecha date, estado text, apertura numeric, efectivo_esperado numeric,
        efectivo_contado numeric, arrastre_movimientos_incorporado numeric);
      create table caja_cortes(tienda_codigo text, fecha date, estado text, efectivo_contado numeric);
      create table gastos(tienda_codigo text, fecha date, estado text);
      create table caja_ciclo_config(id boolean, fecha_inicio date);
      insert into caja_ciclo_config values(true,'2026-09-21');
      create table flujo(tienda text, fecha date, neto numeric);
      create function caja_componentes_rango(text,date,date) returns jsonb language sql stable
        as $$ select jsonb_build_object('neto',coalesce(sum(neto),0)) from flujo
          where tienda=$1 and fecha between $2 and $3 $$;
      insert into caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_esperado,efectivo_contado,arrastre_movimientos_incorporado)
        values ('CK-02','2026-11-08','cerrada',3003360,3360360,3360360,0),
          ('OTRA','2026-11-08','cerrada',1000000,1000000,1000000,0);
      insert into flujo values ('CK-02','2026-11-08',357000),('CK-02','2026-11-09',560000);
      insert into caja_cortes values ('CK-02','2026-11-08','validada',3360360);
