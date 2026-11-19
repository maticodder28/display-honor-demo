import * as XLSX from 'xlsx';
import { METRICAS_DATOS, metricasVacias, type Cobertura, type DatosCarga, type MetricaDato, type Tienda } from './types';
import { fdate } from './format';

// ---------------------------------------------------------------------
// Lectura del Excel de levantamiento
// Hojas: Tiendas, Exhibiciones, Muebles DC, Display Zone, Promotores.
// Acepta la plantilla en español y el listado original en inglés
// (CLIENT / CODE HONOR+ / STORE / COVERAGE TYPE).
// ---------------------------------------------------------------------

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const H = {
  codigo: ['codigo honor+', 'codigo honor', 'code honor+', 'code honor', 'codigo', 'code'],
  tienda: ['tienda', 'store', 'nombre tienda'],
  cliente: ['cliente', 'client', 'cadena', 'canal'],
  ciudad: ['ciudad', 'city', 'comuna'],
  region: ['region'],
  cobertura: ['cobertura', 'coverage type', 'coverage', 'tipo cobertura'],
  fecha: ['fecha levantamiento', 'fecha'],
} as const;

const NO_MARCA = new Set([
  'codigo honor+', 'codigo honor', 'codigo', 'code honor+', 'code', 'tienda', 'store', 'cliente', 'client', 'cadena',
  'cobertura', 'coverage type', 'fecha levantamiento', 'fecha', 'total', 'share honor', 'ciudad', 'region', '',
]);

const COB: Record<string, Cobertura> = {
  promotor: 'Promotor', promoter: 'Promotor',
  'middle management': 'Middle Management', 'middle mgmt': 'Middle Management', jefatura: 'Middle Management',
  'non coverage': 'Sin cobertura', 'sin cobertura': 'Sin cobertura',
  closed: 'Cerrada', cerrada: 'Cerrada',
};

const CIUDADES: [string, string][] = [
  ['serena', 'La Serena'], ['coquimbo', 'Coquimbo'], ['copiapo', 'Copiapó'], ['ovalle', 'Ovalle'],
  ['vallenar', 'Vallenar'], ['antofagasta', 'Antofagasta'], ['calama', 'Calama'], ['iquique', 'Iquique'], ['arica', 'Arica'],
];

const titulo = (s: string) =>
  ['ABC', 'WOM'].includes(s.toUpperCase()) ? s.toUpperCase() : s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

type Fila = unknown[];
const col = (hdr: Fila, names: readonly string[]) => hdr.findIndex((h) => names.includes(norm(h)));
const hoja = (wb: XLSX.WorkBook, name: string) => wb.SheetNames.find((n) => norm(n) === name);
const NOMBRES_HOJA: Record<MetricaDato, string[]> = {
  exhibiciones: ['exhibiciones', 'exhibicion'],
  muebles_dc: ['muebles dc', 'muebles_dc', 'mueble dc', 'dc'],
  muebles_dz: ['display zone', 'muebles display zone', 'muebles dz', 'muebles_dz', 'mueble dz', 'dz'],
  promotores: ['promotores', 'promotor'],
};
const buscarHoja = (wb: XLSX.WorkBook, met: MetricaDato) => wb.SheetNames.find((n) => NOMBRES_HOJA[met].includes(norm(n)));
const filas = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<Fila>(ws, { header: 1, raw: true, defval: null });

function aISO(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const s = String(v);
  const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const m2 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m2 ? m2[0] : null;
}

export interface ResultadoLectura {
  errores: string[];
  avisos: string[];
  datos?: DatosCarga;
  cerradas: number;
}

