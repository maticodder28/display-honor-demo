/** Foto del Éxito: tipos y cálculos compartidos (sin dependencias de servidor). */

export interface FotoProducto {
  id: number;
  nombre: string;
  corto: string;
  tipo: 'Equipo' | 'Accesorio';
  orden: number;
  activo: boolean;
}

export interface FotoTienda {
  codigo: string;
  tienda: string;
  ciudad: string;
  cobertura: string;
  codigo_b2b: string | null;
  codigo_corto: string | null;
  cluster: string | null;
  merchandiser: string | null;
}

export interface FotoRespuesta {
  id: number;
  semana: string; // YYYY-MM-DD (lunes)
  tienda_codigo: string;
  pedidos: number[];
  /** Exigidos para el cluster de la tienda esa semana (prioridades). */
  requeridos: number[];
  exhibidos: number[];
  mesas: number[];
  comentario: string;
  actualizado_por: string | null;
  updated_at: string;
}

export interface FotoPrioridad {
  producto_id: number;
  cluster: string;
  numero: number;
}

/** Copia de las prioridades de una semana (la actual sigue la tabla; las pasadas quedan congeladas). */
export interface FotoSemana {
  semana: string;
  prioridades: FotoPrioridad[];
}

export const CLUSTERS = ['K', 'A', 'B', 'C'] as const;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dia = (iso: string) => new Date(iso + 'T12:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Suma días a una fecha YYYY-MM-DD. */
export const sumarDias = (f: string, n: number) => { const d = dia(f); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** Lunes de la semana de una fecha YYYY-MM-DD. */
export function lunesDe(f: string): string {
  const d = dia(f);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return iso(d);
}

/** "9-15 nov" o "29 dic - 4 ene". */
export function nombreSemana(lunes: string): string {
  const a = dia(lunes), b = dia(sumarDias(lunes, 6));
  const ma = MESES[a.getUTCMonth()], mb = MESES[b.getUTCMonth()];
  return ma === mb ? `${a.getUTCDate()}-${b.getUTCDate()} ${mb}` : `${a.getUTCDate()} ${ma} - ${b.getUTCDate()} ${mb}`;
}

/** Fecha y hora de Chile de un timestamp, como "09-11 18:20". */
export function fechaCorta(ts: string): string {
  const f = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  const z = (v: string) => v.padStart(2, '0');
  return `${z(g('day'))}-${z(g('month'))} ${z(g('hour'))}:${z(g('minute'))}`;
}

/** Fecha de Chile de un timestamp, como "09/11/2026" (formato del archivo Entel). */
export function fechaEntel(ts: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts)).replace(/-/g, '/');
}

/** Productos que forman las columnas de una semana: los pedidos en sus respuestas, o los activos si no hay ninguna. */
export function columnasSemana(productos: FotoProducto[], respuestas: FotoRespuesta[]): FotoProducto[] {
  const ids = new Set(respuestas.flatMap((r) => r.pedidos));
  const lista = ids.size ? productos.filter((p) => ids.has(p.id)) : productos.filter((p) => p.activo);
  return [...lista].sort((a, b) => a.orden - b.orden || a.id - b.id);
}

/** Base del cumplimiento: los exigidos para el cluster; si la tienda no tiene cluster, todos los pedidos. */
export const baseCumplimiento = (r: FotoRespuesta) => (r.requeridos?.length ? r.requeridos : r.pedidos);

/** Exigidos exhibidos / exigidos para el cluster de la tienda esa semana. */
export function cumplimiento(r: FotoRespuesta | undefined): number | null {
  if (!r) return null;
  const base = baseCumplimiento(r);
  if (!base.length) return null;
  const ex = new Set(r.exhibidos);
  return base.filter((id) => ex.has(id)).length / base.length;
}

/** Número de prioridad de un producto para un cluster, o null si no se exige. */
export function numeroPrioridad(prioridades: FotoPrioridad[], productoId: number, cluster: string | null): number | null {
  if (!cluster) return null;
  return prioridades.find((p) => p.producto_id === productoId && p.cluster === cluster)?.numero ?? null;
}

export const sumar = (a: number[]) => a.reduce((s, n) => s + (Number(n) || 0), 0);

/** Cobertura como la escribe el archivo Entel. */
export const coberturaEntel = (c: string) =>
  c === 'Promotor' ? 'PROMOTER' : c === 'Middle Management' ? 'MIDDLE MANAGEMENT' : c === 'Sin cobertura' ? 'NON COVERAGE' : c.toUpperCase();
