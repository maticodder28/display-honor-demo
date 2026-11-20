/**
 * Herramientas del asistente: cada intención tiene una función que calcula la respuesta con los datos.
 * Usan las mismas funciones que el Historial y el Display (medir, comparar), así que los números
 * coinciden con el resto de la app. Ninguna respuesta se inventa: todo sale de estos cálculos.
 */
import { fdate, num, pct } from '@/dominio/comun/formato';
import { comparar, medir, medirTienda, fila, type Corte, type Historial, type Medida } from '@/dominio/display/historial';
import { METRICAS_DATOS, UNIDAD, metricaNombre, type Metrica, type Tienda } from '@/dominio/display/modelo';
import type { Entidades } from './entidades';
import { INTENCIONES, PREGUNTAS_EJEMPLO } from './intenciones';

export interface Tabla {
  columnas: string[];
  filas: (string | number)[][];
  /** Alineación por columna: 'l' izquierda (texto), 'r' derecha (números). */
  alinear: ('l' | 'r')[];
}

export interface Respuesta {
  /** Texto con **negritas** simples. */
  texto: string;
  tabla?: Tabla;
  /** Serie para un mini gráfico de evolución. */
  serie?: { etiquetas: string[]; valores: (number | null)[] };
  sugerencias: string[];
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corto = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

export function pp(d: number | null): string {
  if (d == null) return '-';
  const v = Math.round(d * 1000) / 10;
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(1).replace('.', ',')} pp`;
}

const metricaDe = (e: Entidades): Metrica => e.metrica ?? 'exhibiciones';
const nombreMet = (m: Metrica) => metricaNombre(m).toLowerCase();

/** Tiendas activas que cumplen los filtros de la pregunta (ciudad, cliente, cobertura). */
export function tiendasEn(d: Historial, e: Entidades): Tienda[] {
  return d.tiendas.filter((t) => t.cobertura !== 'Cerrada'
    && (!e.ciudad || t.ciudad === e.ciudad)
    && (!e.cliente || t.cliente === e.cliente)
    && (!e.cobertura || t.cobertura === e.cobertura));
}

/** "la Zona Norte", "La Serena", "Falabella en La Serena", "las tiendas Middle Management de Ovalle". */
export function alcance(e: Entidades, zona = 'Norte'): string {
  const lugar = [e.cliente, e.ciudad].filter(Boolean).join(' en ');
  const cob = e.cobertura ? `las tiendas ${e.cobertura}` : '';
  if (cob && lugar) return `${cob} de ${lugar}`;
  return cob || lugar || `la Zona ${zona}`;
}

const ultimo = (d: Historial) => d.cortes[d.cortes.length - 1];
const anterior = (d: Historial) => (d.cortes.length > 1 ? d.cortes[d.cortes.length - 2] : null);

function lideres(m: Medida) {
  return [...m.porMarca.entries()].sort((a, b) => b[1] - a[1]).map(([marca, v]) => ({ marca, v, share: m.total ? v / m.total : 0 }));
}

const sinDatos = (e: Entidades): Respuesta => ({
  texto: `No hay tiendas con levantamiento para ${alcance(e)} en el último corte.`,
  sugerencias: ['¿Cuál es el share de Honor?', '¿Qué tiendas no tienen levantamiento?'],
});

// ---------------------------------------------------------------------

export function resumen(d: Historial, e: Entidades): Respuesta {
  const m = metricaDe(e), c = ultimo(d), a = anterior(d);
  const cods = tiendasEn(d, e).map((t) => t.codigo);
  const med = medir(c, cods, m);
  if (!med.total) return sinDatos(e);
  const ls = lideres(med);
  const top = ls[0];
  const ant = a ? medir(a, cods, m) : null;
  const partes = [
    `En ${alcance(e)}, Honor tiene **${pct(med.share)}** del share de ${nombreMet(m)} (${num(med.honor)} de ${num(med.total)} ${UNIDAD[m]}), puesto **#${med.puesto}** de ${ls.length}.`,
    top.marca === 'Honor' ? 'Honor es la marca líder.' : `Lidera **${top.marca}** con ${pct(top.share)}.`,
  ];
  if (e.marca && e.marca !== top.marca) {
    const otra = ls.find((x) => x.marca === e.marca);
    if (otra) partes.push(`Frente a ${e.marca} (${pct(otra.share)}), la diferencia es de **${pp((med.share ?? 0) - otra.share)}**.`);
  }
  if (ant?.share != null) partes.push(`Respecto al corte del ${corto(a!.fecha)}: ${pp((med.share ?? 0) - ant.share)}.`);
  partes.push(`Corte del ${fdate(c.fecha)}, ${med.medidas} tiendas medidas.`);
  return {
    texto: partes.join(' '),
    tabla: {
      columnas: ['Marca', 'Share', UNIDAD[m][0].toUpperCase() + UNIDAD[m].slice(1)],
      filas: ls.slice(0, 5).map((x) => [x.marca, pct(x.share), num(x.v)]),
      alinear: ['l', 'r', 'r'],
    },
    sugerencias: [
      `¿Cómo ha evolucionado el share de ${nombreMet(m)}${e.ciudad ? ` en ${e.ciudad}` : ''}?`,
      `¿En qué tiendas${e.ciudad ? ` de ${e.ciudad}` : ''} está más débil Honor?`,
      e.ciudad ? '¿En qué ciudad está mejor Honor?' : '¿En qué cliente está mejor Honor?',
    ],
  };
}