export function leerExcel(buf: ArrayBuffer): ResultadoLectura {
  const wb = XLSX.read(buf, { type: 'array' });
  const errores: string[] = [];
  const avisos: string[] = [];

  const nombreT =
    hoja(wb, 'tiendas') ??
    wb.SheetNames.find((n) => {
      const r = filas(wb.Sheets[n])[0] ?? [];
      return col(r, H.codigo) >= 0 && col(r, H.cobertura) >= 0;
    });
  if (!nombreT) {
    errores.push('No encontré la hoja "Tiendas" (con columnas Código Honor+, Tienda, Cliente y Cobertura).');
    return { errores, avisos, cerradas: 0 };
  }
  const tf = filas(wb.Sheets[nombreT]);
  const th = tf[0] ?? [];
  const ci = Object.fromEntries(Object.entries(H).map(([k, v]) => [k, col(th, v)])) as Record<keyof typeof H, number>;
  if (ci.codigo < 0) {
    errores.push('La hoja Tiendas no tiene la columna "Código Honor+".');
    return { errores, avisos, cerradas: 0 };
  }

  const tiendas: Tienda[] = [];
  const vistos = new Set<string>();
  let cerradas = 0;
  for (const r of tf.slice(1)) {
    const cod = String(r[ci.codigo] ?? '').trim();
    if (!cod) continue;
    if (vistos.has(cod)) { avisos.push(`El código ${cod} está repetido en Tiendas; usé la primera fila.`); continue; }
    vistos.add(cod);
    const nombre = ci.tienda >= 0 ? String(r[ci.tienda] ?? '').trim() : '';
    const cobRaw = ci.cobertura >= 0 ? norm(r[ci.cobertura]) : '';
    const cobertura = COB[cobRaw] ?? 'Sin cobertura';
    if (cobRaw && !COB[cobRaw]) avisos.push(`${cod}: cobertura "${r[ci.cobertura]}" no reconocida; la dejé como Sin cobertura.`);
    let ciudad = ci.ciudad >= 0 && r[ci.ciudad] ? String(r[ci.ciudad]).trim() : '';
    if (!ciudad) ciudad = CIUDADES.find(([k]) => norm(nombre).includes(k))?.[1] ?? 'Sin ciudad';
    if (cobertura === 'Cerrada') cerradas++;
    tiendas.push({
      codigo: cod,
      tienda: nombre || cod,
      cliente: titulo(String(ci.cliente >= 0 ? (r[ci.cliente] ?? 'Sin cliente') : 'Sin cliente').trim()),
      ciudad,
      region: ci.region >= 0 ? String(r[ci.region] ?? '') : '',
      cobertura,
    });
  }
  const sinCiudad = tiendas.filter((t) => t.ciudad === 'Sin ciudad').length;
  if (sinCiudad) avisos.push(`${sinCiudad} tiendas sin ciudad: agrega la columna Ciudad o el nombre de la ciudad en la tienda.`);

  const metricas = metricasVacias();
  let marcas: string[] | null = null;
  // Planillas antiguas tienen una sola hoja "Muebles": se toma como Muebles DC.
  const muebleAntiguo = !buscarHoja(wb, 'muebles_dc') && !buscarHoja(wb, 'muebles_dz') ? hoja(wb, 'muebles') : undefined;
  if (muebleAntiguo) avisos.push('El archivo tiene una sola hoja "Muebles": la cargué como Muebles DC. Usa las hojas "Muebles DC" y "Display Zone" para separarlos.');
  for (const [met, label] of METRICAS_DATOS) {
    const sn = buscarHoja(wb, met) ?? (met === 'muebles_dc' ? muebleAntiguo : undefined);
    if (!sn) { if (!(met === 'muebles_dz' && muebleAntiguo)) avisos.push(`No encontré la hoja "${label}"; quedará sin datos.`); continue; }
    const rows = filas(wb.Sheets[sn]);
    const hdr = rows[0] ?? [];
    const cc = col(hdr, H.codigo);
    const fc = col(hdr, H.fecha);
    const bcols = hdr.map((h, i) => [String(h ?? '').trim(), i] as const).filter(([h]) => !NO_MARCA.has(norm(h)));
    const nombres = bcols.map(([h]) => h);
    if (!nombres.length || cc < 0) { errores.push(`La hoja ${label} necesita la columna Código Honor+ y una columna por marca.`); continue; }
    if (!marcas) marcas = nombres;
    else if (nombres.join('|') !== marcas.join('|')) {
      errores.push(`Las marcas de la hoja ${label} no coinciden con las de las otras hojas (${nombres.join(', ')}).`);
      continue;
    }
    const desconocidos: string[] = [];
    for (const r of rows.slice(1)) {
      const cod = String(r[cc] ?? '').trim();
      if (!cod) continue;
      const vals = bcols.map(([, i]) => r[i]);
      if (vals.every((v) => v === null || v === '')) continue; // fila vacía = sin levantamiento
      if (!vistos.has(cod)) { desconocidos.push(cod); continue; }
      const malos = vals.filter((v) => v !== null && v !== '' && isNaN(Number(v)));
      if (malos.length) avisos.push(`${label} | ${cod}: hay valores que no son números (${malos.join(', ')}); los conté como 0.`);
      const nums = vals.map((v) => { const n = Number(v); return v === null || v === '' || isNaN(n) ? 0 : n; });
      const negativos = bcols.filter((_, i) => nums[i] < 0).map(([m]) => m);
      if (negativos.length) errores.push(`${label} | ${cod}: hay valores negativos en ${negativos.join(', ')}. Corrígelos antes de publicar.`);
      const decimales = bcols.filter((_, i) => !Number.isInteger(nums[i])).map(([m]) => m);
      if (decimales.length) avisos.push(`${label} | ${cod}: hay decimales en ${decimales.join(', ')}; se redondean al publicar.`);
      metricas[met as MetricaDato][cod] = {
        fecha: fc >= 0 ? aISO(r[fc]) : null,
        v: nums.map((n) => (n < 0 ? 0 : Math.round(n))),
      };
    }
    if (desconocidos.length)
      avisos.push(`${label}: ${desconocidos.length} código(s) no están en Tiendas y se ignoraron (${desconocidos.slice(0, 5).join(', ')}${desconocidos.length > 5 ? '...' : ''}).`);
  }
  if (!marcas) errores.push('No encontré columnas de marcas en las hojas de levantamiento.');
  else if (!marcas.includes('Honor')) errores.push('Falta la columna "Honor" en las hojas de levantamiento.');

  return { errores, avisos, datos: { marcas: marcas ?? [], tiendas, metricas }, cerradas };
}

