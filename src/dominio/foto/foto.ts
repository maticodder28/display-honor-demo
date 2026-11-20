// Foto del Éxito: el checklist semanal de exhibición en las tiendas Entel.
// Tipos y reglas puras; la pantalla y el Excel de la semana usan estas mismas funciones.

import type { Perfil } from '../usuario';

/** Cliente cuyas tiendas entran en la Foto del Éxito. */
export const FOTO_CLIENTE = 'Entel';

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

export interface FotoDatos {
  productos: FotoProducto[];
  prioridades: FotoPrioridad[];
  /** Prioridades guardadas por semana, para el Excel y para corregir semanas pasadas. */
  semanasPrio: FotoSemana[];
  tiendas: FotoTienda[];
  respuestas: FotoRespuesta[];
  perfiles: Perfil[];
}

/** Lo que manda el formulario. Pedidos y exigidos los calcula la base con los productos y prioridades vigentes. */
export interface EnvioFoto { tienda: string; semana: string; exhibidos: number[]; mesas: number[]; comentario: string }

export type TipoProducto = 'Equipo' | 'Accesorio';
export interface DatosProducto { nombre: string; corto: string; tipo: TipoProducto }

export const CLUSTERS = ['K', 'A', 'B', 'C'] as const;

/** Semanas hacia atrás que el equipo de zona puede corregir (el promotor solo la actual). */
export const SEMANAS_CORREGIBLES = 4;
export const MAX_MESAS = 8, MAX_EQUIPOS_MESA = 200;

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

// ---------------------------------------------------------------------
// Resumen de una semana (vista del equipo)
// ---------------------------------------------------------------------
const promedio = (xs: number[]) => (xs.length ? sumar(xs) / xs.length : null);

/**
 * Indicadores de la semana: quién respondió, cumplimiento promedio (y el de la semana anterior),
 * presencia de cada producto y mesas genéricas. La presencia se mide solo en las tiendas
 * que tienen ese producto exigido; las demás no cuentan.
 */
export function resumenSemana(semana: string, productos: FotoProducto[], tiendas: FotoTienda[], respuestas: FotoRespuesta[]) {
  const deSemana = respuestas.filter((r) => r.semana === semana);
  const porTienda = new Map(deSemana.map((r) => [r.tienda_codigo, r]));
  const anterior = new Map(respuestas.filter((r) => r.semana === sumarDias(semana, -7)).map((r) => [r.tienda_codigo, r]));
  const columnas = columnasSemana(productos, deSemana);
  const respondieron = tiendas.filter((t) => porTienda.has(t.codigo));
  const faltan = tiendas.filter((t) => !porTienda.has(t.codigo));
  const conDato = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
  const presencia = columnas.map((p) => {
    const exigen = respondieron.filter((t) => porTienda.get(t.codigo)!.requeridos.includes(p.id));
    const exhiben = exigen.filter((t) => porTienda.get(t.codigo)!.exhibidos.includes(p.id));
    return { p, x: exigen.length ? exhiben.length / exigen.length : null };
  });
  const respuestasSemana = respondieron.map((t) => porTienda.get(t.codigo)!);
  return {
    deSemana, porTienda, anterior, columnas, respondieron, faltan, presencia,
    promedio: promedio(conDato(respuestasSemana.map((r) => cumplimiento(r)))),
    promedioAnterior: promedio(conDato(tiendas.map((t) => cumplimiento(anterior.get(t.codigo))))),
    peor: presencia.filter((x) => x.x != null).sort((a, b) => a.x! - b.x!)[0] ?? null,
    mesas: respuestasSemana.reduce((n, r) => n + r.mesas.length, 0),
    equiposEnMesas: respuestasSemana.reduce((n, r) => n + sumar(r.mesas), 0),
  };
}

// ---------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------
export type OrigenFormulario = 'enviada' | 'previa' | 'nueva';

/**
 * Con qué parte el formulario. Si la semana ya se envió, se corrige esa respuesta.
 * Si no, se precarga con la última semana de la tienda (solo productos que se siguen pidiendo),
 * porque de una semana a otra casi todo se mantiene y así el promotor marca solo lo que cambió.
 */
export function precargar(respuestas: FotoRespuesta[], productos: FotoProducto[], tienda: string, semana: string) {
  const enviada = respuestas.find((r) => r.semana === semana && r.tienda_codigo === tienda);
  if (enviada) return { origen: 'enviada' as OrigenFormulario, r: enviada, pedidos: enviada.pedidos, exhibidos: enviada.exhibidos, mesas: enviada.mesas, comentario: enviada.comentario };
  const activos = productos.filter((p) => p.activo).map((p) => p.id);
  const previa = respuestas.filter((r) => r.tienda_codigo === tienda && r.semana < semana).sort((a, b) => (a.semana < b.semana ? 1 : -1))[0];
  if (previa) return { origen: 'previa' as OrigenFormulario, r: previa, pedidos: activos, exhibidos: previa.exhibidos.filter((id) => activos.includes(id)), mesas: previa.mesas, comentario: '' };
  return { origen: 'nueva' as OrigenFormulario, r: null, pedidos: activos, exhibidos: [] as number[], mesas: [] as number[], comentario: '' };
}

/** Semanas que puede elegir quien llena: el promotor solo la actual, el equipo hasta 4 hacia atrás. */
export const semanasParaLlenar = (semanaActual: string, esPromotor: boolean) =>
  esPromotor ? [semanaActual] : Array.from({ length: SEMANAS_CORREGIBLES }, (_, i) => sumarDias(semanaActual, -7 * i));

export const acotarMesa = (v: number) => Math.min(MAX_EQUIPOS_MESA, Math.max(0, Math.trunc(v) || 0));

export function validarEnvio(e: EnvioFoto, semanaActual: string): string | null {
  if (!e.tienda) return 'Elige la tienda.';
  if (!semanasParaLlenar(semanaActual, false).includes(e.semana)) return 'Solo se pueden llenar las últimas 4 semanas.';
  if (e.mesas.length > MAX_MESAS) return `Máximo ${MAX_MESAS} mesas genéricas.`;
  if (e.comentario.length > 500) return 'El comentario es muy largo.';
  return null;
}

// ---------------------------------------------------------------------
// Productos y prioridades (admin)
// ---------------------------------------------------------------------
/** Si no escriben el abreviado, uso el nombre sin "Honor" (es la columna de la tabla y del Excel). */
export const abreviar = (nombre: string, corto: string) => (corto.trim() || nombre.trim().replace(/^honor\s+/i, '')).slice(0, 20);

export function normalizarProducto(p: DatosProducto): DatosProducto | string {
  const nombre = p.nombre.trim();
  if (nombre.length < 2) return 'Escribe el nombre del producto.';
  if (p.tipo !== 'Equipo' && p.tipo !== 'Accesorio') return 'Tipo de producto desconocido.';
  return { nombre, corto: abreviar(nombre, p.corto), tipo: p.tipo };
}

/** Texto del input de prioridad: vacío = no se exige, si no un número de 1 a 999. */
export function leerPrioridad(texto: string): { ok: true; numero: number | null } | { ok: false } {
  if (texto.trim() === '') return { ok: true, numero: null };
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? { ok: true, numero: n } : { ok: false };
}
