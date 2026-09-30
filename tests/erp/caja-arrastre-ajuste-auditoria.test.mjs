import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('un ajuste de auditoría incluido en el cierre no se suma otra vez al abrir', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.caja_diaria(
        id bigint generated always as identity primary key,
        tienda_codigo text not null,
        fecha date not null,
        estado text not null,
        apertura numeric not null,
        efectivo_esperado numeric not null,
        efectivo_contado numeric not null,
        arrastre_movimientos_incorporado numeric not null default 0
      );
      create table public.caja_ciclo_config(id boolean primary key, fecha_inicio date not null);
      insert into public.caja_ciclo_config values(true,'2026-09-21');
      create table public.movimientos_caja_tienda(tienda_codigo text,fecha date,tipo text,monto numeric);
      create function public.caja_componentes_rango(p_tienda text,p_desde date,p_hasta date)
      returns jsonb language sql stable as $$
        select jsonb_build_object('neto',
          coalesce(sum(case when tipo in ('ajuste_auditoria_entrada','otro_ingreso') then monto
                            when tipo='ajuste_auditoria_salida' then -monto else 0 end),0))
        from public.movimientos_caja_tienda
        where tienda_codigo=p_tienda and fecha between p_desde and p_hasta
      $$;
      insert into public.movimientos_caja_tienda values('CK-02','2026-09-24','ajuste_auditoria_entrada',447186);
      insert into public.caja_diaria(tienda_codigo,fecha,estado,apertura,efectivo_esperado,efectivo_contado)
        values('CK-02','2026-09-24','cerrada',1333864,1781050,1781050);
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20260925150100_caja_arrastre_cierres_incluye_ajustes_auditoria.sql',import.meta.url),'utf8'));
    const calcular = async () => (await db.query("select public.caja_calcular_interno('CK-02','2026-09-25') as c")).rows[0].c;

    assert.equal((await calcular()).apertura,1781050);
    assert.equal((await calcular()).ajuste_arrastre_movimientos,0);

    // Un movimiento registrado después del cierre sí debe entrar una sola vez.
    await db.query("insert into public.movimientos_caja_tienda values('CK-02','2026-09-24','otro_ingreso',20000)");
    assert.equal((await calcular()).apertura,1801050);
    assert.equal((await calcular()).ajuste_arrastre_movimientos,20000);
  } finally {
    await db.close();
  }
});
