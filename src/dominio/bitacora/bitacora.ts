// Bitácora de tiendas: tipos y reglas. Todo lo que antes calculaba la pantalla
// (estado de visita, KPIs del mes, ranking de ejecutivos, validaciones) vive acá y se prueba sin React.

import { diasEntre, esFechaIso } from '../comun/fechas';
import type { Perfil } from '../usuario';

export interface BitTienda { codigo: string; nombre: string; cliente: string; ciudad: string; cobertura: string }
export interface BitEjecutivo { id: number; tienda_codigo: string; nombre: string; activo: boolean }
export interface BitAccion {
  id: number; tienda_codigo: string; fecha: string; tipo: string; ejecutivo_id: number | null; detalle: string;
  unidades: number | null; costo: number | null; pendiente: boolean; hecho: boolean; creado_por: string; created_at: string;
}
export type BitPerfil = Perfil;

export interface DatosBitacora {
  tiendas: BitTienda[];
  ejecutivos: BitEjecutivo[];
  acciones: BitAccion[];
  perfiles: BitPerfil[];
}

export const TIPOS_ACCION = ['visita', 'venta', 'incentivo', 'capacitacion', 'implementacion', 'observacion'] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

/** Lo que se manda a guardar. El id, el autor y la fecha de creación los pone la base. */
export interface NuevaAccion {
  tienda_codigo: string; fecha: string; tipo: TipoAccion; ejecutivo_id: number | null; detalle: string;
  unidades: number | null; costo: number | null; pendiente: boolean;
}

/** Nivel del ejecutivo según su parte de los equipos Honor vendidos en la tienda en el mes. */
export const NIVEL_ALTO = 0.4, NIVEL_MEDIO = 0.15;
/** Sobre estos valores pido confirmar, porque casi siempre es un error de tipeo. */
export const UNIDADES_ALTAS = 50, COSTO_ALTO = 200000;

// ---------------------------------------------------------------------
// Visitas
// ---------------------------------------------------------------------
export type ClaseEstado = 'ok' | 'warn' | 'bad';
export interface EstadoVisita { corto: string; largo: string; cls: ClaseEstado; dias: number }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Acciones por tienda, de la más reciente a la más antigua. */
export function agruparPorTienda(acciones: BitAccion[]): Map<string, BitAccion[]> {
  const m = new Map<string, BitAccion[]>();
  for (const a of acciones) {
    const l = m.get(a.tienda_codigo);
    if (l) l.push(a); else m.set(a.tienda_codigo, [a]);
  }
  m.forEach((l) => l.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id)));
  return m;
}

/**
 * Cualquier acción registrada cuenta como visita. Hasta 7 días está al día,
 * hasta 14 es aviso y sobre eso la tienda está abandonada.
 */
export function estadoVisita(ordenadas: BitAccion[], hoy: string): EstadoVisita {
  const ultima = ordenadas[0];
  if (!ultima) return { corto: 'Sin visita', largo: 'Sin visitas registradas', cls: 'bad', dias: 9999 };
  const d = diasEntre(ultima.fecha, hoy);
  if (d <= 7) return { corto: 'Al día', largo: `Visitada hace ${plural(d, 'día', 'días')}`, cls: 'ok', dias: d };
  if (d <= 14) return { corto: `${d} días`, largo: `Visitada hace ${d} días`, cls: 'warn', dias: d };
  return { corto: `${d} días`, largo: `Sin visita hace ${d} días`, cls: 'bad', dias: d };
}

export const sinVisitaReciente = (e: EstadoVisita) => e.dias > 14;
export const pendientesAbiertos = (lista: BitAccion[]) => lista.filter((a) => a.pendiente && !a.hecho).length;

// ---------------------------------------------------------------------
// Mes
// ---------------------------------------------------------------------
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** Meses con registros más el actual, del más nuevo al más antiguo (para el selector). */
export function mesesDisponibles(acciones: BitAccion[], hoy: string): string[] {
  const s = new Set<string>([mesDe(hoy)]);
  acciones.forEach((a) => s.add(mesDe(a.fecha)));
  return [...s].sort().reverse();
}

export interface ResumenMes { visitas: number; gasto: number; incentivos: number; equipos: number }

/** Una visita = una tienda en un día, aunque ese día se registren varias acciones. */
export function resumenMes(acciones: BitAccion[], mes: string): ResumenMes {
  const r: ResumenMes = { visitas: 0, gasto: 0, incentivos: 0, equipos: 0 };
  const dias = new Set<string>();
  for (const a of acciones) {
    if (mesDe(a.fecha) !== mes) continue;
    dias.add(`${a.tienda_codigo}|${a.fecha}`);
    if (a.tipo === 'incentivo') { r.gasto += a.costo ?? 0; r.incentivos++; }
    if (a.tipo === 'venta') r.equipos += a.unidades ?? 0;
  }
  r.visitas = dias.size;
  return r;
}

