import ExcelJS from 'exceljs';
import type { BitAccion, BitEjecutivo, BitPerfil, BitTienda } from '@/dominio/bitacora/bitacora';

/**
 * Reporte mensual de la Bitácora en Excel, pensado para leerse sin la web:
 * Resumen | Por tienda | Ranking ejecutivos | Incentivos | Pendientes | Registro.
 * Se carga solo cuando alguien pide el reporte (import dinámico), así no pesa en la página.
 */

export interface DatosReporte {
  hoy: string; // YYYY-MM-DD
  mes: string; // YYYY-MM
  zona: string;
  generadoPor: string;
  tiendas: BitTienda[];
  ejecutivos: BitEjecutivo[];
  acciones: BitAccion[];
  perfiles: BitPerfil[];
}

const TIPO: Record<string, string> = {
  visita: 'Visita', venta: 'Venta ejecutivo', incentivo: 'Incentivo / regalo',
  capacitacion: 'Capacitación', implementacion: 'Implementación', observacion: 'Observación',
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const NIVEL_ALTO = 0.4, NIVEL_MEDIO = 0.15;

// Colores (ARGB), tonos suaves para que se lea bien impreso o en pantalla.
const C = {
  head: 'FF26262E', headTxt: 'FFFFFFFF', titulo: 'FFEA620A', sub: 'FF6A6A75', banda: 'FFF7F7F9', linea: 'FFE3E3E8',
  ok: 'FFDCFCE7', okTxt: 'FF166534', warn: 'FFFEF3C7', warnTxt: 'FF92400E', bad: 'FFFEE2E2', badTxt: 'FF991B1B', mut: 'FFF1F1F4', mutTxt: 'FF6A6A75',
  acc: 'FFFFEDD5',
};
const FMT = { clp: '"$"#,##0', fecha: 'dd-mm-yyyy', pct: '0%', int: '#,##0' };

const aFecha = (f: string) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10))));
const dias = (hoy: string, f: string) => Math.round((Date.parse(hoy) - Date.parse(f)) / 86400000);

type Tono = 'ok' | 'warn' | 'bad' | 'mut' | 'acc';
function pintar(cell: ExcelJS.Cell, tono: Tono) {
  const fill = { ok: C.ok, warn: C.warn, bad: C.bad, mut: C.mut, acc: C.acc }[tono];
  const txt = { ok: C.okTxt, warn: C.warnTxt, bad: C.badTxt, mut: C.mutTxt, acc: 'FF9A3412' }[tono];
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: txt } };
}

interface Columna { titulo: string; ancho: number; fmt?: string; wrap?: boolean }

/** Hoja con título, subtítulo, encabezado oscuro fijo, filtros y filas en banda. Devuelve la fila del encabezado. */
function hoja(wb: ExcelJS.Workbook, nombre: string, titulo: string, sub: string, cols: Columna[], filas: unknown[][]) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = cols.map((c) => ({ width: c.ancho }));
  ws.getCell('A1').value = titulo;
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: C.titulo } };
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { size: 10, color: { argb: C.sub } };
  const h = ws.getRow(4);
  cols.forEach((c, i) => {
    const cell = h.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = { bold: true, color: { argb: C.headTxt } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  h.height = 30;
  filas.forEach((f, r) => {
    const row = ws.getRow(5 + r);
    f.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v as ExcelJS.CellValue;
      if (cols[i].fmt) cell.numFmt = cols[i].fmt!;
      cell.alignment = { vertical: 'top', wrapText: !!cols[i].wrap };
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.banda } };
      cell.border = { bottom: { style: 'thin', color: { argb: C.linea } } };
    });
  });
  if (filas.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: cols.length } };
  else {
    ws.getCell('A5').value = 'Sin registros en este período.';
    ws.getCell('A5').font = { italic: true, color: { argb: C.sub } };
  }
  return ws;
}

