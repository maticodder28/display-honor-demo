import { describe, expect, it } from 'vitest';
import {
  agruparPorTienda, buscarDadoDeBaja, confirmacionNecesaria, estadoVisita, puesto, rankingEjecutivos, resumenMes, validarAccion,
  type BitAccion, type BitEjecutivo, type NuevaAccion,
} from './bitacora';

let id = 0;
const accion = (p: Partial<BitAccion>): BitAccion => ({
  id: ++id, tienda_codigo: 'DM101', fecha: '2026-11-10', tipo: 'visita', ejecutivo_id: null, detalle: 'x',
  unidades: null, costo: null, pendiente: false, hecho: false, creado_por: 'u1', created_at: '', ...p,
});
const ej = (i: number, nombre: string, activo = true): BitEjecutivo => ({ id: i, tienda_codigo: 'DM101', nombre, activo });
const nueva = (p: Partial<NuevaAccion>): NuevaAccion => ({
  tienda_codigo: 'DM101', fecha: '2026-11-10', tipo: 'visita', ejecutivo_id: null, detalle: 'revisé la exhibición', unidades: null, costo: null, pendiente: false, ...p,
});

describe('estado de visita', () => {
  it('usa la acción más reciente: al día, aviso o abandonada', () => {
    const hoy = '2026-11-19';
    expect(estadoVisita([], hoy).cls).toBe('bad');
    expect(estadoVisita([accion({ fecha: '2026-11-15' })], hoy)).toMatchObject({ cls: 'ok', dias: 4 });
    expect(estadoVisita([accion({ fecha: '2026-11-07' })], hoy)).toMatchObject({ cls: 'warn', dias: 12 });
    expect(estadoVisita([accion({ fecha: '2026-10-01' })], hoy).cls).toBe('bad');
  });
  it('agrupa por tienda de la más nueva a la más antigua', () => {
    const m = agruparPorTienda([accion({ fecha: '2026-11-01' }), accion({ fecha: '2026-11-09' })]);
    expect(m.get('DM101')!.map((a) => a.fecha)).toEqual(['2026-11-09', '2026-11-01']);
  });
});

describe('resumen del mes', () => {
  it('cuenta una visita por tienda y día, y suma ventas e incentivos del mes', () => {
    const r = resumenMes([
      accion({ fecha: '2026-11-10' }), accion({ fecha: '2026-11-10', tipo: 'venta', unidades: 3 }),
      accion({ fecha: '2026-11-11', tipo: 'incentivo', costo: 15000 }), accion({ fecha: '2026-10-30', tipo: 'venta', unidades: 9 }),
    ], '2026-11');
    expect(r).toEqual({ visitas: 2, equipos: 3, gasto: 15000, incentivos: 1 });
  });
});

describe('ranking de ejecutivos', () => {
  it('ordena por equipos, asigna nivel y mantiene a los de baja que vendieron en el mes', () => {
    const acciones = [
      accion({ tipo: 'venta', ejecutivo_id: 1, unidades: 6 }), accion({ tipo: 'venta', ejecutivo_id: 2, unidades: 3 }),
      accion({ tipo: 'venta', ejecutivo_id: 3, unidades: 1 }),
    ];
    const { filas, total } = rankingEjecutivos(acciones, [ej(1, 'Ana'), ej(2, 'Beto'), ej(3, 'Caro', false), ej(4, 'Dani', false)], '2026-11');
    expect(total).toBe(10);
    expect(filas.map((f) => [f.e.nombre, f.nivel])).toEqual([['Ana', 'Alto'], ['Beto', 'Medio'], ['Caro', 'Bajo']]);
  });
  it('los empates comparten puesto', () => {
    const { filas } = rankingEjecutivos(
      [accion({ tipo: 'venta', ejecutivo_id: 1, unidades: 2 }), accion({ tipo: 'venta', ejecutivo_id: 2, unidades: 2 })],
      [ej(1, 'Ana'), ej(2, 'Beto'), ej(3, 'Caro')], '2026-11',
    );
    expect(filas.map((_, i) => puesto(filas, i))).toEqual(['1', '=', '-']);
  });
});

describe('validaciones', () => {
  const hoy = '2026-11-19';
  it('acepta una visita con detalle y rechaza fechas futuras', () => {
    expect(validarAccion(nueva({}), hoy)).toBeNull();
    expect(validarAccion(nueva({ fecha: '2026-11-20' }), hoy)).toMatch(/futura/);
    expect(validarAccion(nueva({ detalle: '  ' }), hoy)).toMatch(/detalle/);
  });
  it('una venta necesita ejecutivo y equipos; un incentivo, costo (puede ser 0)', () => {
    expect(validarAccion(nueva({ tipo: 'venta', detalle: '' }), hoy)).toMatch(/ejecutivo/);
    expect(validarAccion(nueva({ tipo: 'venta', ejecutivo_id: 1, unidades: 0 }), hoy)).toMatch(/equipos/);
    expect(validarAccion(nueva({ tipo: 'venta', ejecutivo_id: 1, unidades: 2, detalle: '' }), hoy)).toBeNull();
    expect(validarAccion(nueva({ tipo: 'incentivo', costo: null }), hoy)).toMatch(/costo/);
    expect(validarAccion(nueva({ tipo: 'incentivo', costo: 0 }), hoy)).toBeNull();
  });
  it('pide confirmar montos raros', () => {
    expect(confirmacionNecesaria(nueva({ tipo: 'venta', unidades: 80 }))).toEqual({ tipo: 'unidades', valor: 80 });
    expect(confirmacionNecesaria(nueva({ tipo: 'incentivo', costo: 50000 }))).toBeNull();
  });
  it('encuentra al dado de baja sin importar mayúsculas ni espacios', () => {
    expect(buscarDadoDeBaja([ej(1, 'Ana Pérez', false)], '  ana pérez ')?.id).toBe(1);
    expect(buscarDadoDeBaja([ej(1, 'Ana Pérez', true)], 'Ana Pérez')).toBeUndefined();
  });
});