// ---------------------------------------------------------------------
// Ranking de ejecutivos
// ---------------------------------------------------------------------
export type Nivel = 'Alto' | 'Medio' | 'Bajo' | 'Sin ventas';

export const nivelEjecutivo = (unidades: number, share: number): Nivel =>
  !unidades ? 'Sin ventas' : share >= NIVEL_ALTO ? 'Alto' : share >= NIVEL_MEDIO ? 'Medio' : 'Bajo';

export interface FilaRanking {
  e: BitEjecutivo; u: number; share: number; nivel: Nivel; registros: number; incs: BitAccion[]; costo: number;
}

/**
 * Ranking de una tienda en el mes. Entran los activos y también los dados de baja que tuvieron
 * movimiento ese mes: si alguien vendió y después se fue, sus ventas tienen que seguir apareciendo.
 */
export function rankingEjecutivos(accsTienda: BitAccion[], ejsTienda: BitEjecutivo[], mes: string) {
  const enMes = (a: BitAccion) => mesDe(a.fecha) === mes;
  const ventas = accsTienda.filter((a) => a.tipo === 'venta' && enMes(a));
  const total = ventas.reduce((n, a) => n + (a.unidades ?? 0), 0);
  const conMovimiento = new Set(accsTienda.filter((a) => enMes(a) && a.ejecutivo_id).map((a) => a.ejecutivo_id));
  const filas: FilaRanking[] = ejsTienda
    .filter((e) => e.activo || conMovimiento.has(e.id))
    .map((e) => {
      const vs = ventas.filter((a) => a.ejecutivo_id === e.id);
      const u = vs.reduce((n, a) => n + (a.unidades ?? 0), 0);
      const incs = accsTienda.filter((a) => a.tipo === 'incentivo' && a.ejecutivo_id === e.id);
      const share = total ? u / total : 0;
      return { e, u, share, nivel: nivelEjecutivo(u, share), registros: vs.length, incs, costo: incs.reduce((n, a) => n + (a.costo ?? 0), 0) };
    })
    .sort((a, b) => b.u - a.u || a.e.nombre.localeCompare(b.e.nombre));
  return { filas, total };
}

/** Puesto para mostrar: los empates repiten con "=" y quien no vendió no tiene puesto. */
export function puesto(filas: FilaRanking[], i: number): string {
  const r = filas[i], prev = filas[i - 1];
  return !r.u ? '-' : prev && prev.u === r.u ? '=' : String(i + 1);
}

// ---------------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------------
export const esTipoAccion = (t: string): t is TipoAccion => (TIPOS_ACCION as readonly string[]).includes(t);

/** Devuelve el error para mostrar, o null si la acción se puede guardar. */
export function validarAccion(a: NuevaAccion, hoy: string): string | null {
  if (!esTipoAccion(a.tipo)) return 'Tipo de acción desconocido.';
  if (a.tipo === 'venta' && a.ejecutivo_id == null) return 'Elige el ejecutivo que hizo la venta.';
  if (a.tipo === 'venta' && !(a.unidades != null && a.unidades > 0)) return 'Ingresa cuántos equipos vendió.';
  if (a.tipo === 'incentivo' && !(a.costo != null && a.costo >= 0)) return 'Ingresa el costo del incentivo (puede ser 0).';
  if (a.tipo !== 'venta' && !a.detalle.trim()) return 'Escribe el detalle antes de guardar.';
  if (!esFechaIso(a.fecha)) return 'Elige la fecha.';
  if (a.fecha > hoy) return 'La fecha no puede ser futura.';
  return null;
}

/** Montos válidos pero raros: la pantalla pide confirmar antes de guardar. */
export function confirmacionNecesaria(a: NuevaAccion): { tipo: 'unidades' | 'costo'; valor: number } | null {
  if (a.tipo === 'venta' && (a.unidades ?? 0) > UNIDADES_ALTAS) return { tipo: 'unidades', valor: a.unidades! };
  if (a.tipo === 'incentivo' && (a.costo ?? 0) > COSTO_ALTO) return { tipo: 'costo', valor: a.costo! };
  return null;
}

const claveNombre = (s: string) => s.trim().toLowerCase();

/** Si el nombre ya existe como dado de baja en la tienda, conviene reactivarlo en vez de duplicarlo. */
export const buscarDadoDeBaja = (ejsTienda: BitEjecutivo[], nombre: string) =>
  ejsTienda.find((e) => !e.activo && claveNombre(e.nombre) === claveNombre(nombre));
