import 'server-only';
import { createClient } from './supabase/server';
import { DEMO, USUARIO_DEMO, bitacoraDemo, cargasDemo, datosDemo, fotoDemo, historialDemo } from './demo';
import type { FotoPrioridad, FotoProducto, FotoRespuesta, FotoSemana, FotoTienda } from './foto';
import type { Historial } from './historial';
import { metricasVacias, type CargaInfo, type DatosCarga, type MetricaDato, type Tienda } from './types';

export const ZONA = process.env.NEXT_PUBLIC_ZONA || 'Norte';

type FilaMedicion = [string, MetricaDato | 'muebles', string, number, string | null];

interface RespuestaDashboard {
  carga: CargaInfo & { marcas: string[] };
  tiendas: Tienda[];
  /** 'muebles' solo aparece en cargas anteriores a la separación DC/DZ: se lee como DC. */
  mediciones: FilaMedicion[];
}

/** Arma las métricas de una carga a partir de las filas de la base. */
function armarMetricas(marcas: string[], mediciones: FilaMedicion[]): DatosCarga['metricas'] {
  const idx = new Map(marcas.map((m, i) => [m, i]));
  const metricas = metricasVacias();
  for (const [codigo, met, marca, valor, fecha] of mediciones) {
    const metrica: MetricaDato = met === 'muebles' ? 'muebles_dc' : met;
    if (!metricas[metrica]) continue;
    const fila = (metricas[metrica][codigo] ??= { fecha, v: marcas.map(() => 0) });
    const i = idx.get(marca);
    if (i !== undefined) fila.v[i] = valor;
    if (fecha && (!fila.fecha || fecha > fila.fecha)) fila.fecha = fecha;
  }
  return metricas;
}