export function lider(d: Historial, e: Entidades): Respuesta {
  const m = metricaDe(e), c = ultimo(d);
  const med = medir(c, tiendasEn(d, e).map((t) => t.codigo), m);
  if (!med.total) return sinDatos(e);
  const ls = lideres(med);
  const top = ls[0];
  const texto = top.marca === 'Honor'
    ? `En ${alcance(e)}, **Honor lidera** en ${nombreMet(m)} con ${pct(top.share)}. La sigue ${ls[1]?.marca ?? '-'} con ${pct(ls[1]?.share)}.`
    : `En ${alcance(e)}, lidera **${top.marca}** en ${nombreMet(m)} con ${pct(top.share)}. Honor está **#${med.puesto}** con ${pct(med.share)}, a ${pp(top.share - (med.share ?? 0)).replace('+', '')} del líder.`;
  return {
    texto,
    tabla: { columnas: ['#', 'Marca', 'Share'], filas: ls.map((x, i) => [i + 1, x.marca, pct(x.share)]), alinear: ['r', 'l', 'r'] },
    sugerencias: [
      `¿En qué tiendas${e.ciudad ? ` de ${e.ciudad}` : ''} lidera Honor?`,
      `¿Cómo ha evolucionado el share de ${nombreMet(m)}?`,
      top.marca !== 'Honor' ? `¿Cómo estamos frente a ${top.marca}?` : '¿Qué marca lidera en promotores?',
    ],
  };
}

export function rankingTiendas(d: Historial, e: Entidades): Respuesta {
  const m = metricaDe(e), c = ultimo(d);
  const peor = e.direccion !== 'mejor';
  const n = Math.min(e.n ?? 5, 20);
  const filas = tiendasEn(d, e)
    .map((t) => ({ t, med: medirTienda(c, t.codigo, m) }))
    .filter((x): x is { t: Tienda; med: Medida } => !!x.med && x.med.total > 0)
    .map((x) => ({ ...x, rival: e.marca ? (x.med.porMarca.get(e.marca) ?? 0) / x.med.total : null }))
    .sort((a, b) => (peor ? (a.med.share ?? 0) - (b.med.share ?? 0) : (b.med.share ?? 0) - (a.med.share ?? 0)));
  if (!filas.length) return sinDatos(e);
  const lista = filas.slice(0, n);
  const lideradas = filas.filter((x) => x.med.puesto === 1).length;
  const texto = `Las ${lista.length} tiendas de ${alcance(e)} con ${peor ? '**menor**' : '**mayor**'} share de ${nombreMet(m)} para Honor. `
    + `Honor lidera en ${lideradas} de ${filas.length} tiendas medidas.`;
  const lider = (med: Medida) => lideres(med)[0]?.marca ?? '-';
  return {
    texto,
    tabla: {
      columnas: ['Tienda', 'Ciudad', 'Share Honor', 'Puesto', 'Líder', ...(e.marca ? [e.marca] : [])],
      filas: lista.map((x) => [x.t.tienda, x.t.ciudad, pct(x.med.share), `#${x.med.puesto}`, lider(x.med), ...(e.marca ? [pct(x.rival)] : [])]),
      alinear: ['l', 'l', 'r', 'r', 'l', ...(e.marca ? ['r' as const] : [])],
    },
    sugerencias: [
      peor ? `¿Cuáles son las tiendas más fuertes de Honor${e.ciudad ? ` en ${e.ciudad}` : ''}?` : `¿En qué tiendas${e.ciudad ? ` de ${e.ciudad}` : ''} está más débil Honor?`,
      `¿Cómo está la tienda ${lista[0].t.codigo}?`,
      '¿Qué tiendas bajaron desde el último corte?',
    ],
  };
}

