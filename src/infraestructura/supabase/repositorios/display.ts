import type { CargaPublicada, Publicacion, RepositorioDisplay } from '@/aplicacion/puertos';
import { vacio } from '@/dominio/comun/resultado';
import type { Historial } from '@/dominio/display/historial';
import { METRICAS_DATOS, metricasVacias, type CargaInfo, type DatosCarga, type MetricaDato, type Tienda } from '@/dominio/display/modelo';
import type { ClienteSupabase } from '../servidor';
import { aFalla, idZona } from './comun';

// Formato compacto que devuelven las funciones dashboard_datos e historial_datos:
// [código, métrica, marca, valor, fecha]. Así viajan muchas menos bytes que con objetos.
type FilaMedicion = [string, MetricaDato | 'muebles', string, number, string | null];

interface RespuestaDashboard {
  carga: CargaInfo & { marcas: string[] };
  tiendas: Tienda[];
  mediciones: FilaMedicion[];
}

interface RespuestaHistorial {
  cortes: { id: number; fecha_corte: string; archivo: string | null; created_at: string; marcas: string[]; por: string | null }[];
  tiendas: Tienda[];
  mediciones: [number, ...FilaMedicion][];
}

/** Arma las métricas de una carga a partir de las filas de la base. */
function armarMetricas(marcas: string[], mediciones: FilaMedicion[]): DatosCarga['metricas'] {
  const idx = new Map(marcas.map((m, i) => [m, i]));
  const metricas = metricasVacias();
  for (const [codigo, met, marca, valor, fecha] of mediciones) {
    // Las cargas antiguas, de antes de separar Display Center y Display Zone, traen "muebles": lo leo como DC.
    const metrica: MetricaDato = met === 'muebles' ? 'muebles_dc' : met;
    if (!metricas[metrica]) continue;
    const fila = (metricas[metrica][codigo] ??= { fecha, v: marcas.map(() => 0) });
    const i = idx.get(marca);
    if (i !== undefined) fila.v[i] = valor;
    if (fecha && (!fila.fecha || fecha > fila.fecha)) fila.fecha = fecha;
  }
  return metricas;
}

/** Lo que espera la función publicar_carga: una fila por tienda, métrica y marca. */
function aPayload({ datos: d, archivo, fechaCorte }: Publicacion, zona: string) {
  const mediciones: { codigo: string; metrica: MetricaDato; marca: string; valor: number; fecha: string | null }[] = [];
  for (const [met] of METRICAS_DATOS)
    for (const [codigo, r] of Object.entries(d.metricas[met]))
      r.v.forEach((valor, i) => mediciones.push({ codigo, metrica: met, marca: d.marcas[i], valor, fecha: r.fecha }));
  const activas = d.tiendas.filter((t) => t.cobertura !== 'Cerrada').length;
  const resumen = Object.fromEntries(METRICAS_DATOS.map(([m]) => [m, `${Object.keys(d.metricas[m]).length}/${activas}`]));
  return { zona, archivo, fecha_corte: fechaCorte, marcas: d.marcas, tiendas: d.tiendas, mediciones, resumen };
}

export function repositorioDisplaySupabase(db: () => Promise<ClienteSupabase>, zona: string): RepositorioDisplay {
  return {
    async corteActual() {
      const { data, error } = await (await db()).rpc('dashboard_datos', { p_zona: zona, p_carga: null });
      if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`);
      if (!data) return null;
      const d = data as RespuestaDashboard;
      return {
        raw: { marcas: d.carga.marcas, tiendas: d.tiendas, metricas: armarMetricas(d.carga.marcas, d.mediciones) },
        carga: { id: d.carga.id, archivo: d.carga.archivo, created_at: d.carga.created_at, fecha_corte: d.carga.fecha_corte },
      };
    },

    async historial(): Promise<Historial> {
      const { data, error } = await (await db()).rpc('historial_datos', { p_zona: zona });
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
    },

    async cargas(limite): Promise<CargaPublicada[]> {
      const cliente = await db();
      const z = await idZona(cliente, zona);
      if (z == null) return [];
      const { data: cargas } = await cliente
        .from('cargas').select('id, fecha_corte, archivo, created_at, resumen, por')
        .eq('zona_id', z).order('fecha_corte', { ascending: false }).limit(limite);
      if (!cargas?.length) return [];
      // Nombre de quien subió cada corte.
      const ids = [...new Set(cargas.map((c) => c.por).filter(Boolean))] as string[];
      const { data: perfiles } = ids.length
        ? await cliente.from('perfiles').select('id, nombre').in('id', ids)
        : { data: [] as { id: string; nombre: string | null }[] };
      const nombres = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]));
      return cargas.map((c) => ({
        id: c.id, fecha_corte: c.fecha_corte, archivo: c.archivo, created_at: c.created_at,
        resumen: (c.resumen ?? {}) as Record<string, string>,
        por_nombre: c.por ? nombres.get(c.por) ?? null : null,
      }));
    },

    async fechasDeCorte() {
      const cliente = await db();
      const z = await idZona(cliente, zona);
      if (z == null) return [];
      const { data } = await cliente.from('cargas').select('fecha_corte').eq('zona_id', z);
      return (data ?? []).map((c) => c.fecha_corte as string);
    },

    async publicar(p) {
      const { error } = await (await db()).rpc('publicar_carga', { p: aPayload(p, zona) });
      return error ? aFalla(error, 'No se pudo publicar') : vacio();
    },
  };
}
