import { paginarReporte, type PaginaReporte } from './reportes-formato';

type Confirmacion = { saldo_sistema: number; saldo_declarado: number; diferencia: number; confirmado_at: string; revisado_at: string | null };
type Fila = { usuario_id: string; administrador: string; tienda_codigo: string | null; tienda: string; confirmacion: Confirmacion | null };
export type CorteDeuda = { fecha: string; corte: string; diarias: Fila[] };
type Entrega = { destinatario: string; pagina: number; estado: 'sending' | 'sent'; meta_message_id?: string };
type Reserva = { fecha: string; token: string; contenido: CorteDeuda; resultados: Entrega[] };
type Dependencias = {
 url: string; headers: HeadersInit;
 destinatarios: readonly { id: string; telefono: string }[];
 enviar: (telefono: string, pagina: PaginaReporte) => Promise<string>;
};
const moneda = (n: number) => '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(n));
const limpio = (s: string) => String(s || '').replace(/[\r\n\t*_~`]/g, ' ').replace(/\s+/g, ' ').trim();
const hora = (s: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s));

export function formatearConfirmacionesDeuda(corte: CorteDeuda): string {
 const filas = corte.diarias;
 const confirmados = filas.filter(f => f.confirmacion && Number(f.confirmacion.diferencia) === 0).length;
 const diferencias = filas.filter(f => f.confirmacion && Number(f.confirmacion.diferencia) !== 0).length;
 const pendientes = filas.length - confirmados - diferencias;
 return [
  `DEUDA CON CREDITEK | ${corte.fecha} | Corte 3:00 p. m. Colombia`,
  `Administradores: ${confirmados} confirmaron sin diferencia | ${diferencias} reportaron diferencia | ${pendientes} pendientes`,
  ...filas.map(f => {
   const nombre = `${limpio(f.tienda)} / ${limpio(f.administrador)}`;
   const c = f.confirmacion;
   if (!c) return `PENDIENTE | ${nombre}`;
   if (Number(c.diferencia) === 0) return `CONFIRMADO | ${nombre}: ${moneda(c.saldo_declarado)} (${hora(c.confirmado_at)})`;
   return `DIFERENCIA | ${nombre}: KORA ${moneda(c.saldo_sistema)}, declara ${moneda(c.saldo_declarado)}, diferencia ${moneda(c.diferencia)} | ${c.revisado_at ? 'Revisada' : 'Por revisar'}`;
  }),
  'Saldos al confirmar; no se suman entre administradores de una misma tienda. Detalle: KORA > Administración > Confirmaciones de deuda.',
 ].join('\n');
}

/** Corte y reserva propios: una falla aquí no bloquea los informes de cierre. */
export async function ejecutarReporteDeuda(d: Dependencias, ahora = new Date()): Promise<void> {
 const hh = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', hourCycle: 'h23' }).format(ahora));
 if (hh < 15 || hh >= 20) return;
 const r = await fetch(`${d.url}/rest/v1/rpc/reservar_reporte_deuda`, { method: 'POST', headers: d.headers, body: '{}' });
 if (!r.ok) throw new Error(`deuda_reserva:${r.status}`);
 const reserva = await r.json() as Reserva | null;
 if (!reserva) return;
 const resultados = reserva.resultados || [];
 const guardar = async (data: Record<string, unknown>) => {
  const res = await fetch(`${d.url}/rest/v1/reportes_deuda_enviados?fecha=eq.${reserva.fecha}&token=eq.${reserva.token}&status=eq.sending`, {
   method: 'PATCH', headers: { ...d.headers, Prefer: 'return=representation' }, body: JSON.stringify(data),
  });
  if (!res.ok || !(await res.json() as unknown[]).length) throw new Error('deuda_estado_no_guardado');
 };
 let envioEnCurso = false;
 try {
  const paginas = paginarReporte(formatearConfirmacionesDeuda(reserva.contenido));
  for (const dest of d.destinatarios) {
   for (const [indice, pagina] of paginas.entries()) {
    const anterior = resultados.find(e => e.destinatario === dest.id && e.pagina === indice);
    if (anterior?.estado === 'sent') continue;
    if (anterior) { envioEnCurso = true; throw new Error('deuda_entrega_incierta_requiere_revision'); }
    const entrega: Entrega = { destinatario: dest.id, pagina: indice, estado: 'sending' };
    resultados.push(entrega);
    await guardar({ resultados });
    envioEnCurso = true;
    let id: string;
    try { id = await d.enviar(dest.telefono, pagina); }
    catch (e) {
     // Una respuesta HTTP explícita de rechazo es reintentable; un timeout no confirma si Meta recibió.
     if (e instanceof Error && e.message.startsWith('meta_template_rejected:')) {
      resultados.pop(); envioEnCurso = false;
     }
     throw e;
    }
    entrega.estado = 'sent'; entrega.meta_message_id = id;
    await guardar({ resultados });
    envioEnCurso = false;
   }
  }
  await guardar({ status: 'sent', resultados, completed_at: new Date().toISOString(), last_error: null });
 } catch (e) {
  await guardar({ status: envioEnCurso ? 'uncertain' : 'error', resultados, last_error: e instanceof Error ? e.message.slice(0,240) : 'error' });
  throw e;
 }
}