export function tendencia(d: Historial, e: Entidades): Respuesta {
  const m = metricaDe(e);
  const cods = tiendasEn(d, e).map((t) => t.codigo);
  const serie = d.cortes.map((c) => ({ c, med: medir(c, cods, m) }));
  const conDato = serie.filter((x) => x.med.share != null);
  if (conDato.length < 2) return { texto: `Hay ${conDato.length} corte con datos para ${alcance(e)}: se necesitan al menos dos para ver la evolución.`, sugerencias: ['¿Cuál es el share de Honor?'] };
  const pri = conDato[0], ult = conDato[conDato.length - 1];
  const dif = (ult.med.share ?? 0) - (pri.med.share ?? 0);
  const mejor = conDato.reduce((a, b) => ((b.med.share ?? 0) > (a.med.share ?? 0) ? b : a));
  const subidas = conDato.slice(1).filter((x, i) => (x.med.share ?? 0) > (conDato[i].med.share ?? 0)).length;
  const texto = `En ${alcance(e)}, el share de ${nombreMet(m)} de Honor pasó de ${pct(pri.med.share)} (${corto(pri.c.fecha)}) a **${pct(ult.med.share)}** (${corto(ult.c.fecha)}): **${pp(dif)}** en ${conDato.length} cortes. `
    + `Subió en ${subidas} de ${conDato.length - 1} cortes; el mejor fue el del ${corto(mejor.c.fecha)} con ${pct(mejor.med.share)}.`;
  return {
    texto,
    serie: { etiquetas: serie.map((x) => corto(x.c.fecha)), valores: serie.map((x) => x.med.share) },
    tabla: {
      columnas: ['Corte', 'Share Honor', 'Puesto', 'Cambio'],
      filas: serie.map((x, i) => [fdate(x.c.fecha), pct(x.med.share), x.med.puesto ? `#${x.med.puesto}` : '-', i ? pp(x.med.share != null && serie[i - 1].med.share != null ? x.med.share - serie[i - 1].med.share! : null) : '-']),
      alinear: ['l', 'r', 'r', 'r'],
    },
    sugerencias: ['¿Qué tiendas bajaron desde el último corte?', `¿Cómo ha evolucionado el share de ${m === 'promotores' ? 'exhibiciones' : 'promotores'}?`, '¿En qué ciudad está mejor Honor?'],
  };
}

export function cambiosTiendas(d: Historial, e: Entidades): Respuesta {
  const m = metricaDe(e), B = ultimo(d), A = anterior(d);
  if (!A) return { texto: 'Aún hay un solo corte: no hay con qué comparar.', sugerencias: ['¿Cuál es el share de Honor?'] };
  const filas = comparar(A, B, tiendasEn(d, e), m).filter((f) => f.d != null);
  const subieron = filas.filter((f) => f.t === 'mejor').sort((a, b) => b.d! - a.d!);
  const bajaron = filas.filter((f) => f.t === 'peor').sort((a, b) => a.d! - b.d!);
  const lista = e.direccion === 'mejor' ? subieron : e.direccion === 'peor' ? bajaron : [...bajaron.slice(0, 5), ...subieron.slice(0, 5)];
  const n = Math.min(e.n ?? 10, 20);
  const total = medir(B, filas.map((f) => f.tienda.codigo), m).share, totalA = medir(A, filas.map((f) => f.tienda.codigo), m).share;
  const texto = `Del corte del ${corto(A.fecha)} al del ${corto(B.fecha)}, en ${alcance(e)}: **${subieron.length} tiendas subieron** y **${bajaron.length} bajaron** su share de ${nombreMet(m)} `
    + `(${filas.length - subieron.length - bajaron.length} sin cambio). Contando solo las ${filas.length} tiendas medidas en ambos cortes, Honor pasó de ${pct(totalA)} a ${pct(total)} (${pp(total != null && totalA != null ? total - totalA : null)}).`
    + (e.direccion === 'peor' && bajaron[0] ? ` La mayor caída fue ${bajaron[0].tienda.tienda} (${pp(bajaron[0].d)}).` : '')
    + (e.direccion === 'mejor' && subieron[0] ? ` La mayor subida fue ${subieron[0].tienda.tienda} (${pp(subieron[0].d)}).` : '');
  return {
    texto,
    tabla: lista.length ? {
      columnas: ['Tienda', 'Ciudad', 'Antes', 'Ahora', 'Cambio'],
      filas: lista.slice(0, n).map((f) => [f.tienda.tienda, f.tienda.ciudad, pct(f.a?.share), pct(f.b?.share), pp(f.d)]),
      alinear: ['l', 'l', 'r', 'r', 'r'],
    } : undefined,
    sugerencias: [
      e.direccion === 'peor' ? '¿Qué tiendas subieron desde el último corte?' : '¿Qué tiendas bajaron desde el último corte?',
      lista[0] ? `¿Cómo está la tienda ${lista[0].tienda.codigo}?` : '¿Cómo ha evolucionado el share?',
      '¿Cómo ha evolucionado el share?',
    ],
  };
}