/** Corte más reciente de la zona (o la carga indicada), en el formato del dashboard. */
export async function obtenerDatos(cargaId?: number): Promise<{ raw: DatosCarga; carga: CargaInfo } | null> {
  if (DEMO) return datosDemo();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('dashboard_datos', { p_zona: ZONA, p_carga: cargaId ?? null });
  if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`);
  if (!data) return null;
  const d = data as RespuestaDashboard;
  const marcas = d.carga.marcas;
  return {
    raw: { marcas, tiendas: d.tiendas, metricas: armarMetricas(marcas, d.mediciones) },
    carga: { id: d.carga.id, archivo: d.carga.archivo, created_at: d.carga.created_at, fecha_corte: d.carga.fecha_corte },
  };
}

interface RespuestaHistorial {
  cortes: { id: number; fecha_corte: string; archivo: string | null; created_at: string; marcas: string[]; por: string | null }[];
  tiendas: Tienda[];
  mediciones: [number, ...FilaMedicion][];
}

/** Todos los cortes de la zona, del más antiguo al más reciente. */
export async function obtenerHistorial(): Promise<Historial> {
  if (DEMO) return historialDemo();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('historial_datos', { p_zona: ZONA });
  if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);
  const d = data as RespuestaHistorial;
  const porCarga = new Map<number, FilaMedicion[]>();
  for (const [id, ...f] of d.mediciones) {
    const l = porCarga.get(id);
    if (l) l.push(f); else porCarga.set(id, [f]);
  }
  return {
    tiendas: d.tiendas,
    cortes: d.cortes.map((c) => ({
      id: c.id, fecha: c.fecha_corte, archivo: c.archivo, created_at: c.created_at, por: c.por,
      marcas: c.marcas, metricas: armarMetricas(c.marcas, porCarga.get(c.id) ?? []),
    })),
  };
}

/**
 * Empieza una consulta sin esperarla, para que corra en paralelo con la verificación de sesión.
 * Si falla antes de que se espere (por ejemplo, sin sesión), el error no corta la redirección al login.
 */
export function enParalelo<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {});
  return p;
}

export async function usuarioActual() {
  if (DEMO) return USUARIO_DEMO;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('perfiles').select('nombre, rol, cargo, tienda_codigo').eq('id', user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email ?? '',
    nombre: perfil?.nombre || user.email?.split('@')[0] || 'Usuario',
    cargo: (perfil?.cargo as string | null) ?? null,
    rol: (perfil?.rol as string | null) ?? 'viewer',
    esAdmin: perfil?.rol === 'admin',
    puedeRegistrar: perfil?.rol === 'admin' || perfil?.rol === 'registro',
    /** El promotor solo entra a la Foto del Éxito de su tienda. */
    esPromotor: perfil?.rol === 'promotor',
    tiendaCodigo: (perfil?.tienda_codigo as string | null) ?? null,
  };
}

export interface CargaHistorial {
  id: number;
  fecha_corte: string;
  archivo: string | null;
  created_at: string;
  resumen: Record<string, string>;
  por_nombre: string | null;
}

export async function historialCargas(limite = 15): Promise<CargaHistorial[]> {
  if (DEMO) return cargasDemo().slice(0, limite);
  const supabase = await createClient();
  const { data: z } = await supabase.from('zonas').select('id').eq('nombre', ZONA).maybeSingle();
  if (!z) return [];
  const { data: cargas } = await supabase
    .from('cargas')
    .select('id, fecha_corte, archivo, created_at, resumen, por')
    .eq('zona_id', z.id)
    .order('fecha_corte', { ascending: false })
    .limit(limite);
  if (!cargas?.length) return [];
  const ids = [...new Set(cargas.map((c) => c.por).filter(Boolean))] as string[];
  const { data: perfiles } = ids.length
    ? await supabase.from('perfiles').select('id, nombre').in('id', ids)
    : { data: [] as { id: string; nombre: string | null }[] };
  const nombres = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]));
  return cargas.map((c) => ({
    id: c.id,
    fecha_corte: c.fecha_corte,
    archivo: c.archivo,
    created_at: c.created_at,
    resumen: (c.resumen ?? {}) as Record<string, string>,
    por_nombre: c.por ? nombres.get(c.por) ?? null : null,
  }));
}

/** Fechas de corte ya publicadas en la zona (para avisar antes de reemplazar una). */
export async function fechasCorte(): Promise<string[]> {
  if (DEMO) return cargasDemo().map((c) => c.fecha_corte);
  const supabase = await createClient();
  const { data: z } = await supabase.from('zonas').select('id').eq('nombre', ZONA).maybeSingle();
  if (!z) return [];
  const { data } = await supabase.from('cargas').select('fecha_corte').eq('zona_id', z.id);
  return (data ?? []).map((c) => c.fecha_corte as string);
}

// ---------------------------------------------------------------------
// Bitácora de tiendas
// ---------------------------------------------------------------------
export interface BitTienda { codigo: string; nombre: string; cliente: string; ciudad: string; cobertura: string }
export interface BitEjecutivo { id: number; tienda_codigo: string; nombre: string; activo: boolean }
export interface BitAccion {
  id: number; tienda_codigo: string; fecha: string; tipo: string; ejecutivo_id: number | null; detalle: string;
  unidades: number | null; costo: number | null; pendiente: boolean; hecho: boolean; creado_por: string; created_at: string;
}
export interface BitPerfil { id: string; nombre: string | null; cargo: string | null }

const PAGINA = 1000;

/** Tiendas activas de la zona con sus ejecutivos y las acciones de los últimos 12 meses. */
export async function obtenerBitacora() {
  if (DEMO) return bitacoraDemo();
  const supabase = await createClient();
  const { data: z } = await supabase.from('zonas').select('id').eq('nombre', ZONA).maybeSingle();
  if (!z) return { tiendas: [], ejecutivos: [], acciones: [], perfiles: [] };
  const { data: tiendas, error: e1 } = await supabase
    .from('tiendas').select('codigo, nombre, cliente, ciudad, cobertura')
    .eq('zona_id', z.id).eq('activa', true).order('nombre');
  if (e1) throw new Error(`No se pudo cargar la bitácora: ${e1.message}`);
  const codigos = (tiendas ?? []).map((t) => t.codigo);
  const desde = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  // Supabase entrega como máximo 1.000 filas por consulta: las acciones se piden por páginas.
  const traerAcciones = async () => {
    const todas: BitAccion[] = [];
    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await supabase.from('acciones')
        .select('id, tienda_codigo, fecha, tipo, ejecutivo_id, detalle, unidades, costo, pendiente, hecho, creado_por, created_at')
        .in('tienda_codigo', codigos).gte('fecha', desde)
        .order('fecha', { ascending: false }).order('id', { ascending: false })
        .range(inicio, inicio + PAGINA - 1);
      if (error) return { data: null, error };
      todas.push(...((data ?? []) as BitAccion[]));
      if (!data || data.length < PAGINA) return { data: todas, error: null };
    }
  };
  const [ej, ac, pf] = await Promise.all([
    // Incluye a los dados de baja: sus ventas e incentivos pasados siguen en el historial y los reportes.
    supabase.from('ejecutivos').select('id, tienda_codigo, nombre, activo').in('tienda_codigo', codigos).order('nombre'),
    traerAcciones(),
    supabase.from('perfiles').select('id, nombre, cargo'),
  ]);
  const err = ej.error || ac.error || pf.error;
  if (err) throw new Error(`No se pudo cargar la bitácora: ${err.message}`);
  return {
    tiendas: (tiendas ?? []) as BitTienda[],
    ejecutivos: (ej.data ?? []) as BitEjecutivo[],
    acciones: (ac.data ?? []) as BitAccion[],
    perfiles: (pf.data ?? []) as BitPerfil[],
  };
}

// ---------------------------------------------------------------------
// Foto del Éxito
// ---------------------------------------------------------------------
/** Cliente cuyas tiendas entran en la Foto del Éxito. */
export const FOTO_CLIENTE = 'Entel';

export interface FotoDatos {
  productos: FotoProducto[];
  prioridades: FotoPrioridad[];
  /** Prioridades guardadas por semana, para Excel y correcciones de semanas pasadas. */
  semanasPrio: FotoSemana[];
  tiendas: FotoTienda[];
  respuestas: FotoRespuesta[];
  perfiles: BitPerfil[];
}

/** Tiendas Entel de la zona, productos y respuestas de las últimas 26 semanas. */
export async function obtenerFoto(desde: string): Promise<FotoDatos> {
  if (DEMO) return fotoDemo(desde);
  const supabase = await createClient();
  const { data: z } = await supabase.from('zonas').select('id').eq('nombre', ZONA).maybeSingle();
  if (!z) return { productos: [], prioridades: [], semanasPrio: [], tiendas: [], respuestas: [], perfiles: [] };
  const [pr, pz, ps, ti, re, pf] = await Promise.all([
    supabase.from('foto_productos').select('id, nombre, corto, tipo, orden, activo').order('orden').order('id'),
    supabase.from('foto_prioridades').select('producto_id, cluster, numero'),
    supabase.from('foto_semanas').select('semana, prioridades').gte('semana', desde),
    supabase.from('tiendas')
      .select('codigo, tienda:nombre, ciudad, cobertura, codigo_b2b, codigo_corto, cluster, merchandiser')
      .eq('zona_id', z.id).eq('activa', true).ilike('cliente', FOTO_CLIENTE).order('ciudad').order('nombre'),
    supabase.from('foto_respuestas')
      .select('id, semana, tienda_codigo, pedidos, requeridos, exhibidos, mesas, comentario, actualizado_por, updated_at')
      .gte('semana', desde).order('semana', { ascending: false }).limit(1000),
    supabase.from('perfiles').select('id, nombre, cargo'),
  ]);
  const err = pr.error || pz.error || ps.error || ti.error || re.error || pf.error;
  if (err) throw new Error(`No se pudo cargar la Foto del Éxito: ${err.message}`);
  return {
    productos: (pr.data ?? []) as FotoProducto[],
    prioridades: (pz.data ?? []) as FotoPrioridad[],
    semanasPrio: (ps.data ?? []) as FotoSemana[],
    tiendas: (ti.data ?? []) as FotoTienda[],
    respuestas: (re.data ?? []) as FotoRespuesta[],
    perfiles: (pf.data ?? []) as BitPerfil[],
  };
}
