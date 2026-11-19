import ExcelJS from 'exceljs';
import { CLUSTERS, coberturaEntel, fechaEntel, nombreSemana, numeroPrioridad, sumar, sumarDias, type FotoPrioridad, type FotoProducto, type FotoRespuesta, type FotoTienda } from './foto';

/**
 * Excel de una semana con el formato del archivo "Foto del Éxito ENTEL":
 * una fila por tienda, 1/0 por producto, fecha, comentarios, mesas genéricas (1 a 8) y total de equipos.
 * Se carga solo cuando alguien lo pide (import dinámico).
 */
export async function excelFotoSemana(
  semana: string, columnas: FotoProducto[], tiendas: FotoTienda[], respuestas: FotoRespuesta[], prioridades: FotoPrioridad[],
): Promise<ArrayBuffer> {
  const porTienda = new Map(respuestas.map((r) => [r.tienda_codigo, r]));
  const wb = new ExcelJS.Workbook();
  const H = 8; // fila de encabezados: arriba van el título, las prioridades por cluster y el grupo de mesas
  const [y, m, d] = semana.split('-');
  const ws = wb.addWorksheet(`Semana ${d}-${m}`, { views: [{ state: 'frozen', xSplit: 5, ySplit: H }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });

  const fijos = ['B2B CODE', 'Short code', 'CODE HONOR+', 'Cluster', 'STORE', 'MERCHANDISER', 'COVERAGE TYPE'];
  const finales = ['FECHA', 'COMENTARIOS', 'CANTIDAD DE MESAS GENERICA X TIENDA', '1', '2', '3', '4', '5', '6', '7', '8', 'TOTAL EQUIPOS'];
  const encabezado = [...fijos, ...columnas.map((p) => p.nombre.toUpperCase()), ...finales];
  const nProd = columnas.length;
  const cFecha = fijos.length + nProd + 1;
  const cMesa1 = cFecha + 3;

  // Fila 1: título. Filas 2 a 6: prioridades por cluster. Fila 7: grupo de mesas genéricas. Fila 8: encabezados.
  ws.getCell(1, 1).value = `Foto del Éxito ENTEL | Semana ${nombreSemana(semana)} ${y} (${d}/${m} al ${sumarDias(semana, 6).split('-').reverse().slice(0, 2).join('/')})`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  const verde = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF00FF00' } };
  const borde = { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } };
  const cCl = fijos.length; // columna COVERAGE TYPE: etiqueta de cluster
  ws.getCell(2, cCl).value = 'Cluster';
  ws.getCell(2, cCl).border = borde;
  if (nProd) {
    ws.mergeCells(2, cCl + 1, 2, cCl + nProd);
    const t = ws.getCell(2, cCl + 1);
    t.value = 'PRIORIDADES';
    t.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
    t.alignment = { horizontal: 'center' };
  }
  CLUSTERS.forEach((cl, k) => {
    const fila = 3 + k;
    ws.getCell(fila, cCl).value = cl;
    ws.getCell(fila, cCl).border = borde;
    columnas.forEach((p, i) => {
      const c = ws.getCell(fila, cCl + 1 + i);
      c.value = numeroPrioridad(prioridades, p.id, cl);
      c.fill = verde;
      c.border = borde;
      c.alignment = { horizontal: 'center' };
      c.font = { size: 9 };
    });
  });

  ws.mergeCells(H - 1, cMesa1, H - 1, cMesa1 + 7);
  const g = ws.getCell(H - 1, cMesa1);
  g.value = 'CANTIDAD DE EQUIPOS X MESA GENERICA (NO DE MARCA)';
  g.font = { bold: true };
  g.alignment = { horizontal: 'center' };
  g.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

  const azul = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF00B0F0' } };
  encabezado.forEach((t, i) => {
    const c = ws.getCell(H, i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: i < fijos.length + nProd || i === cFecha - 1 || i === cFecha ? 'FFFFFFFF' : 'FF000000' }, size: 9 };
    if (i < fijos.length + nProd + 2) c.fill = azul;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  ws.getRow(H).height = 42;

  tiendas.forEach((t, k) => {
    const r = porTienda.get(t.codigo);
    const ex = new Set(r?.exhibidos ?? []);
    const pedidos = new Set(r?.pedidos ?? []);
    const mesas = r?.mesas ?? [];
    const fila: (string | number | null)[] = [
      t.codigo_b2b ?? '', t.codigo_corto ?? '', t.codigo, t.cluster ?? '', t.tienda.toUpperCase(), t.merchandiser ?? '', coberturaEntel(t.cobertura),
      ...columnas.map((p) => (!r || !pedidos.has(p.id) ? null : ex.has(p.id) ? 1 : 0)),
      r ? fechaEntel(r.updated_at) : '', r ? r.comentario : 'Sin respuesta esta semana',
      r ? mesas.length : null, ...Array.from({ length: 8 }, (_, i) => (mesas[i] ?? null)), r ? sumar(mesas) : null,
    ];
    const row = ws.getRow(H + 1 + k);
    fila.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = { size: 9, color: { argb: !r && i === cFecha ? 'FFC00000' : 'FF000000' } };
      c.alignment = { horizontal: i >= fijos.length && i !== cFecha ? 'center' : 'left', vertical: 'middle' };
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // Anchos (columnas numeradas desde 1): fijas, productos, fecha, comentarios, mesas y total.
  [13, 10, 14, 8, 40, 32, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  columnas.forEach((_, i) => { ws.getColumn(fijos.length + 1 + i).width = 11; });
  for (let i = 0; i < 8; i++) ws.getColumn(cMesa1 + i).width = 6;
  ws.getColumn(cFecha).width = 12;
  ws.getColumn(cFecha + 1).width = 42;
  ws.getColumn(cFecha + 2).width = 14;
  ws.getColumn(cFecha + 11).width = 10;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
