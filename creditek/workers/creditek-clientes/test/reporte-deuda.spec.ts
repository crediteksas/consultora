import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarReporteDeuda, formatearConfirmacionesDeuda, type CorteDeuda } from '../src/reporte-deuda';
import { paginarReporte, renderizarPaginaReporte } from '../src/reportes-formato';
afterEach(() => vi.restoreAllMocks());
const contenido: CorteDeuda = { fecha: '2026-10-15', corte: '2026-10-15T20:00:00Z', diarias: [
 { usuario_id:'a',administrador:'Ana',tienda_codigo:'A',tienda:'Tolú',confirmacion:{saldo_sistema:1000,saldo_declarado:1000,diferencia:0,confirmado_at:'2026-10-15T15:00:00Z',revisado_at:null}},
 { usuario_id:'b',administrador:'Bea',tienda_codigo:'A',tienda:'Tolú',confirmacion:null},
 { usuario_id:'c',administrador:'Ceci',tienda_codigo:'C',tienda:'Chinú',confirmacion:{saldo_sistema:2000,saldo_declarado:1500,diferencia:-500,confirmado_at:'2026-10-15T16:00:00Z',revisado_at:null}},
] };
function preparar() {
 const reserva:any={fecha:contenido.fecha,token:'token',contenido,resultados:[]};
 const updates:any[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(String(input).includes('/rpc/')) return Response.json(reserva);
  const body=JSON.parse(String(init?.body)); updates.push(structuredClone(body));
  Object.assign(reserva,body);return Response.json([reserva]);
 });
 const enviar=vi.fn(async()=> 'wamid.test');
 const deps={url:'https://test',headers:{'Content-Type':'application/json'},destinatarios:[{id:'oscar',telefono:'1'},{id:'mayte',telefono:'2'}],enviar};
 return {reserva,updates,deps,enviar};
}
describe('informe de deuda a las 15:00 Colombia',()=>{
 it('distingue confirmados, diferencias y pendientes por administrador sin sumar doble una tienda',()=>{
  const texto=formatearConfirmacionesDeuda(contenido);
  expect(texto).toContain('1 confirmaron sin diferencia | 1 reportaron diferencia | 1 pendientes');
  expect(texto).toContain('CONFIRMADO | Tolú / Ana: $1.000');
  expect(texto).toContain('PENDIENTE | Tolú / Bea');
  expect(texto).toContain('diferencia $-500');
  expect(texto).toContain('Por revisar');
  expect(texto).not.toContain('TOTAL');
  const paginas=paginarReporte(texto);expect(paginas.every(p=>renderizarPaginaReporte(p).length<=1024)).toBe(true);
 });
 it('no consulta ni envía antes de las 15:00 o después de las 20:00',async()=>{
  const {deps,enviar}=preparar();
  await ejecutarReporteDeuda(deps,new Date('2026-10-15T19:59:59Z'));
  await ejecutarReporteDeuda(deps,new Date('2026-10-16T01:00:00Z'));
  expect(fetch).not.toHaveBeenCalled();expect(enviar).not.toHaveBeenCalled();
 });
 it('a las 15:00 envía a ambos, persiste cada entrega y no repite aceptadas',async()=>{
  const {deps,enviar,updates}=preparar();
  await ejecutarReporteDeuda(deps,new Date('2026-10-15T20:00:00Z'));
  const n=enviar.mock.calls.length;expect(n).toBeGreaterThanOrEqual(2);
  expect(updates.at(-1).status).toBe('sent');
  await ejecutarReporteDeuda(deps,new Date('2026-10-15T20:05:00Z'));
  expect(enviar).toHaveBeenCalledTimes(n);
 });
 it('retoma solo destinatarios pendientes tras rechazo explícito de Meta',async()=>{
  const {deps,enviar,reserva}=preparar();
  enviar.mockRejectedValueOnce(new Error('meta_template_rejected:template:429'));
  await expect(ejecutarReporteDeuda(deps,new Date('2026-10-15T20:00:00Z'))).rejects.toThrow('meta_template_rejected');
  expect(reserva.status).toBe('error');expect(reserva.resultados).toHaveLength(0);
  await ejecutarReporteDeuda(deps,new Date('2026-10-15T20:05:00Z'));
  expect(reserva.status).toBe('sent');
 });
 it('un timeout incierto no provoca reenvío automático',async()=>{
  const {deps,enviar,reserva}=preparar();enviar.mockRejectedValueOnce(new Error('network timeout'));
  await expect(ejecutarReporteDeuda(deps,new Date('2026-10-15T20:00:00Z'))).rejects.toThrow('timeout');
  expect(reserva.status).toBe('uncertain');
  await expect(ejecutarReporteDeuda(deps,new Date('2026-10-15T20:05:00Z'))).rejects.toThrow('requiere_revision');
  expect(enviar).toHaveBeenCalledTimes(1);
 });
 it('funciona los domingos y admite cero confirmaciones sin inventarlas',async()=>{
  const {deps,reserva}=preparar();reserva.contenido={...contenido,diarias:contenido.diarias.map(f=>({...f,confirmacion:null}))};
  await ejecutarReporteDeuda(deps,new Date('2026-10-18T20:00:00Z'));
  expect(reserva.status).toBe('sent');expect(formatearConfirmacionesDeuda(reserva.contenido)).toContain('3 pendientes');
 });
});
