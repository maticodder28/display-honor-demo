import { describe, expect, it } from 'vitest';
import { cambio, comparar, medir, tendencia, type Corte } from './historial';
import { metricasVacias, type Tienda } from './types';

const marcas = ['Honor', 'Samsung'];
const tiendas: Tienda[] = [
  { codigo: 'T1', tienda: 'Uno', cliente: 'Entel', ciudad: 'La Serena', cobertura: 'Promotor' },
  { codigo: 'T2', tienda: 'Dos', cliente: 'WOM', ciudad: 'Ovalle', cobertura: 'Promotor' },
];

function corte(id: number, t1: number[], t2?: number[]): Corte {
  const metricas = metricasVacias();
  metricas.exhibiciones.T1 = { fecha: null, v: t1 };
  if (t2) metricas.exhibiciones.T2 = { fecha: null, v: t2 };
  return { id, fecha: `2026-11-0${id}`, archivo: null, created_at: '', por: null, marcas, metricas };
}

describe('medir', () => {
  it('suma solo las tiendas con levantamiento', () => {
    const m = medir(corte(1, [2, 8]), ['T1', 'T2'], 'exhibiciones');
    expect(m.medidas).toBe(1);
    expect(m.share).toBeCloseTo(0.2);
    expect(m.puesto).toBe(2);
  });

  it('devuelve share y puesto nulos cuando no hay unidades', () => {
    const m = medir(corte(1, [0, 0]), ['T1'], 'exhibiciones');
    expect(m.share).toBeNull();
    expect(m.puesto).toBeNull();
  });
});

describe('tendencia', () => {
  it('ignora cambios menores a 0,05 pp', () => {
    expect(tendencia(0.0004)).toBe('igual');
    expect(tendencia(0.03)).toBe('mejor');
    expect(tendencia(-0.01)).toBe('peor');
    expect(tendencia(null)).toBe('sindato');
    expect(cambio(0.2, null)).toBeNull();
  });
});

describe('comparar', () => {
  it('compara tienda por tienda entre dos cortes', () => {
    const filas = comparar(corte(1, [2, 8], [5, 5]), corte(2, [5, 5]), tiendas, 'exhibiciones');
    expect(filas[0].d).toBeCloseTo(0.3);
    expect(filas[0].t).toBe('mejor');
    // T2 no tiene levantamiento en el segundo corte.
    expect(filas[1].t).toBe('sindato');
  });
});