export type Dimension = 'ciudad' | 'cliente' | 'cobertura';

export function porGrupo(d: Historial, e: Entidades, dim: Dimension): Respuesta {
  const m = metricaDe(e), c = ultimo(d), a = anterior(d);
  // Al agrupar por una dimensión se ignora el filtro de esa misma dimensión.
  const base = tiendasEn(d, { ...e, [dim]: null } as Entidades);
  const grupos = [...new Set(base.map((t) => t[dim]))];
  const filas = grupos
    .map((g) => {
      const cods = base.filter((t) => t[dim] === g).map((t) => t.codigo);
      const med = medir(c, cods, m);
      const ant = a ? medir(a, cods, m) : null;
      return { g, med, d: med.share != null && ant?.share != null ? med.share - ant.share : null, lider: lideres(med)[0]?.marca ?? '-' };
    })
    .filter((x) => x.med.total > 0)
    .sort((x, y) => (y.med.share ?? 0) - (x.med.share ?? 0));
  if (!filas.length) return sinDatos(e);
  const nombre = dim === 'ciudad' ? 'ciudad' : dim === 'cliente' ? 'cliente' : 'cobertura';
  const mejor = filas[0], peor = filas[filas.length - 1];
  const foco = e.direccion === 'peor'
    ? `La ${nombre} más débil es **${peor.g}** (${pct(peor.med.share)}); la más fuerte, ${mejor.g} (${pct(mejor.med.share)}).`
    : `Honor está mejor en **${mejor.g}** (${pct(mejor.med.share)}) y más débil en **${peor.g}** (${pct(peor.med.share)}).`;
  return {
    texto: `Share de ${nombreMet(m)} de Honor por ${nombre}${e.ciudad && dim !== 'ciudad' ? ` en ${e.ciudad}` : ''}${e.cliente && dim !== 'cliente' ? ` en ${e.cliente}` : ''}. ${foco}`,
    tabla: {
      columnas: [nombre[0].toUpperCase() + nombre.slice(1), 'Share Honor', 'Puesto', 'Líder', 'Vs corte anterior'],
      filas: filas.map((x) => [String(x.g), pct(x.med.share), `#${x.med.puesto}`, x.lider, pp(x.d)]),
      alinear: ['l', 'r', 'r', 'l', 'r'],
    },
    sugerencias: [
      `¿En qué tiendas de ${peor.g} está más débil Honor?`.replace('tiendas de Promotor', 'tiendas con cobertura Promotor'),
      dim === 'ciudad' ? '¿En qué cliente está mejor Honor?' : '¿En qué ciudad está mejor Honor?',
      `¿Cómo ha evolucionado el share en ${mejor.g}?`,
    ],
  };
}

