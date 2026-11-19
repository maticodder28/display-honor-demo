import { describe, expect, it } from 'vitest';
import { TODAS, clave, compute, estadoPuesto, lider } from './compute';
import { metricasVacias, type DatosCarga, type Tienda } from './types';

const marcas = ['Honor', 'Samsung', 'Apple'];

const tienda = (codigo: string, extra: Partial<Tienda> = {}): Tienda => ({
  codigo, tienda: `Tienda ${codigo}`, cliente: 'Entel', ciudad: 'La Serena', cobertura: 'Promotor', ...extra,
});

function datos(): DatosCarga {
  const metricas = metricasVacias();
  metricas.exhibiciones = {
    T1: { fecha: '2026-11-10', v: [10, 20, 10] },
    T2: { fecha: '2026-11-12', v: [5, 5, 0] },
    // Tienda cerrada: no debe contar.
    T3: { fecha: '2026-11-12', v: [0, 100, 0] },
  };
  metricas.muebles_dc = { T1: { fecha: '2026-11-10', v: [1, 1, 0] } };
  metricas.muebles_dz = { T1: { fecha: '2026-11-10', v: [1, 0, 0] }, T2: { fecha: '2026-11-12', v: [0, 1, 0] } };
  return {
    marcas,
    tiendas: [tienda('T1'), tienda('T2', { ciudad: 'Coquimbo', cobertura: 'Middle Management' }), tienda('T3', { cobertura: 'Cerrada' })],
    metricas,
  };
}

const share = (M: ReturnType<typeof compute>, k: string) => M.byKey.get(k)?.share;

describe('compute', () => {
  it('calcula el share de Honor sobre el total de todas las marcas', () => {
    const M = compute(datos());
    // (10 + 5) / (40 + 10)
    expect(share(M, clave(TODAS, TODAS, TODAS, 'exhibiciones') + '|Honor')).toBeCloseTo(15 / 50);
  });

  it('excluye las tiendas cerradas', () => {
    const M = compute(datos());
    expect(M.tiendas.map((t) => t.codigo)).toEqual(['T1', 'T2']);
    expect(M.byKey.get(clave(TODAS, TODAS, TODAS, 'exhibiciones') + '|Samsung')?.valor).toBe(25);
  });

  it('agrupa por cobertura, cliente y ciudad', () => {
    const M = compute(datos());
    expect(share(M, clave('Middle Management', TODAS, TODAS, 'exhibiciones') + '|Honor')).toBeCloseTo(0.5);
    expect(share(M, clave(TODAS, TODAS, 'La Serena', 'exhibiciones') + '|Honor')).toBeCloseTo(0.25);
  });

  it('suma Muebles DC y Display Zone en Muebles', () => {
    const M = compute(datos());
    const g = clave(TODAS, TODAS, TODAS, 'muebles');
    expect(M.byKey.get(g + '|Honor')?.valor).toBe(2);
    expect(M.byKey.get(g + '|Honor')?.total).toBe(4);
  });

  it('da el mismo puesto a las marcas empatadas', () => {
    const M = compute(datos());
    // T2 (Coquimbo): Honor 5 y Samsung 5 empatan en el primer lugar.
    const g = clave(TODAS, TODAS, 'Coquimbo', 'exhibiciones');
    const honor = M.byKey.get(g + '|Honor')!;
    expect(honor.puesto).toBe(1);
    expect(honor.empate).toBe(true);
    // En un empate con Honor, el lider que se muestra es la otra marca.
    expect(lider(M, g)?.marca).toBe('Samsung');
  });

  it('cuenta cuantas tiendas tienen levantamiento por metrica', () => {
    const M = compute(datos());
    expect(M.cobKey.get(clave(TODAS, TODAS, TODAS, 'exhibiciones'))).toEqual({ con: 2, tiendas: 2 });
    expect(M.cobKey.get(clave(TODAS, TODAS, TODAS, 'promotores'))).toEqual({ con: 0, tiendas: 2 });
  });

  it('arma el detalle por tienda con la marca lider', () => {
    const M = compute(datos());
    const t1 = M.detalle.find((d) => d.codigo === 'T1')!;
    expect(t1.exh_share).toBeCloseTo(0.25);
    expect(t1.lider).toBe('Samsung');
    expect(t1.pro_share).toBeNull();
    expect(M.detalle.find((d) => d.codigo === 'T2')!.lider).toBe('Honor / Samsung');
    expect(M.corte).toBe('2026-11-12');
  });
});

describe('estadoPuesto', () => {
  it('clasifica el puesto en ok, warn o bad', () => {
    expect([1, 2, 3, 4, null].map(estadoPuesto)).toEqual(['ok', 'warn', 'warn', 'bad', 'bad']);
  });
});
