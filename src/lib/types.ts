/** Métricas que se registran: cada una es una hoja del Excel y se guarda tal cual en la base. */
export const METRICAS_DATOS = [
  ['exhibiciones', 'Exhibiciones'],
  ['muebles_dc', 'Muebles DC'],
  ['muebles_dz', 'Display Zone'],
  ['promotores', 'Promotores'],
] as const;

export type MetricaDato = (typeof METRICAS_DATOS)[number][0];

/** Métricas que calcula el dashboard: las registradas más Muebles (DC + Display Zone). */
export const METRICAS = [
  ['exhibiciones', 'Exhibiciones'],
  ['muebles', 'Muebles'],
  ['muebles_dc', 'Muebles DC'],
  ['muebles_dz', 'Display Zone'],
  ['promotores', 'Promotores'],
] as const;

export type Metrica = (typeof METRICAS)[number][0];

/** Las tres del selector principal y de las tarjetas de resumen. */
export const METRICAS_PRINCIPALES = [
  ['exhibiciones', 'Exhibiciones'],
  ['muebles', 'Muebles'],
  ['promotores', 'Promotores'],
] as const;

/** Detalle de Muebles: total y sus dos categorías. */
export const SUB_MUEBLES = [
  ['muebles', 'Total'],
  ['muebles_dc', 'DC'],
  ['muebles_dz', 'Display Zone'],
] as const;

export const esMueble = (m: Metrica) => m === 'muebles' || m === 'muebles_dc' || m === 'muebles_dz';

export const UNIDAD: Record<Metrica, string> = {
  exhibiciones: 'equipos',
  muebles: 'muebles',
  muebles_dc: 'muebles DC',
  muebles_dz: 'muebles Display Zone',
  promotores: 'promotores',
};

export const COBERTURAS = [
  ['Todas', 'Todas'],
  ['Promotor', 'Promotor'],
  ['Middle Management', 'Middle Mgmt'],
  ['Sin cobertura', 'Sin cobertura'],
] as const;

export type Cobertura = 'Promotor' | 'Middle Management' | 'Sin cobertura' | 'Cerrada';

export interface Tienda {
  codigo: string;
  tienda: string;
  cliente: string;
  ciudad: string;
  region?: string | null;
  cobertura: Cobertura;
}

export interface FilaMetrica {
  fecha: string | null;
  /** Un valor por marca, en el mismo orden que `marcas`. */
  v: number[];
}

/** Datos de una carga, en el formato que usan el dashboard y el lector de Excel. */
export interface DatosCarga {
  marcas: string[];
  tiendas: Tienda[];
  metricas: Record<MetricaDato, Record<string, FilaMetrica>>;
}

export const metricasVacias = (): DatosCarga['metricas'] => ({ exhibiciones: {}, muebles_dc: {}, muebles_dz: {}, promotores: {} });

export interface CargaInfo {
  id: number;
  archivo: string | null;
  created_at: string;
  fecha_corte?: string;
}

export const metricaNombre = (m: Metrica) => METRICAS.find((x) => x[0] === m)![1];