export async function generarReporteBitacora(d: DatosReporte): Promise<ArrayBuffer> {
  const { hoy, mes } = d;
  const periodo = nombreMes(mes);
  const enMes = (a: BitAccion) => a.fecha.slice(0, 7) === mes;
  const delMes = d.acciones.filter(enMes);
  const tienda = new Map(d.tiendas.map((t) => [t.codigo, t]));
  const ejNombre = new Map(d.ejecutivos.map((e) => [e.id, e.nombre]));
  const persona = new Map(d.perfiles.map((p) => [p.id, { nombre: p.nombre || 'Usuario', cargo: p.cargo || '' }]));
  const quien = (id: string) => persona.get(id) ?? { nombre: 'Usuario', cargo: '' };
  const sumar = (l: BitAccion[], k: 'unidades' | 'costo') => l.reduce((n, a) => n + (a[k] ?? 0), 0);
  const cuenta = (l: BitAccion[], tipo: string) => l.filter((a) => a.tipo === tipo).length;
  const sub = `Zona ${d.zona} | ${periodo} | generado el ${hoy.slice(8, 10)}-${hoy.slice(5, 7)}-${hoy.slice(0, 4)} por ${d.generadoPor}`;

  // Por tienda (estado de visita calculado a hoy, como en la web)
  const porTienda = d.tiendas.map((t) => {
    const todas = d.acciones.filter((a) => a.tienda_codigo === t.codigo).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const mesT = todas.filter(enMes);
    // Cualquier acción cuenta como visita: la última visita es la última acción registrada.
    const ultVisita = todas[0]?.fecha ?? null;
    const sinVisita = ultVisita ? dias(hoy, ultVisita) : null;
    const ventas = mesT.filter((a) => a.tipo === 'venta');
    const porEj = new Map<number, number>();
    ventas.forEach((a) => a.ejecutivo_id && porEj.set(a.ejecutivo_id, (porEj.get(a.ejecutivo_id) ?? 0) + (a.unidades ?? 0)));
    const top = [...porEj.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      t, ultVisita, sinVisita,
      estado: sinVisita == null ? 'Sin visitas' : sinVisita <= 7 ? 'Al día' : sinVisita <= 14 ? 'Atención' : 'Sin visita reciente',
      visitas: new Set(mesT.map((a) => a.fecha)).size,
      equipos: sumar(ventas, 'unidades'),
      top: top ? `${ejNombre.get(top[0]) ?? 'Ejecutivo'} (${top[1]})` : '',
      incentivos: sumar(mesT.filter((a) => a.tipo === 'incentivo'), 'costo'),
      pend: todas.filter((a) => a.pendiente && !a.hecho).length,
      acciones: mesT.length,
    };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = d.generadoPor;
  wb.created = new Date();

  // ---------- Resumen ----------
  const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 38 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  ws.getCell('A1').value = `Reporte de Bitácora | ${periodo}`;
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: C.titulo } };
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { size: 10, color: { argb: C.sub } };

  const titulo = (fila: number, texto: string) => {
    const c = ws.getCell(`A${fila}`);
    c.value = texto;
    c.font = { bold: true, size: 12 };
  };
  const encabezado = (fila: number, textos: string[]) => {
    textos.forEach((t, i) => {
      const c = ws.getRow(fila).getCell(i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: C.headTxt } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
      c.alignment = { vertical: 'middle', horizontal: i ? 'center' : 'left', wrapText: true };
    });
    ws.getRow(fila).height = 30;
  };
  const filaDatos = (fila: number, vals: (string | number)[], fmts: (string | undefined)[] = []) => {
    vals.forEach((v, i) => {
      const c = ws.getRow(fila).getCell(i + 1);
      c.value = v;
      if (fmts[i]) c.numFmt = fmts[i]!;
      c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle' };
      c.border = { bottom: { style: 'thin', color: { argb: C.linea } } };
    });
  };

  const visitadas = new Set(delMes.map((a) => a.tienda_codigo)).size;
  const visitasDe = (l: BitAccion[]) => new Set(l.map((a) => `${a.tienda_codigo}|${a.fecha}`)).size;
  const sinVisita14 = porTienda.filter((r) => r.sinVisita == null || r.sinVisita > 14).length;
  const pendMes = delMes.filter((a) => a.pendiente);
  const pendAbiertos = d.acciones.filter((a) => a.pendiente && !a.hecho).length;
  let f = 4;
  titulo(f++, 'Indicadores del mes');
  encabezado(f++, ['Indicador', 'Valor', 'Detalle']);
  ws.mergeCells(`C${f - 1}:F${f - 1}`);
  const kpis: [string, number, string | undefined, string, Tono?][] = [
    ['Visitas realizadas', visitasDe(delMes), FMT.int, 'una por tienda y día con cualquier acción registrada'],
    ['Tiendas visitadas', visitadas, FMT.int, `de ${d.tiendas.length} tiendas activas`],
    ['Tiendas sin visita hace más de 14 días', sinVisita14, FMT.int, 'calculado a la fecha del reporte', sinVisita14 ? 'bad' : 'ok'],
    ['Equipos vendidos (registrados)', sumar(delMes.filter((a) => a.tipo === 'venta'), 'unidades'), FMT.int, `${cuenta(delMes, 'venta')} registros de venta`],
    ['Incentivos entregados', cuenta(delMes, 'incentivo'), FMT.int, ''],
    ['Gasto en incentivos', sumar(delMes.filter((a) => a.tipo === 'incentivo'), 'costo'), FMT.clp, 'pesos chilenos', 'acc'],
    ['Capacitaciones', cuenta(delMes, 'capacitacion'), FMT.int, ''],
    ['Implementaciones', cuenta(delMes, 'implementacion'), FMT.int, ''],
    ['Observaciones', cuenta(delMes, 'observacion'), FMT.int, ''],
    ['Pendientes registrados en el mes', pendMes.length, FMT.int, (() => { const r = pendMes.filter((a) => a.hecho).length; return r === 1 ? '1 ya resuelto' : `${r} ya resueltos`; })()],
    ['Pendientes abiertos (todas las fechas)', pendAbiertos, FMT.int, 'en todas las tiendas', pendAbiertos ? 'warn' : 'ok'],
  ];
  for (const [k, v, fm, det, tono] of kpis) {
    filaDatos(f, [k, v, det], [undefined, fm]);
    ws.mergeCells(`C${f}:F${f}`);
    ws.getCell(`C${f}`).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell(`C${f}`).font = { color: { argb: C.sub } };
    ws.getCell(`B${f}`).font = { bold: true };
    if (tono) pintar(ws.getCell(`B${f}`), tono);
    f++;
  }

  f += 1;
  titulo(f++, 'Por persona (quién registró)');
  encabezado(f++, ['Persona', 'Cargo', 'Visitas', 'Ventas reg.', 'Equipos', 'Incentivos', 'Gasto', 'Capacitac.', 'Implement.', 'Total acciones']);
  const autores = [...new Set(delMes.map((a) => a.creado_por))]
    .map((id) => ({ id, l: delMes.filter((a) => a.creado_por === id) }))
    .sort((a, b) => b.l.length - a.l.length);
  if (!autores.length) filaDatos(f++, ['Sin registros en el mes']);
  for (const { id, l } of autores) {
    const p = quien(id);
    filaDatos(f++, [p.nombre, p.cargo || '-', visitasDe(l), cuenta(l, 'venta'), sumar(l.filter((a) => a.tipo === 'venta'), 'unidades'),
      cuenta(l, 'incentivo'), sumar(l.filter((a) => a.tipo === 'incentivo'), 'costo'), cuenta(l, 'capacitacion'), cuenta(l, 'implementacion'), l.length],
    [undefined, undefined, FMT.int, FMT.int, FMT.int, FMT.int, FMT.clp, FMT.int, FMT.int, FMT.int]);
  }

  f += 1;
  titulo(f++, 'Por ciudad');
  encabezado(f++, ['Ciudad', 'Tiendas', 'Visitadas', 'Visitas', 'Sin visita +14 d', 'Equipos', 'Gasto incentivos', 'Pendientes abiertos']);
  for (const ciudad of [...new Set(d.tiendas.map((t) => t.ciudad))].sort((a, b) => a.localeCompare(b, 'es'))) {
    const rs = porTienda.filter((r) => r.t.ciudad === ciudad);
    filaDatos(f++, [ciudad, rs.length, rs.filter((r) => r.visitas > 0).length, rs.reduce((n, r) => n + r.visitas, 0),
      rs.filter((r) => r.sinVisita == null || r.sinVisita > 14).length, rs.reduce((n, r) => n + r.equipos, 0),
      rs.reduce((n, r) => n + r.incentivos, 0), rs.reduce((n, r) => n + r.pend, 0)],
    [undefined, FMT.int, FMT.int, FMT.int, FMT.int, FMT.int, FMT.clp, FMT.int]);
  }
  f += 1;
  ws.getCell(`A${f}`).value = 'Cómo leer: cualquier acción registrada en una tienda cuenta como visita (una por tienda y día). "Al día" = visitada en los últimos 7 días; "Atención" = 8 a 14 días; "Sin visita reciente" = más de 14 días. '
    + 'Nivel del ejecutivo según su parte de los equipos Honor vendidos en la tienda en el mes: Alto 40 % o más, Medio 15-39 %, Bajo < 15 %.';
  ws.mergeCells(`A${f}:J${f + 1}`);
  ws.getCell(`A${f}`).alignment = { wrapText: true, vertical: 'top' };
  ws.getCell(`A${f}`).font = { italic: true, size: 9, color: { argb: C.sub } };

  // ---------- Por tienda ----------
  const ordenT = [...porTienda].sort((a, b) => (b.sinVisita ?? 9999) - (a.sinVisita ?? 9999) || a.t.nombre.localeCompare(b.t.nombre));
  const wsT = hoja(wb, 'Por tienda', `Estado por tienda | ${periodo}`, sub + ' | ordenado de la que lleva más tiempo sin visita', [
    { titulo: 'Tienda', ancho: 34 }, { titulo: 'Código', ancho: 14 }, { titulo: 'Cliente', ancho: 12 }, { titulo: 'Ciudad', ancho: 12 },
    { titulo: 'Cobertura', ancho: 18 }, { titulo: 'Estado visita', ancho: 18 }, { titulo: 'Última visita', ancho: 13, fmt: FMT.fecha },
    { titulo: 'Días sin visita', ancho: 10, fmt: FMT.int }, { titulo: 'Visitas en el mes', ancho: 10, fmt: FMT.int },
    { titulo: 'Equipos vendidos', ancho: 10, fmt: FMT.int }, { titulo: 'Mejor ejecutivo (equipos)', ancho: 24 },
    { titulo: 'Gasto incentivos', ancho: 13, fmt: FMT.clp }, { titulo: 'Pendientes abiertos', ancho: 11, fmt: FMT.int },
    { titulo: 'Acciones en el mes', ancho: 10, fmt: FMT.int },
  ], ordenT.map((r) => [r.t.nombre, r.t.codigo, r.t.cliente, r.t.ciudad, r.t.cobertura, r.estado,
    r.ultVisita ? aFecha(r.ultVisita) : '-', r.sinVisita ?? '-', r.visitas, r.equipos, r.top || '-', r.incentivos, r.pend, r.acciones]));
  ordenT.forEach((r, i) => {
    const row = wsT.getRow(5 + i);
    pintar(row.getCell(6), r.estado === 'Al día' ? 'ok' : r.estado === 'Atención' ? 'warn' : 'bad');
    if (r.pend) pintar(row.getCell(13), 'warn');
  });

  // ---------- Ranking ejecutivos ----------
  const ranking = d.tiendas.flatMap((t) => {
    const ventas = delMes.filter((a) => a.tienda_codigo === t.codigo && a.tipo === 'venta');
    const total = sumar(ventas, 'unidades');
    const conMov = new Set(delMes.filter((a) => a.tienda_codigo === t.codigo && a.ejecutivo_id).map((a) => a.ejecutivo_id));
    return d.ejecutivos.filter((e) => e.tienda_codigo === t.codigo && (e.activo || conMov.has(e.id))).map((e) => {
      const u = sumar(ventas.filter((a) => a.ejecutivo_id === e.id), 'unidades');
      const share = total ? u / total : 0;
      const incs = delMes.filter((a) => a.tipo === 'incentivo' && a.ejecutivo_id === e.id);
      return { t, e, u, total, share, nivel: !u ? 'Sin ventas' : share >= NIVEL_ALTO ? 'Alto' : share >= NIVEL_MEDIO ? 'Medio' : 'Bajo', inc: incs.length, costo: sumar(incs, 'costo') };
    });
  }).sort((a, b) => a.t.nombre.localeCompare(b.t.nombre) || b.u - a.u);
  const wsR = hoja(wb, 'Ranking ejecutivos', `Ranking de ejecutivos | ${periodo}`, sub + ' | según equipos Honor registrados en la tienda', [
    { titulo: 'Tienda', ancho: 34 }, { titulo: 'Ciudad', ancho: 12 }, { titulo: 'Ejecutivo', ancho: 24 },
    { titulo: 'Equipos vendidos', ancho: 10, fmt: FMT.int }, { titulo: 'Total tienda', ancho: 10, fmt: FMT.int },
    { titulo: '% de la tienda', ancho: 10, fmt: FMT.pct }, { titulo: 'Nivel', ancho: 12 },
    { titulo: 'Incentivos recibidos', ancho: 11, fmt: FMT.int }, { titulo: 'Gasto incentivos', ancho: 13, fmt: FMT.clp },
  ], ranking.map((r) => [r.t.nombre, r.t.ciudad, r.e.activo ? r.e.nombre : `${r.e.nombre} (de baja)`, r.u, r.total, r.total ? r.share : '-', r.nivel, r.inc, r.costo]));
  ranking.forEach((r, i) => pintar(wsR.getRow(5 + i).getCell(7), r.nivel === 'Alto' ? 'ok' : r.nivel === 'Medio' ? 'warn' : r.nivel === 'Bajo' ? 'bad' : 'mut'));

  // ---------- Incentivos ----------
  const incs = delMes.filter((a) => a.tipo === 'incentivo').sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const wsI = hoja(wb, 'Incentivos', `Incentivos y regalos | ${periodo}`, sub, [
    { titulo: 'Fecha', ancho: 12, fmt: FMT.fecha }, { titulo: 'Tienda', ancho: 34 }, { titulo: 'Ciudad', ancho: 12 },
    { titulo: 'Ejecutivo', ancho: 22 }, { titulo: 'Qué se entregó', ancho: 46, wrap: true }, { titulo: 'Costo', ancho: 12, fmt: FMT.clp },
    { titulo: 'Registrado por', ancho: 20 },
  ], incs.map((a) => [aFecha(a.fecha), tienda.get(a.tienda_codigo)?.nombre ?? a.tienda_codigo, tienda.get(a.tienda_codigo)?.ciudad ?? '',
    a.ejecutivo_id ? ejNombre.get(a.ejecutivo_id) ?? '-' : '-', a.detalle || '-', a.costo ?? 0, quien(a.creado_por).nombre]));
  if (incs.length) {
    const tr = wsI.getRow(5 + incs.length);
    tr.getCell(5).value = 'Total del mes';
    tr.getCell(6).value = { formula: `SUM(F5:F${4 + incs.length})`, result: sumar(incs, 'costo') };
    tr.getCell(6).numFmt = FMT.clp;
    [5, 6].forEach((i) => pintar(tr.getCell(i), 'acc'));
  }

  // ---------- Pendientes ----------
  const pends = d.acciones.filter((a) => a.pendiente && (!a.hecho || enMes(a)))
    .sort((a, b) => Number(a.hecho) - Number(b.hecho) || (a.fecha < b.fecha ? -1 : 1));
  const wsP = hoja(wb, 'Pendientes', 'Pendientes', sub + ' | todos los abiertos y los registrados en el mes', [
    { titulo: 'Estado', ancho: 11 }, { titulo: 'Fecha', ancho: 12, fmt: FMT.fecha }, { titulo: 'Días abierto', ancho: 9, fmt: FMT.int },
    { titulo: 'Tienda', ancho: 34 }, { titulo: 'Ciudad', ancho: 12 }, { titulo: 'Tipo', ancho: 16 },
    { titulo: 'Detalle', ancho: 54, wrap: true }, { titulo: 'Registrado por', ancho: 20 },
  ], pends.map((a) => [a.hecho ? 'Resuelto' : 'Abierto', aFecha(a.fecha), a.hecho ? '-' : dias(hoy, a.fecha),
    tienda.get(a.tienda_codigo)?.nombre ?? a.tienda_codigo, tienda.get(a.tienda_codigo)?.ciudad ?? '', TIPO[a.tipo] ?? a.tipo, a.detalle || '-', quien(a.creado_por).nombre]));
  pends.forEach((a, i) => pintar(wsP.getRow(5 + i).getCell(1), a.hecho ? 'ok' : 'warn'));

  // ---------- Registro completo ----------
  const reg = [...delMes].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));
  hoja(wb, 'Registro', `Registro completo | ${periodo}`, sub + ' | todas las acciones del mes, de la más reciente a la más antigua', [
    { titulo: 'Fecha', ancho: 12, fmt: FMT.fecha }, { titulo: 'Tienda', ancho: 34 }, { titulo: 'Ciudad', ancho: 12 }, { titulo: 'Tipo', ancho: 18 },
    { titulo: 'Ejecutivo', ancho: 20 }, { titulo: 'Equipos', ancho: 9, fmt: FMT.int }, { titulo: 'Costo', ancho: 11, fmt: FMT.clp },
    { titulo: 'Detalle', ancho: 54, wrap: true }, { titulo: 'Pendiente', ancho: 11 }, { titulo: 'Registrado por', ancho: 18 }, { titulo: 'Cargo', ancho: 16 },
  ], reg.map((a) => [aFecha(a.fecha), tienda.get(a.tienda_codigo)?.nombre ?? a.tienda_codigo, tienda.get(a.tienda_codigo)?.ciudad ?? '', TIPO[a.tipo] ?? a.tipo,
    a.ejecutivo_id ? ejNombre.get(a.ejecutivo_id) ?? '-' : '-', a.tipo === 'venta' ? a.unidades ?? 0 : null, a.tipo === 'incentivo' ? a.costo ?? 0 : null,
    a.detalle || '-', a.pendiente ? (a.hecho ? 'Resuelto' : 'Abierto') : '', quien(a.creado_por).nombre, quien(a.creado_por).cargo || '-']));

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
