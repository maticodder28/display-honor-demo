import type { DatosCarga, Metrica, MetricaDato, Tienda } from './types';

/**
 * Un corte es una carga del Excel con su fecha: la foto completa de las tiendas en ese momento.
 * Las tiendas se comparten entre cortes (van aparte) para no repetirlas.
 */
export interface Corte {
  id: number;
  fecha: string; // YYYY-MM-DD
  archivo: string | null;
  created_at: string;
  por: string | null;
  marcas: string[];
  metricas: DatosCarga['metricas'];
}

export interface Historial {
  tiendas: Tienda[];
  /** Del más antiguo al más reciente. */
  cortes: Corte[];
}

export interface Medida {
  porMarca: Map<string, number>;
  total: number;
  honor: number;
  share: number | null;
  /** Puesto de Honor (1 = lidera; empates comparten puesto). null sin unidades. */
  puesto: number | null;
  /** Tiendas con levantamiento de esa métrica. */
  medidas: number;
}

/** Unidades por marca de una tienda en un corte, o null si esa tienda no tiene levantamiento de la métrica. */
export function fila(c: Corte, codigo: string, m: Metrica): Map<string, number> | null {
  const partes: MetricaDato[] = m === 'muebles' ? ['muebles_dc', 'muebles_dz'] : [m];
  const filas = partes.map((p) => c.metricas[p]?.[codigo]);
  if (filas.every((f) => !f)) return null;
  const out = new Map<string, number>();
  c.marcas.forEach((b, i) => out.set(b, filas.reduce((s, f) => s + (f?.v[i] ?? 0), 0)));
  return out;
}

function resumir(porMarca: Map<string, number>, medidas: number): Medida {
  let total = 0;
  porMarca.forEach((v) => { total += v; });
  const honor = porMarca.get('Honor') ?? 0;
  let puesto: number | null = null;
  if (total) {
    puesto = 1;
    porMarca.forEach((v, b) => { if (b !== 'Honor' && v > honor) puesto!++; });
  }
  return { porMarca, total, honor, share: total ? honor / total : null, puesto, medidas };
}

/** Suma de las tiendas indicadas que tienen levantamiento en ese corte. */
export function medir(c: Corte, codigos: string[], m: Metrica): Medida {
  const porMarca = new Map<string, number>();
  let medidas = 0;
  for (const cod of codigos) {
    const f = fila(c, cod, m);
    if (!f) continue;
    medidas++;
    f.forEach((v, b) => porMarca.set(b, (porMarca.get(b) ?? 0) + v));
  }
  return resumir(porMarca, medidas);
}

export function medirTienda(c: Corte, codigo: string, m: Metrica): Medida | null {
  const f = fila(c, codigo, m);
  return f ? resumir(f, 1) : null;
}

/** Diferencia de share en puntos (0.03 = +3 pp), o null si falta alguno. */
export const cambio = (a: number | null, b: number | null) => (a == null || b == null ? null : b - a);

export type Tendencia = 'mejor' | 'peor' | 'igual' | 'sindato';
/** Se redondea a 0,1 pp para no llamar "mejora" a un decimal de ruido. */
export function tendencia(d: number | null): Tendencia {
  if (d == null) return 'sindato';
  const r = Math.round(d * 1000);
  return r > 0 ? 'mejor' : r < 0 ? 'peor' : 'igual';
}

export interface FilaComparacion {
  tienda: Tienda;
  a: Medida | null;
  b: Medida | null;
  d: number | null;
  t: Tendencia;
}

export function comparar(A: Corte, B: Corte, tiendas: Tienda[], m: Metrica): FilaComparacion[] {
  return tiendas.map((t) => {
    const a = medirTienda(A, t.codigo, m);
    const b = medirTienda(B, t.codigo, m);
    const d = cambio(a?.share ?? null, b?.share ?? null);
    return { tienda: t, a, b, d, t: tendencia(d) };
  });
}

/** Datos de un corte en el formato del Excel de plantilla. */
export const datosDeCorte = (c: Corte, tiendas: Tienda[]): DatosCarga => ({ marcas: c.marcas, tiendas, metricas: c.metricas });