export function detalleTienda(d: Historial, e: Entidades): Respuesta {
  if (!e.tienda) {
    if (e.tiendasPosibles.length)
      return {
        texto: `Encontré ${e.tiendasPosibles.length} tiendas parecidas. ¿Cuál de ellas?`,
        sugerencias: e.tiendasPosibles.slice(0, 4).map((t) => `¿Cómo está la tienda ${t.codigo}?`),
      };
    return { texto: 'No reconocí la tienda. Escribe su código (por ejemplo **DM101**) o su nombre como aparece en el Display.', sugerencias: ['¿En qué tiendas está más débil Honor?'] };
  }
  const t = e.tienda, c = ultimo(d), a = anterior(d);
  const filas = METRICAS_DATOS.map(([m]) => m as Metrica).map((m) => {
    const med = medirTienda(c, t.codigo, m), ant = a ? medirTienda(a, t.codigo, m) : null;
    return { m, med, d: med?.share != null && ant?.share != null ? med.share - ant.share : null };
  });
  const exh = filas[0].med;
  const lider = exh ? lideres(exh)[0] : null;
  const texto = `**${t.tienda}** (${t.codigo}): ${t.cliente}, ${t.ciudad}, cobertura ${t.cobertura}. `
    + (exh && exh.total
      ? `En exhibiciones Honor tiene **${pct(exh.share)}** (${num(exh.honor)} de ${num(exh.total)} equipos), puesto #${exh.puesto}${lider && lider.marca !== 'Honor' ? `; lidera ${lider.marca} con ${pct(lider.share)}` : '; Honor lidera la tienda'}.`
      : 'No tiene levantamiento de exhibiciones en el último corte.');
  return {
    texto,
    tabla: {
      columnas: ['Métrica', 'Share Honor', 'Honor / total', 'Puesto', 'Vs corte anterior'],
      filas: filas.map((x) => [metricaNombre(x.m), x.med ? pct(x.med.share) : 'sin dato', x.med ? `${num(x.med.honor)} / ${num(x.med.total)}` : '-', x.med?.puesto ? `#${x.med.puesto}` : '-', pp(x.d)]),
      alinear: ['l', 'r', 'r', 'r', 'r'],
    },
    sugerencias: [`¿Cómo está Honor en ${t.cliente}?`, `¿En qué tiendas de ${t.ciudad} está más débil Honor?`, '¿Qué tiendas bajaron desde el último corte?'],
  };
}

export function sinLevantamiento(d: Historial, e: Entidades): Respuesta {
  const c: Corte = ultimo(d);
  const metricas = e.metrica ? [e.metrica] : (METRICAS_DATOS.map(([m]) => m) as Metrica[]);
  const ts = tiendasEn(d, e);
  const faltan = ts
    .map((t) => ({ t, falta: metricas.filter((m) => !fila(c, t.codigo, m)) }))
    .filter((x) => x.falta.length);
  const que = e.metrica ? `de ${nombreMet(e.metrica)}` : '';
  if (!faltan.length) return { texto: `Todas las ${ts.length} tiendas de ${alcance(e)} tienen levantamiento ${que} en el corte del ${fdate(c.fecha)}.`, sugerencias: ['¿Cuál es el share de Honor?'] };
  return {
    texto: `En el corte del ${fdate(c.fecha)}, **${faltan.length} de ${ts.length} tiendas** de ${alcance(e)} no ${faltan.length === 1 ? 'tiene' : 'tienen'} levantamiento ${que}`.trim() + '.',
    tabla: {
      columnas: ['Tienda', 'Ciudad', 'Cobertura', 'Falta'],
      filas: faltan.map((x) => [x.t.tienda, x.t.ciudad, x.t.cobertura, x.falta.map((m) => metricaNombre(m)).join(', ')]),
      alinear: ['l', 'l', 'l', 'l'],
    },
    sugerencias: ['¿Cuál es el share de Honor?', '¿En qué tiendas está más débil Honor?'],
  };
}

export function ayuda(): Respuesta {
  const temas = (Object.keys(INTENCIONES) as (keyof typeof INTENCIONES)[]).filter((k) => k !== 'fuera' && k !== 'ayuda').map((k) => INTENCIONES[k].nombre.toLowerCase());
  return {
    texto: `Hola. Respondo preguntas sobre los datos del Display: ${temas.join(', ')}. Puedes filtrar por ciudad, cliente, cobertura, métrica o marca, y escribir como te salga: entiendo errores de tipeo.`,
    sugerencias: PREGUNTAS_EJEMPLO.slice(0, 4),
  };
}

export function noEntendi(): Respuesta {
  return {
    texto: 'No estoy seguro de entender esa pregunta. Solo respondo sobre los datos del Display (share, marcas, tiendas, cortes). Prueba con alguna de estas:',
    sugerencias: PREGUNTAS_EJEMPLO.slice(0, 4),
  };
}