// ---------------------------------------------------------------------
// Exportar los datos publicados al mismo formato de plantilla
// ---------------------------------------------------------------------
export function exportarExcel(raw: DatosCarga): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const { marcas } = raw;
  const L = (i: number) => XLSX.utils.encode_col(i);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Código Honor+', 'Tienda', 'Cliente', 'Ciudad', 'Región', 'Cobertura'],
      ...raw.tiendas.map((t) => [t.codigo, t.tienda, t.cliente, t.ciudad, t.region ?? '', t.cobertura]),
    ]),
    'Tiendas',
  );
  const activas = raw.tiendas.filter((t) => t.cobertura !== 'Cerrada');
  for (const [met, label] of METRICAS_DATOS) {
    const aoa: unknown[][] = [['Código Honor+', 'Tienda', 'Cliente', 'Cobertura', 'Fecha levantamiento', ...marcas, 'Total', 'Share Honor']];
    activas.forEach((t) => {
      const r = raw.metricas[met][t.codigo];
      aoa.push([t.codigo, t.tienda, t.cliente, t.cobertura, r?.fecha ? fdate(r.fecha) : null, ...marcas.map((_, i) => (r ? r.v[i] : null)), null, null]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const f0 = 5, f1 = 4 + marcas.length, hi = marcas.indexOf('Honor');
    for (let r = 2; r <= activas.length + 1; r++) {
      ws[L(f1 + 1) + r] = { t: 'n', f: `IF(COUNT(${L(f0)}${r}:${L(f1)}${r})=0,"",SUM(${L(f0)}${r}:${L(f1)}${r}))` };
      ws[L(f1 + 2) + r] = { t: 'n', f: `IF(OR(${L(f1 + 1)}${r}="",${L(f1 + 1)}${r}=0),"",${L(f0 + hi)}${r}/${L(f1 + 1)}${r})`, z: '0.0%' };
    }
    ws['!cols'] = [{ wch: 15 }, { wch: 34 }, { wch: 11 }, { wch: 18 }, { wch: 12 }, ...marcas.map(() => ({ wch: 9 })), { wch: 8 }, { wch: 11 }];
    XLSX.utils.book_append_sheet(wb, ws, label);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/** Fecha de levantamiento más reciente del Excel (YYYY-MM-DD), para proponerla como fecha de corte. */
export function fechaMaxima(d: DatosCarga): string | null {
  let max: string | null = null;
  for (const [met] of METRICAS_DATOS) for (const r of Object.values(d.metricas[met])) if (r.fecha && (!max || r.fecha > max)) max = r.fecha;
  return max;
}

/** Convierte una lectura en el payload de la función publicar_carga. */
export function aPayload(d: DatosCarga, zona: string, archivo: string, fechaCorte: string) {
  const mediciones: { codigo: string; metrica: MetricaDato; marca: string; valor: number; fecha: string | null }[] = [];
  for (const [met] of METRICAS_DATOS)
    for (const [codigo, r] of Object.entries(d.metricas[met]))
      r.v.forEach((valor, i) => mediciones.push({ codigo, metrica: met, marca: d.marcas[i], valor, fecha: r.fecha }));
  const activas = d.tiendas.filter((t) => t.cobertura !== 'Cerrada').length;
  const resumen = Object.fromEntries(METRICAS_DATOS.map(([m]) => [m, `${Object.keys(d.metricas[m]).length}/${activas}`]));
  return { zona, archivo, fecha_corte: fechaCorte, marcas: d.marcas, tiendas: d.tiendas, mediciones, resumen };
}

// ---------------------------------------------------------------------
// Comparación entre dos cortes
// ---------------------------------------------------------------------
export interface ComparacionExcel {
  metrica: string;
  filtro: string;
  fechaA: string;
  fechaB: string;
  marcas: { marca: string; udsA: number; shareA: number | null; udsB: number; shareB: number | null }[];
  tiendas: {
    tienda: Tienda;
    a: { honor: number; total: number; share: number | null; puesto: number | null } | null;
    b: { honor: number; total: number; share: number | null; puesto: number | null } | null;
    estado: string;
  }[];
  clientes: { cliente: string; shareA: number | null; shareB: number | null }[];
}

const PCT = '0.0%';
const PP = '+0.0" pp";-0.0" pp";0.0" pp"';
const dpp = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((b - a) * 1000) / 10);

export function exportarComparacion(c: ComparacionExcel): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const fmt = (ws: XLSX.WorkSheet, filaIni: number, cols: Record<number, string>) => {
    const rango = XLSX.utils.decode_range(ws['!ref']!);
    for (let r = filaIni; r <= rango.e.r; r++)
      for (const [col, z] of Object.entries(cols)) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: Number(col) })];
        if (cell && cell.t === 'n') cell.z = z;
      }
  };

  const resumen = XLSX.utils.aoa_to_sheet([
    ['Comparación de cortes | Display Honor'],
    ['Métrica', c.metrica],
    ['Filtro', c.filtro],
    ['Corte A', fdate(c.fechaA)],
    ['Corte B', fdate(c.fechaB)],
    [],
    ['Marca', `Unidades ${fdate(c.fechaA)}`, `Share ${fdate(c.fechaA)}`, `Unidades ${fdate(c.fechaB)}`, `Share ${fdate(c.fechaB)}`, 'Cambio share'],
    ...c.marcas.map((m) => [m.marca, m.udsA, m.shareA, m.udsB, m.shareB, dpp(m.shareA, m.shareB)]),
  ]);
  fmt(resumen, 7, { 2: PCT, 4: PCT, 5: PP });
  resumen['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, resumen, 'Resumen');

  const tiendas = XLSX.utils.aoa_to_sheet([
    ['Código Honor+', 'Tienda', 'Cliente', 'Ciudad', 'Cobertura',
      'Honor A', 'Total A', 'Share A', 'Puesto A', 'Honor B', 'Total B', 'Share B', 'Puesto B', 'Cambio share', 'Resultado'],
    ...c.tiendas.map(({ tienda: t, a, b, estado }) => [
      t.codigo, t.tienda, t.cliente, t.ciudad, t.cobertura,
      a?.honor ?? null, a?.total ?? null, a?.share ?? null, a?.puesto ?? null,
      b?.honor ?? null, b?.total ?? null, b?.share ?? null, b?.puesto ?? null,
      dpp(a?.share ?? null, b?.share ?? null), estado,
    ]),
  ]);
  fmt(tiendas, 1, { 7: PCT, 11: PCT, 13: PP });
  tiendas['!cols'] = [{ wch: 15 }, { wch: 34 }, { wch: 11 }, { wch: 11 }, { wch: 18 }, ...Array(8).fill({ wch: 9 }), { wch: 13 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, tiendas, 'Por tienda');

  const clientes = XLSX.utils.aoa_to_sheet([
    ['Cliente', 'Share A', 'Share B', 'Cambio share'],
    ...c.clientes.map((r) => [r.cliente, r.shareA, r.shareB, dpp(r.shareA, r.shareB)]),
  ]);
  fmt(clientes, 1, { 1: PCT, 2: PCT, 3: PP });
  clientes['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, clientes, 'Por cliente');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/** Descarga un ArrayBuffer como archivo .xlsx en el navegador. */
export function descargarXlsx(buf: ArrayBuffer, nombre: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
