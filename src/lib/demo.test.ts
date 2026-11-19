import { describe, expect, it } from 'vitest';
import { bitacoraDemo, datosDemo, fotoDemo, historialDemo } from './demo';
import { lunesDe, sumarDias } from './foto';
import { medir } from './historial';

describe('datos de la demo', () => {
  it('son iguales en cada llamada', () => {
    expect(historialDemo()).toEqual(historialDemo());
    expect(bitacoraDemo()).toEqual(bitacoraDemo());
  });

  it('usan solo codigos de tienda ficticios', () => {
    expect(historialDemo().tiendas.every((t) => /^DM\d+$/.test(t.codigo))).toBe(true);
  });

  it('muestran a Honor mejorando entre el primer y el ultimo corte', () => {
    const h = historialDemo();
    const codigos = h.tiendas.map((t) => t.codigo);
    const primero = medir(h.cortes[0], codigos, 'exhibiciones').share!;
    const ultimo = medir(h.cortes[h.cortes.length - 1], codigos, 'exhibiciones').share!;
    expect(ultimo).toBeGreaterThan(primero);
  });

  it('entregan el corte mas reciente al dashboard', () => {
    const h = historialDemo();
    expect(datosDemo().carga.fecha_corte).toBe(h.cortes[h.cortes.length - 1].fecha);
  });

  it('referencian ejecutivos y tiendas que existen', () => {
    const b = bitacoraDemo();
    const tiendas = new Set(b.tiendas.map((t) => t.codigo));
    const ejecutivos = new Set(b.ejecutivos.map((e) => e.id));
    expect(b.acciones.every((a) => tiendas.has(a.tienda_codigo))).toBe(true);
    expect(b.acciones.every((a) => a.ejecutivo_id == null || ejecutivos.has(a.ejecutivo_id))).toBe(true);
  });

  it('tienen tiendas Entel con respuestas en la Foto del Exito', () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
    const f = fotoDemo(sumarDias(lunesDe(hoy), -7 * 25));
    expect(f.tiendas.length).toBeGreaterThanOrEqual(4);
    expect(f.respuestas.length).toBeGreaterThan(0);
  });
});
