import { METRICAS, type DatosCarga, type FilaMetrica, type Metrica, type Tienda } from './modelo';

/** Fila agregada: unidades de una marca dentro de un grupo (cobertura x cliente x ciudad x métrica). */
export interface Agregado {
  key: string;
  grupo: string;
  marca: string;
  valor: number;
  total: number;
  /** null cuando el grupo no tiene unidades de ninguna marca. */
  share: number | null;
  /** 1 + marcas con más unidades (los empates comparten puesto). null si el grupo no tiene unidades. */
  puesto: number | null;
  empate: boolean;
}

export interface Cobertura {
  con: number;
  tiendas: number;
}

export interface DetalleTienda extends Tienda {
  exh_honor: number | null;
  exh_total: number | null;
  exh_share: number | null;
  /** Muebles total (DC + DZ). */
  mue_share: number | null;
  mue_dc_share: number | null;
  mue_dz_share: number | null;
  pro_honor: number | null;
  pro_total: number | null;
  pro_share: number | null;
  /** Marca con más exhibiciones; en empate, "A / B". */
  lider: string | null;
}

export interface Modelo {
  marcas: string[];
  tiendas: Tienda[];
  byKey: Map<string, Agregado>;
  byG: Map<string, Agregado[]>;
  cobKey: Map<string, Cobertura>;
  detalle: DetalleTienda[];
  /** Fecha de levantamiento más reciente (YYYY-MM-DD). */
  corte: string;
}

export const TODAS = 'Todas';
export const clave = (cobertura: string, cliente: string, ciudad: string, metrica: Metrica) =>
  [cobertura, cliente, ciudad, metrica].join('|');

/**
 * Agrega una carga para todas las combinaciones de filtros ("Todas" incluida).
 * Share = unidades de la marca / unidades de todas las marcas en las tiendas con dato.
 */
export function compute(raw: DatosCarga): Modelo {
  const marcas = raw.marcas;
  const tiendas = raw.tiendas.filter((t) => t.cobertura !== 'Cerrada');
  const tmap = new Map(tiendas.map((t) => [t.codigo, t]));
  const acc = new Map<string, { key: string; grupo: string; marca: string; valor: number }>();
  const tot = new Map<string, number>();
  const con = new Set<string>();
  const per = new Map<string, { honor: number; total: number; top: string | null }>();
  let corte = '';

  // Muebles = DC + DZ por tienda. Una tienda cuenta como medida si tiene cualquiera de las dos.
  const muebles: Record<string, FilaMetrica> = {};
  for (const k of ['muebles_dc', 'muebles_dz'] as const)
    for (const [cod, r] of Object.entries(raw.metricas[k] ?? {})) {
      if (!r || !Array.isArray(r.v)) continue;
      const f = (muebles[cod] ??= { fecha: null, v: marcas.map(() => 0) });
      r.v.forEach((v, i) => { f.v[i] += Number(v) || 0; });
      if (r.fecha && (!f.fecha || r.fecha > f.fecha)) f.fecha = r.fecha;
    }
  const fuentes: Record<Metrica, Record<string, FilaMetrica>> = { ...raw.metricas, muebles };

  for (const [met] of METRICAS) {
    for (const [cod, r] of Object.entries(fuentes[met] ?? {})) {
      const s = tmap.get(cod);
      if (!s || !r || !Array.isArray(r.v)) continue;
      con.add(met + '|' + cod);
      if (r.fecha && r.fecha > corte) corte = r.fecha;
      let honor = 0, total = 0, topv = 0;
      let top: string[] = [];
      r.v.forEach((val, i) => {
        const m = marcas[i];
        const v = Number(val) || 0;
        total += v;
        if (m === 'Honor') honor = v;
        if (v > 0 && v > topv) { topv = v; top = [m]; } else if (v > 0 && v === topv) top.push(m);
        for (const a of [TODAS, s.cobertura]) for (const c of [TODAS, s.cliente]) for (const u of [TODAS, s.ciudad]) {
          const g = clave(a, c, u, met);
          const k = g + '|' + m;
          const x = acc.get(k) ?? { key: k, grupo: g, marca: m, valor: 0 };
          x.valor += v;
          acc.set(k, x);
          tot.set(g, (tot.get(g) ?? 0) + v);
        }
      });
      per.set(cod + '|' + met, { honor, total, top: top.length ? top.join(' / ') : null });
    }
  }

  const byKey = new Map<string, Agregado>();
  const byG = new Map<string, Agregado[]>();
  for (const x of acc.values()) {
    const total = tot.get(x.grupo) ?? 0;
    const r: Agregado = { ...x, total, share: total ? x.valor / total : null, puesto: null, empate: false };
    byKey.set(r.key, r);
    if (!byG.has(r.grupo)) byG.set(r.grupo, []);
    byG.get(r.grupo)!.push(r);
  }
  byG.forEach((g) => {
    g.sort((a, b) => b.valor - a.valor);
    g.forEach((r) => {
      r.puesto = r.total ? 1 + g.filter((o) => o.valor > r.valor).length : null;
      r.empate = !!r.total && r.valor > 0 && g.some((o) => o !== r && o.valor === r.valor);
    });
  });

  const cobKey = new Map<string, Cobertura>();
  for (const s of tiendas)
    for (const a of [TODAS, s.cobertura]) for (const c of [TODAS, s.cliente]) for (const u of [TODAS, s.ciudad])
      for (const [met] of METRICAS) {
        const k = clave(a, c, u, met);
        const x = cobKey.get(k) ?? { con: 0, tiendas: 0 };
        x.tiendas++;
        if (con.has(met + '|' + s.codigo)) x.con++;
        cobKey.set(k, x);
      }

  const sh = (a?: { honor: number; total: number }) => (a && a.total ? a.honor / a.total : null);
  const detalle: DetalleTienda[] = tiendas.map((s) => {
    const e = per.get(s.codigo + '|exhibiciones');
    const u = per.get(s.codigo + '|muebles');
    const udc = per.get(s.codigo + '|muebles_dc');
    const udz = per.get(s.codigo + '|muebles_dz');
    const p = per.get(s.codigo + '|promotores');
    return {
      ...s,
      exh_honor: e ? e.honor : null, exh_total: e ? e.total : null, exh_share: sh(e),
      mue_share: sh(u), mue_dc_share: sh(udc), mue_dz_share: sh(udz),
      pro_honor: p ? p.honor : null, pro_total: p ? p.total : null, pro_share: sh(p),
      lider: e && e.total ? e.top : null,
    };
  });

  return { marcas, tiendas, byKey, byG, cobKey, detalle, corte };
}

/** Marca con más unidades del grupo; en un empate con Honor devuelve la otra. null si nadie tiene unidades. */
export function lider(M: Modelo, grupo: string): Agregado | null {
  const a = M.byG.get(grupo);
  if (!a || !a.length) return null;
  const max = Math.max(...a.map((x) => x.valor));
  if (!(max > 0)) return null;
  const tops = a.filter((x) => x.valor === max);
  return tops.find((x) => x.marca !== 'Honor') ?? tops[0];
}

export type Estado = 'ok' | 'warn' | 'bad';
export const estadoPuesto = (p: number | null): Estado => (p == null ? 'bad' : p === 1 ? 'ok' : p <= 3 ? 'warn' : 'bad');
export const textoPuesto = (r: Agregado, n: number) =>
  r.puesto == null ? 'sin registros' : `#${r.puesto}${r.empate ? ' (empate)' : ''} de ${n}`;
